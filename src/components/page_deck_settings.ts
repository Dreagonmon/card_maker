import { EXAMPLE_DECK, globalDeck } from "../data/global_deck.ts";
import { CARD_DECK_DATA_VERSION, CardDeck } from "../data/deck.ts";
import { dialogAlert } from "./dialog.ts";
import "../font.css";

type ScalarField = "name" | "note" | "cardWidth" | "cardHeight" | "sizeScale";

interface FieldDef {
    key: ScalarField;
    label: string;
    type: "text" | "number" | "textarea";
    hint: string;
    min?: number;
    step?: number;
}

const FIELDS: FieldDef[] = [
    { key: "name", label: "卡组名称", type: "text", hint: "显示用名称" },
    { key: "note", label: "备注", type: "textarea", hint: "卡组的说明文字" },
    { key: "cardWidth", label: "卡片宽度 (像素)", type: "number", hint: "生成画布的像素宽度", min: 1, step: 0.1 },
    { key: "cardHeight", label: "卡片高度 (像素)", type: "number", hint: "生成画布的像素高度", min: 1, step: 0.1 },
    { key: "sizeScale", label: "渲染缩放 (像素倍率)", type: "number", hint: "实际渲染的像素比例", min: 0.1, step: 0.1 },
];

export class PageDeckSettings extends HTMLElement {
    static readonly TAG_NAME = "page-deck-settings";
    #root: ShadowRoot;
    #inputs = new Map<ScalarField, HTMLInputElement | HTMLTextAreaElement>();
    #buttonSave: HTMLButtonElement;
    #saveStatus: HTMLSpanElement;
    #suppressSync = false;

