import WORKER_JS_SOURCE from "../../dist/tmp/wasm_plugin_worker.js" with { type: "text" };
import DRAW_WORKER_JS_SOURCE from "../../dist/tmp/draw_worker.js" with { type: "text" };
import { CardFace, CardItem, DeckData } from "../data/deck.ts";
import type {
    DrawWorkerEventData,
    DrawWorkerInitRequest,
    WasmWorkerEventData,
    WasmWorkerRequestGenerateCardFace,
} from "./wasm_worker_msg.d.ts";

const makeBlobUrl = (source: string) => {
    const blob = new Blob([source], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    return url;
};
const WORKER_BLOB_URL = makeBlobUrl(WORKER_JS_SOURCE);
const DRAW_WORKER_BLOB_URL = makeBlobUrl(DRAW_WORKER_JS_SOURCE);

export class CardMakerRuntimeError extends Error {
    constructor(msg?: string) {
        super(msg);
    }
}

export class GenerateCardFaceRunner {
    #worker: Worker;
    #drawWorker: Worker;
    start: () => void;
    constructor(
        deck: DeckData,
        card: CardItem,
        faceObjOrText: CardFace | "front" | "back",
        onOutput?: (data: string) => void,
        onDraw?: (bitmap: ImageBitmap) => void,
        onFinish?: () => void,
        onError?: (errMsg: string) => void,
    ) {
        let face: CardFace | "front" | "back" | undefined = faceObjOrText;
        if (typeof face === "string") {
            if (face === "front") face = deck.getCardFaceById(card.frontFaceId);
            else if (face === "back") face = deck.getCardFaceById(card.backFaceId);
        }
        // finish guard, finish or error.
        let settled = false;
        const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            this.terminate();
            fn();
        };
        const cd = globalThis.structuredClone(deck.getDeck()); // snapshot current deck
        // wasm worker ↔ draw worker 之间的绘图指令通道
        const channel = new MessageChannel();
        // draw worker：跑 DrawingQueue，画好的画面回传主线程
        this.#drawWorker = new Worker(DRAW_WORKER_BLOB_URL);
        this.#drawWorker.addEventListener("message", (event: MessageEvent<DrawWorkerEventData>) => {
            const data = event.data;
            if (data.action === "bitmap") {
                const bitmap = data.params;
                const result = onDraw?.(bitmap) ?? {};
                if (result instanceof Promise) {
                    result.finally(() => bitmap.close());
                } else {
                    bitmap.close();
                }
            } else if (data.action === "error") {
                settle(() => onError?.(data.params));
            }
        });
        const initMsg: DrawWorkerInitRequest = {
            action: "init",
            params: {
                deck: cd,
                card: card,
                face: face,
            },
        };
        this.#drawWorker.postMessage(initMsg, { transfer: [channel.port2] });
        // wasm worker
        this.#worker = new Worker(WORKER_BLOB_URL);
        this.#worker.addEventListener("message", (event: MessageEvent<WasmWorkerEventData>) => {
            if (event.data.action === "output") {
                onOutput?.(event.data.params);
            } else if (event.data.action === "finish") {
                // worker 内已等 Draw worker 画完才发 finish，这里无需再排队等待
                settle(() => onFinish?.());
            } else if (event.data.action === "error") {
                settle(() => onError?.(event.data.params));
            }
        });
        // call the worker
        this.start = () => {
            const msg: WasmWorkerRequestGenerateCardFace = {
                action: "generateCardFace",
                params: {
                    deck: cd,
                    card: card,
                    face: face,
                },
            };
            this.#worker.postMessage(msg, { transfer: [channel.port1] });
        };
    }
    terminate() {
        this.#worker.terminate();
        this.#drawWorker.terminate();
    }
}
