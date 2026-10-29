import { globalDeck } from "../data/global_deck.ts";
import { GenerateCardFaceRunner } from "../ext/wasm_runtime_helper.ts";
import "../font.css";

export class PanelGenerateCard extends HTMLElement {
    static readonly TAG_NAME = "panel-generate-card";
    #root: ShadowRoot;
    #buttonGenerate: HTMLButtonElement;
    #canvas: HTMLCanvasElement;
    #consoleHistory: HTMLPreElement;
    #consoleLine: HTMLPreElement;
    #generatingController: AbortController = new AbortController();
    constructor() {
        super();
        this.#root = this.attachShadow({ mode: "open" });
        this.#root.innerHTML = /*html*/ `
        <style>
            :host {
                display: flex;
                flex-direction: column;
                align-items: center;
                box-sizing: border-box;
                width: 100%;
                height: 100%;
            }
            :host * {
                box-sizing: border-box;
            }
            .op-panel {
                flex: 0 0 auto;
                width: 100%;
                max-width: min(32rem, 100%);
                display: flex;
                gap: 0.5rem;
                padding: 0.5rem
            }
            .op-panel select {
                flex: 1 1 auto;
                min-width: 0;
            }
            .op-panel button {
                flex: 0 0 auto;
            }
            :host canvas {
                flex: 1 1 auto;
                background: gray;
                width: 100%;
                object-fit: contain;
            }
            .console {
                flex: 0 0 auto;
                height: 16rem;
                width: 100%;
                color: white;
                background: black;
                padding: 0.5rem;
                overflow: hidden auto;
                scrollbar-width: none;
                -ms-overflow-style: none;
            }
            .console ::-webkit-scrollbar {
                display: none;
            }
            .console pre {
                width: 100%;
                font-family: "Departure Mono", "Cascadia Code", "JetBrains Mono", "Consolas", monospace;
                font-size: 11px;
                line-height: normal;
                display: block;
                margin: 0;
                padding: 0;
                white-space: pre-wrap;
                word-break: break-all;
            }
        </style>
        <div class="op-panel">
            <span>卡牌:</span>
            <select id="card-id"></select>
            <select id="card-face">
                <option value="front" selected>正面</option>
                <option value="back">背面</option>
            </select>
            <button id="generate">生成</button>
        </div>
        <canvas></canvas>
        <div class="console">
            <pre id="c-history"></pre>
            <pre id="c-line"></pre>
        </div>
        `;
        // element
        this.#buttonGenerate = this.#root.querySelector("#generate") as HTMLButtonElement;
        this.#canvas = this.#root.querySelector("canvas") as HTMLCanvasElement;
        this.#consoleHistory = this.#root.querySelector("#c-history") as HTMLPreElement;
        this.#consoleLine = this.#root.querySelector("#c-line") as HTMLPreElement;
        // event
        this.#buttonGenerate.addEventListener("click", () => {
            this.actionGenerateCard();
        });
        // options
        const buildOptions = () => {
            const items = globalDeck.getDeck().cardItems;
            const select = this.#root.querySelector("#card-id") as HTMLSelectElement;
            const lastSelected = select.value;
            let firstSelected = undefined as string | undefined;
            // rebuild options
            select.innerHTML = "";
            for (const card of items) {
                const idText = card.id.toString();
                const option = select.appendChild(document.createElement("option"));
                option.innerText = `卡牌${idText}`;
                option.value = idText;
                if (lastSelected === idText) {
                    option.selected = true;
                }
                if (firstSelected === undefined) {
                    firstSelected = idText;
                    option.selected = true;
                }
            }
        };
        globalDeck.addEventListener("change", (event) => {
            if (event.data.key === "cardItems" || event.data.key === "all") {
                buildOptions();
            }
        });
        buildOptions();
    }
    triggerActionGenerateCard() {
        this.#buttonGenerate.click();
    }
    clearOutputConsole() {
        this.#consoleHistory.innerText = "";
        this.#consoleLine.innerText = "";
    }
    appendOutputConsole(line: string) {
        const pre = this.#consoleHistory;
        pre.innerText = pre.innerText + line + "\n";
        pre.scrollIntoView({ block: "end", inline: "nearest" });
    }
    displayImage(bitmap: ImageBitmap) {
        const ctx = this.#canvas.getContext("bitmaprenderer")!;
        ctx.transferFromImageBitmap(bitmap);
    }
    private actionGenerateCard() {
        this.#generatingController.abort();
        const currentController = new AbortController();
        this.#generatingController = currentController;
        // init run
        this.clearOutputConsole();
        // get card item
        const idText = (this.#root.querySelector("#card-id") as HTMLSelectElement).value;
        const face = (this.#root.querySelector("#card-face") as HTMLSelectElement).value as "front" | "back";
        const item = globalDeck.getCardItemById(idText);
        if (!item) { // card item not found
            return;
        }
        // run generate
        const runner = new GenerateCardFaceRunner(
            globalDeck,
            item,
            face,
            (data) => {
                this.appendOutputConsole(data);
            },
            (bitmap) => {
                this.displayImage(bitmap);
            },
            () => {
                this.appendOutputConsole("\n[运行结束]");
                currentController.abort();
            },
            (errMsg) => {
                this.appendOutputConsole("\n[运行出错]");
                this.appendOutputConsole(errMsg);
                currentController.abort();
            },
        );
        currentController.signal.addEventListener("abort", () => {
            // stop runner
            runner.terminate();
            // this.#buttonGenerate.disabled = false;
        }, { once: true });
        runner.start();
    }
}

export class PanelTextEditor extends HTMLElement {
    static readonly TAG_NAME = "panel-text-editor";
    #root: ShadowRoot;
    #actionRun: (() => unknown | undefined) | undefined;
    #changed: boolean = false;
    constructor() {
        super();
        this.#root = this.attachShadow({ mode: "open" });
        this.#root.innerHTML = /*html*/ `
        <style>
            :host {
                display: flex;
                flex-direction: column;
                align-items: center;
                box-sizing: border-box;
                width: 100%;
                height: 100%;
                padding: 0.5rem;
            }
            :host * {
                box-sizing: border-box;
            }
            .op-panel {
                flex: 0 0 auto;
                width: 100%;
                max-width: min(32rem, 100%);
                display: flex;
                gap: 0.5rem;
            }
            .op-panel select {
                flex: 1 1 auto;
                min-width: 0;
            }
            .op-panel button {
                flex: 0 0 auto;
            }
            #edit-area {
                flex: 1 1 auto;
                width: 100%;
                margin-top: 0.5rem;
                resize: none;
                white-space: pre;
            }
        </style>
        <div class="op-panel">
            <select></select>
            <button id="btn-load">加载</button>
            <button id="btn-save" disabled>保存</button>
        </div>
        <textarea id="edit-area"></textarea>
        `;
        const buttonSave = this.#root.querySelector("#btn-save") as HTMLButtonElement;
        // event
        (this.#root.querySelector("#btn-load") as HTMLButtonElement).addEventListener("click", (evt) => {
            // load
            const name = (this.#root.querySelector(".op-panel select") as HTMLSelectElement).value;
            if (!name) return;
            const data = globalDeck.getAsset(name);
            if (!data) return;
            const text = new TextDecoder("utf-8").decode(data);
            (this.#root.querySelector("#edit-area") as HTMLTextAreaElement).value = text;
            // update status
            this.#changed = false;
            buttonSave.disabled = true;
        });
        buttonSave.addEventListener("click", (evt) => {
            // save
            const name = (this.#root.querySelector(".op-panel select") as HTMLSelectElement).value;
            if (!name) return;
            const text = (this.#root.querySelector("#edit-area") as HTMLTextAreaElement).value;
            const data = new TextEncoder().encode(text);
            globalDeck.addAsset(name, data);
            // update status
            this.#changed = false;
            buttonSave.disabled = true;
        });
        (this.#root.querySelector("#edit-area") as HTMLTextAreaElement).addEventListener("input", () => {
            this.#changed = true;
            buttonSave.disabled = false;
        });
        (this.#root.querySelector("#edit-area") as HTMLTextAreaElement).addEventListener("keydown", (evt) => {
            if (evt.ctrlKey || evt.metaKey) {
                if (evt.key === "s") {
                    // save
                    evt.preventDefault();
                    buttonSave.click();
                } else if (evt.key === "r") {
                    // run
                    evt.preventDefault();
                    this.#actionRun?.();
                }
            }
        });
        // options
        const buildOptions = () => {
            const assets = globalDeck.getDeck().assets;
            const select = this.#root.querySelector(".op-panel select") as HTMLSelectElement;
            const lastSelected = select.value;
            // rebuild options
            select.innerHTML = "";
            for (const a of assets) {
                const option = select.appendChild(document.createElement("option"));
                option.innerText = a.name;
                option.value = a.name;
                if (lastSelected === a.name) {
                    option.selected = true;
                }
            }
        };
        globalDeck.addEventListener("change", (event) => {
            if (event.data.key === "assets" || event.data.key === "all") {
                buildOptions();
            }
        });
        buildOptions();
    }
    setActionRun(action: () => unknown | undefined) {
        this.#actionRun = action;
    }
}

export class PageGenerateCard extends HTMLElement {
    static readonly TAG_NAME = "page-generate-card";
    #root: ShadowRoot;
    constructor() {
        super();
        this.#root = this.attachShadow({ mode: "open" });
        this.#root.innerHTML = /* html */ `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    height: 100%;
                    max-width: 100%;
                    max-height: 100%;
                    /* 作为容器查询的容器，并允许竖排时整体上下滚动 */
                    container-type: inline-size;
                    overflow-y: auto;
                }
                .layout {
                    display: flex;
                    flex-direction: row;
                    width: 100%;
                    height: 100%;
                }
                .panel-1 {
                    display: flex;
                    flex-direction: column;
                    width: 24rem;
                    height: 100%;
                }
                .panel-2 {
                    display: flex;
                    flex-direction: column;
                    flex: 1 1 auto;
                    min-width: 0;
                    height: 100%;
                }
                /* ===== 空间不足：上下竖排 ===== */
                @container (max-width: 42rem) {
                    .layout {
                        flex-direction: column;
                        height: auto;
                    }
                    .panel-1 {
                        width: 100%;
                        height: 120vh;
                    }
                    .panel-2 {
                        width: 100%;
                        height: 80vh;
                    }
                }
            </style>
            <div class="layout">
                <div class="panel-1">
                    <${PanelGenerateCard.TAG_NAME} />
                </div>
                <div class="panel-2">
                    <${PanelTextEditor.TAG_NAME} />
                </div>
            </div>
        `;
        const generator = this.#root.querySelector(PanelGenerateCard.TAG_NAME) as PanelGenerateCard;
        const editor = this.#root.querySelector(PanelTextEditor.TAG_NAME) as PanelTextEditor;
        editor.setActionRun(() => {
            generator.triggerActionGenerateCard();
        });
    }
}

export const defineCustomElements = () => {
    customElements.define(PanelGenerateCard.TAG_NAME, PanelGenerateCard);
    customElements.define(PanelTextEditor.TAG_NAME, PanelTextEditor);
    customElements.define(PageGenerateCard.TAG_NAME, PageGenerateCard);
};
