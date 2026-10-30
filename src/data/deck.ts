import { bytesToByteString, byteStringToBytes } from "./utils.ts";

export const CARD_DECK_DATA_VERSION = 1;
export enum DataRecordType {
    Unknown = 0,
    Boolean = 1,
    Number = 2,
    Text = 3,
    MultilineText = 4,
    TextEnum = 5,
}
export enum Scope {
    CardFace = 0b00000010,
    CardItem = 0b00000100,
}

export interface DataRecordItem extends Record<string, unknown> {
    id: number;
    displayName: string;
    name: string;
    type: DataRecordType;
    range: string;
    defaultValue: string;
    visibility: Scope | number;
}

export interface CardFace extends Record<string, unknown> {
    id: number;
    displayName: string;
    executable: string; // builtin, or .wasm file in asserts.
    entryFunction: string; // function name exposed by wasm module.
    data: Record<string, string>;
}

export interface CardItem extends Record<string, unknown> {
    id: number;
    name: string; // 卡牌名称（显示与导出命名用）
    frontFaceId: number;
    backFaceId: number;
    data: Record<string, string>;
}

export interface AssetItem extends Record<string, unknown> {
    name: string;
    size: number;
    content: string; // b64string
}

export interface CardDeck {
    version: number;
    globalMaxId: number;
    recordItems: Array<DataRecordItem>;
    cardFaces: Array<CardFace>;
    cardItems: Array<CardItem>;
    assets: Array<AssetItem>;
    name: string;
    note: string;
    cardWidth: number; // mm
    cardHeight: number; // mm
    sizeScale: number;
}

export const EXAMPLE_DECK: CardDeck = {
    version: CARD_DECK_DATA_VERSION,
    globalMaxId: 100,
    recordItems: [],
    cardFaces: [],
    cardItems: [],
    assets: [],
    name: "",
    note: "",
    cardWidth: 100,
    cardHeight: 100,
    sizeScale: 1.0,
};

export const mapEnumRangeToValueNameMap = (range: string) => {
    const map: Map<string, string> = new Map();
    const options = range.replaceAll("\r\n", "\n").split("\n").map((t) => t.trim()).filter((t) => t);
    for (const optionLine of options) {
        const pos = optionLine.lastIndexOf(":");
        let disp = optionLine;
        let val = optionLine;
        if (pos >= 0) {
            disp = optionLine.substring(0, pos).trimEnd();
            val = optionLine.substring(pos + 1).trimStart();
        }
        map.set(val, disp);
    }
    return map;
};

export const DATA_TYPE_NAME_MAPPING: Record<DataRecordType, string> = {
    [DataRecordType.Unknown]: "未知",
    [DataRecordType.Boolean]: "真假值",
    [DataRecordType.Number]: "数字",
    [DataRecordType.Text]: "文本",
    [DataRecordType.MultilineText]: "多行文本",
    [DataRecordType.TextEnum]: "文本枚举",
};
export const SCOPE_NAME_MAPPING: Record<Scope, string> = {
    [Scope.CardFace]: "卡面",
    [Scope.CardItem]: "卡牌",
};

export interface DeckDataChangedEventData {
    key: keyof CardDeck | "all";
    op: "add" | "update" | "delete" | "other";
    index: number;
}

export class DeckDataChangedEvent extends Event {
    data: DeckDataChangedEventData;
    constructor(data: DeckDataChangedEventData) {
        super("change");
        this.data = data;
    }
}

const localCollator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
}); // string compare

interface DeckDataEventMap {
    change: DeckDataChangedEvent;
}

export class DeckData extends EventTarget {
    #deck: CardDeck;
    constructor() {
        super();
        this.#deck = globalThis.structuredClone(EXAMPLE_DECK);
    }

    getDeck() {
        return this.#deck;
    }

    setDeck(deck: CardDeck) {
        this.#deck = deck;
        this.notifyChange("all", "other", -1);
    }

    /* ==== Record Items ==== */

    addRecordItem() {
        const id = this.#deck.globalMaxId++;
        const row: DataRecordItem = {
            id,
            name: `variable_${id}`,
            displayName: `variable_${id}`,
            type: DataRecordType.Text,
            range: "",
            defaultValue: "",
            visibility: 0,
        };
        const index = this.#deck.recordItems.length;
        this.#deck.recordItems.push(row);
        this.notifyChange("recordItems", "add", index);
        return [index, row] as [number, DataRecordItem];
    }

    updateRecordItem(index: number, item: DataRecordItem) {
        this.#deck.recordItems.splice(index, 1, item);
        this.notifyChange("recordItems", "update", index);
    }

    deleteRecordItem(index: number) {
        this.#deck.recordItems.splice(index, 1);
        this.notifyChange("recordItems", "delete", index);
    }

    /* ==== Card Faces ==== */