    constructor() {
        super();
        this.#root = this.attachShadow({ mode: "open" });

        const rows = FIELDS.map((f) => {
            const input = f.type === "textarea"
                ? `<textarea id="f-${f.key}" rows="4" spellcheck="false"></textarea>`
                : `<input id="f-${f.key}" type="${f.type}"${f.min !== undefined ? ` min="${f.min}"` : ""}${
                    f.step !== undefined ? ` step="${f.step}"` : ""
                }>`;
            return /*html*/ `
            <div class="field">
                <label for="f-${f.key}">${f.label}</label>
                <div class="control">
                    ${input}
                    <span class="hint">${f.hint}</span>
                </div>
            </div>`;
        }).join("");

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
            }
            form {
                width: 100%;
                max-width: 36rem;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }
            .field {
                display: flex;
                flex-direction: column;
                gap: 0.25rem;
            }
            input,
            textarea {
                width: 100%;
                resize: vertical;
            }
            .hint {
                font-size: 0.75rem;
                color: #888;
            }
            .footer {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 0.5rem;
            }
            .footer .spacer {
                display: inline-block;
                flex: 1 1 auto;
            }
            .footer>*:not(.spacer) {
                flex: 0 0 auto;
            }
        </style>
        <div class="page">
            <h1>卡组设置</h1>
            <form novalidate>
                ${rows}
                <div class="footer">
                    <button id="reset-card-deck" type="button">!重置卡组!</button>
                    <span class="spacer"></span>
                    <span id="save-status"></span>
                    <button id="import" type="button">导入</button>
                    <button id="export" type="button">导出</button>
                    <button id="save" type="button">保存</button>
                    <input id="import-file" type="file" accept=".deck.json,application/json" hidden>
                </div>
            </form>
        </div>
        `;

        for (const f of FIELDS) {
            const el = this.#root.querySelector(`#f-${f.key}`) as HTMLInputElement | HTMLTextAreaElement;
            this.#inputs.set(f.key, el);
        }
        // reset
        (this.#root.querySelector("#reset-card-deck") as HTMLButtonElement).addEventListener("click", () => {
            globalDeck.setDeck(globalThis.structuredClone(EXAMPLE_DECK));
        });
        // save
        this.#buttonSave = this.#root.querySelector("#save") as HTMLButtonElement;
        this.#saveStatus = this.#root.querySelector("#save-status") as HTMLSpanElement;
        this.#buttonSave.addEventListener("click", () => this.#save());
        // import / export
        const fileInput = this.#root.querySelector("#import-file") as HTMLInputElement;
        (this.#root.querySelector("#import") as HTMLButtonElement).addEventListener("click", () => {
            fileInput.click();
        });
        fileInput.addEventListener("change", async () => {
            const file = fileInput.files?.[0];
            fileInput.value = ""; // allow re-selecting the same file
            if (!file) return;
            await this.#importFile(file);
        });
        (this.#root.querySelector("#export") as HTMLButtonElement).addEventListener("click", () => {
            this.#exportFile();
        });

        // keep UI in sync when deck changes elsewhere (load/save/etc.)
        const watched: string[] = ["all", ...FIELDS.map((f) => f.key)];
        globalDeck.addEventListener("change", (event) => {
            if (watched.includes(event.data.key as string)) {
                this.#syncFromDeck();
            }
        });

        this.#syncFromDeck();
    }

    #readDeck(): CardDeck {
        return globalDeck.getDeck();
    }

    #syncFromDeck() {
        if (this.#suppressSync) return;
        const deck = this.#readDeck();
        for (const f of FIELDS) {
            const el = this.#inputs.get(f.key)!;
            el.value = String(deck[f.key] ?? "");
        }
        this.#setStatus("");
    }

    #setStatus(text: string) {
        this.#saveStatus.textContent = text;
    }

    #exportFile() {
        const deck = this.#readDeck();
        const text = JSON.stringify(deck, null, 2);
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const safeName = (deck.name || "deck").replaceAll(/[\\/:*?"<>|]/g, "_");
        a.href = url;
        a.download = `${safeName}.deck.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.#setStatus("已导出");
    }

    async #importFile(file: File) {
        try {
            const text = await file.text();
            const data = JSON.parse(text) as Partial<CardDeck>;
            if (typeof data !== "object" || data === null || typeof data.version !== "number") {
                dialogAlert("导入失败：不是有效的卡组文件（缺少 version 字段）");
                return;
            }
            if (data.version > CARD_DECK_DATA_VERSION) {
                dialogAlert(`导入失败：文件版本 ${data.version} 高于当前支持的版本 ${CARD_DECK_DATA_VERSION}`);
                return;
            }
            const deck = structuredClone(data) as CardDeck;
            deck.version = CARD_DECK_DATA_VERSION;
            globalDeck.setDeck(deck); // notifies "all": tables & persistence refresh
            this.#setStatus("已导入");
        } catch (e) {
            dialogAlert(`导入失败：${e instanceof Error ? e.message : String(e)}`);
        }
    }

    #validNumber(f: FieldDef, text: string): boolean {
        const v = Number(text);
        if (text.trim() === "" || !Number.isFinite(v)) return false;
        if (f.min !== undefined && v < f.min) return false;
        return true;
    }

    #save() {
        const deck = this.#readDeck();
        const slot = deck as unknown as Record<ScalarField, string | number>;
        // validate all first; any error -> popup and do not save
        const errors: string[] = [];
        for (const f of FIELDS) {
            const el = this.#inputs.get(f.key)!;
            if (f.type === "number" && !this.#validNumber(f, el.value)) {
                errors.push(`「${f.label}」不是合法数值（最小 ${f.min}）：${el.value || "(空)"}`);
            }
        }
        if (errors.length > 0) {
            dialogAlert(`有非法数值，未保存：\n${errors.join("\n")}`);
            return;
        }
        // commit changed fields
        const changed: ScalarField[] = [];
        for (const f of FIELDS) {
            const el = this.#inputs.get(f.key)!;
            const v = f.type === "number" ? Number(el.value) : el.value;
            if (deck[f.key] !== v) {
                slot[f.key] = v;
                changed.push(f.key);
            }
        }
        if (changed.length === 0) {
            this.#setStatus("无改动");
            return;
        }
        // notify persistence & other views; skip re-syncing our own inputs
        this.#suppressSync = true;
        for (const key of changed) {
            globalDeck.notifyChange(key, "update");
        }
        this.#suppressSync = false;
        this.#setStatus("已保存");
    }
}

export const defineCustomElements = () => {
    customElements.define(PageDeckSettings.TAG_NAME, PageDeckSettings);
};
