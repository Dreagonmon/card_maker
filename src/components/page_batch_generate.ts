import { zip } from "fflate";
import { globalDeck } from "../data/global_deck.ts";
import { CardDeck, CardItem, DeckData } from "../data/deck.ts";
import { GenerateCardFaceRunner } from "../ext/wasm_runtime_helper.ts";
import "../font.css";

interface BatchTask {
    card: CardItem;
    face: "front" | "back";
}

/** 文件名安全化：替换文件系统保留字符。 */
const sanitizeFile = (name: string) => {
    return name.replaceAll(/[\\/:*?"<>|]/g, "_").trim();
};

/** 并发数：按硬件情况，1~4。 */
const parallelCount = () => {
    const hw = (navigator as { hardwareConcurrency?: number }).hardwareConcurrency ?? 4;
    return Math.max(1, Math.min(4, Math.floor(hw / 2)));
};

export class PageBatchGenerate extends HTMLElement {
    static readonly TAG_NAME = "page-batch-generate";
    #root: ShadowRoot;
    #buttonRun: HTMLButtonElement;
    #buttonStop: HTMLButtonElement;
    #progress: HTMLProgressElement;
    #status: HTMLSpanElement;
    #running = false;
    #cancelled = false;
    #activeRunners = new Set<GenerateCardFaceRunner>();

    constructor() {
        super();
        this.#root = this.attachShadow({ mode: "open" });
        this.#root.innerHTML = /*html*/ `
        <style>
            :host {
                display: block;
                width: 100%;
                height: 100%;
                overflow-y: auto;
            }
            :host * {
                box-sizing: border-box;
            }
            .page {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 0.5rem;
                gap: 0.5rem;
            }
            .op {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                width: 100%;
                max-width: 36rem;
            }
            progress {
                flex: 1 1 auto;
                min-width: 0;
                height: 1.2rem;
            }
        </style>
        <div class="page">
            <h1>批量生成</h1>
            <div class="op">
                <button id="run" type="button">生成</button>
                <button id="stop" type="button" disabled>终止</button>
            </div>
            <div class="op">
                <progress id="progress" max="1" value="0"></progress>
                <span id="status"></span>
            </div>
        </div>
        `;
        this.#buttonRun = this.#root.querySelector("#run") as HTMLButtonElement;
        this.#buttonStop = this.#root.querySelector("#stop") as HTMLButtonElement;
        this.#progress = this.#root.querySelector("#progress") as HTMLProgressElement;
        this.#status = this.#root.querySelector("#status") as HTMLSpanElement;
        this.#buttonRun.addEventListener("click", () => this.#start());
        this.#buttonStop.addEventListener("click", () => this.#stop());
    }

    #setStatus(text: string) {
        this.#status.textContent = text;
    }

    #setButtons(running: boolean) {
        this.#buttonRun.disabled = running;
        this.#buttonStop.disabled = !running;
    }

    #stop() {
        if (!this.#running) return;
        this.#cancelled = true;
        const runners = [...this.#activeRunners];
        this.#activeRunners.clear(); // 让各 runOne 的轮询察觉并收尾
        for (const runner of runners) {
            runner.terminate();
        }
    }

    #buildTasks(deck: CardDeck): BatchTask[] {
        const tasks: BatchTask[] = [];
        for (const card of deck.cardItems) {
            const faces: [number, "front" | "back"][] = [
                [card.frontFaceId, "front"],
                [card.backFaceId, "back"],
            ];
            for (const [faceId, face] of faces) {
                if (faceId <= 0) continue;
                if (!deck.cardFaces.some((f) => f.id === faceId)) continue;
                tasks.push({ card, face });
            }
        }
        return tasks;
    }

    /** 跑一张卡；finish/error/被终止 都会 resolve（至多一次）。 */
    #runOne(deckData: DeckData, task: BatchTask, results: Map<string, Blob>, onDone: () => void) {
        return new Promise<void>((resolve) => {
            const key = `${sanitizeFile(task.card.name) || `card_${task.card.id}`}-${task.face}`;
            let settled = false;
            let runner: GenerateCardFaceRunner;
            const poll = setInterval(() => {
                // 终止路径不会触发 finish/error 回调；轮询兜底
                if (this.#cancelled && !this.#activeRunners.has(runner)) {
                    finish();
                }
            }, 100);
            const finish = () => {
                if (settled) return;
                settled = true;
                clearInterval(poll);
                this.#activeRunners.delete(runner);
                onDone();
                resolve();
            };
            runner = new GenerateCardFaceRunner(
                deckData,
                task.card,
                task.face,
                undefined, // onOutput
                undefined, // onDraw
                async (bitmap) => {
                    if (bitmap) {
                        // 转 PNG；runner 在本回调 settle 后回收原图
                        const cv = new OffscreenCanvas(bitmap.width, bitmap.height);
                        cv.getContext("2d")!.drawImage(bitmap, 0, 0);
                        const blob = await cv.convertToBlob({ type: "image/png" });
                        results.set(key, blob);
                    }
                    finish();
                },
                (errMsg) => {
                    console.error(`[batch] card ${key}: ${errMsg}`);
                    finish();
                },
            );
            this.#activeRunners.add(runner);
            runner.start();
        });
    }

    async #start() {
        if (this.#running) return;
        const tasks = this.#buildTasks(globalDeck.getDeck());
        if (tasks.length === 0) {
            this.#setStatus("没有可生成的卡牌");
            return;
        }
        // 快照牌组：跑批期间用户改设置不影响本批
        const snapshot: CardDeck = structuredClone(globalDeck.getDeck());
        const deckData = new DeckData();
        deckData.setDeck(snapshot);

        this.#running = true;
        this.#cancelled = false;
        this.#setButtons(true);
        this.#progress.max = tasks.length;
        this.#progress.value = 0;
        this.#setStatus(`0 / ${tasks.length}`);

        const results = new Map<string, Blob>();
        let failed = 0;
        let done = 0;
        let nextIndex = 0;
        const concurrency = parallelCount();

        const onDone = () => {
            done++;
            if (!this.#cancelled) {
                this.#progress.value = done;
                this.#setStatus(`${done} / ${tasks.length}`);
            }
        };

        // 并发池：每个槽位从队列取任务
        const pool = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
            while (!this.#cancelled) {
                const i = nextIndex++;
                if (i >= tasks.length) break;
                const task = tasks[i];
                const before = results.size;
                await this.#runOne(deckData, task, results, onDone);
                if (results.size === before && !this.#cancelled) failed++;
            }
        });
        await Promise.all(pool);

        this.#running = false;
        this.#activeRunners.clear();
        this.#setButtons(false);

        if (this.#cancelled) {
            this.#setStatus(`已终止（完成 ${results.size}）`);
            return;
        }
        if (results.size === 0) {
            this.#setStatus(`全部失败（${failed}）`);
            return;
        }
        this.#setStatus(`打包中…（成功 ${results.size}，失败 ${failed}）`);
        try {
            const folder = sanitizeFile(snapshot.name) || "deck";
            const files: Record<string, Uint8Array> = {};
            for (const [key, blob] of results) {
                files[`${folder}/${key}.png`] = new Uint8Array(await blob.arrayBuffer());
            }
            const zipped = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
                zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data)));
            });
            const url = URL.createObjectURL(new Blob([zipped], { type: "application/zip" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `${folder}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            this.#setStatus(`完成（成功 ${results.size}，失败 ${failed}）`);
        } catch (e) {
            this.#setStatus(`打包失败：${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

export const defineCustomElements = () => {
    customElements.define(PageBatchGenerate.TAG_NAME, PageBatchGenerate);
};