    addCardFace() {
        const id = this.#deck.globalMaxId++;
        const row: CardFace = {
            id,
            displayName: `card_face_${id}`,
            executable: "card_maker_plugin.wasm",
            entryFunction: "main",
            data: {},
        };
        // config default field
        const recordFields = [...this.#deck.recordItems];
        recordFields.sort((a, b) => localCollator.compare(a.displayName, b.displayName));
        for (const field of recordFields) {
            if (!(field.visibility & Scope.CardFace)) {
                // filter card face type
                continue;
            }
            row.data[field.name] = field.defaultValue;
        }
        // append
        const index = this.#deck.cardFaces.length;
        this.#deck.cardFaces.push(row);
        this.notifyChange("cardFaces", "add", index);
        return [index, row] as [number, CardFace];
    }

    updateCardFace(index: number, item: CardFace) {
        this.#deck.cardFaces.splice(index, 1, item);
        this.notifyChange("cardFaces", "update", index);
    }

    deleteCardFace(index: number) {
        this.#deck.cardFaces.splice(index, 1);
        this.notifyChange("cardFaces", "delete", index);
    }

    getCardFaceById(id: number | string) {
        if (typeof id !== "number") {
            id = Number.parseInt(id);
        }
        for (const item of this.#deck.cardFaces) {
            if (item.id === id) {
                return item;
            }
        }
        return undefined;
    }

    getCardFaceIdNameMap() {
        const map: Map<number, string> = new Map();
        for (const cf of this.#deck.cardFaces) {
            map.set(cf.id, cf.displayName);
        }
        return map;
    }

    /* ==== Card Items ==== */

    addCardItem() {
        const id = this.#deck.globalMaxId++;
        const row: CardItem = {
            id,
            name: `card_${id}`,
            frontFaceId: 0,
            backFaceId: 0,
            data: {},
        };
        // config default field
        const recordFields = [...this.#deck.recordItems];
        recordFields.sort((a, b) => localCollator.compare(a.displayName, b.displayName));
        for (const field of recordFields) {
            if (!(field.visibility & Scope.CardItem)) {
                // filter card face type
                continue;
            }
            row.data[field.name] = field.defaultValue;
        }
        // append
        const index = this.#deck.cardItems.length;
        this.#deck.cardItems.push(row);
        this.notifyChange("cardItems", "add", index);
        return [index, row] as [number, CardItem];
    }

    updateCardItem(index: number, item: CardItem) {
        this.#deck.cardItems.splice(index, 1, item);
        this.notifyChange("cardItems", "update", index);
    }

    deleteCardItem(index: number) {
        this.#deck.cardItems.splice(index, 1);
        this.notifyChange("cardItems", "delete", index);
    }

    getCardItemById(id: number | string) {
        if (typeof id !== "number") {
            id = Number.parseInt(id);
        }
        for (const item of this.#deck.cardItems) {
            if (item.id === id) {
                return item;
            }
        }
        return undefined;
    }

    /* ==== Assets ==== */

    addAsset(name: string, data: Uint8Array) {
        const size = data.byteLength;
        const b64 = globalThis.btoa(bytesToByteString(data));
        console.log({
            name,
            size,
            content: b64,
        });
        const index = this.#deck.assets.findIndex((item) => item.name === name);
        if (index >= 0) {
            // replace if exist
            const asset = this.#deck.assets[index];
            asset.size = size;
            asset.content = b64;
            this.notifyChange("assets", "update", index);
        } else {
            // not found, add new one
            this.#deck.assets.push({
                name,
                size,
                content: b64,
            });
            this.notifyChange("assets", "add", this.#deck.assets.length - 1);
        }
    }

    getAsset(name: string) {
        // get asset if exist
        for (const asset of this.#deck.assets) {
            if (asset.name === name) {
                const byteString = globalThis.atob(asset.content);
                const data = byteStringToBytes(byteString);
                return data;
            }
        }
        return undefined;
    }

    getAssetByIndex(index: number) {
        // get asset by index
        const asset = this.#deck.assets[index];
        if (asset) {
            const byteString = globalThis.atob(asset.content);
            const data = byteStringToBytes(byteString);
            return [asset.name, data] as [string, Uint8Array<ArrayBuffer>];
        }
        return ["", new Uint8Array()] as [string, Uint8Array<ArrayBuffer>];
    }

    deleteAsset(name: string) {
        // delete if exist
        const index = this.#deck.assets.findIndex((item) => item.name === name);
        if (index >= 0) {
            this.#deck.assets.splice(index, 1);
            this.notifyChange("assets", "delete", index);
        }
    }

    renameAsset(oldName: string, newName: string) {
        const index = this.#deck.assets.findIndex((item) => item.name === oldName);
        if (index >= 0) {
            const asset = this.#deck.assets[index];
            asset.name = newName;
            this.notifyChange("assets", "update", index);
        }
    }

    /* ==== Events ==== */

    notifyChange(key: keyof CardDeck | "all", op: "add" | "update" | "delete" | "other", index: number = -1) {
        this.dispatchEvent(new DeckDataChangedEvent({ key, op, index }));
    }

    override addEventListener<K extends keyof DeckDataEventMap>(
        type: K,
        listener: (this: undefined, ev: DeckDataEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions,
    ): void;
    override addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void;
    override addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void {
        super.addEventListener(type, listener, options);
    }
}
