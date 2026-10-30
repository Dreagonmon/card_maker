import type { CardDeck, CardFace, CardItem } from "../data/deck.ts";

// ── 主线程 → WASM worker ────────────────────────────────────────────────
// 注意：绘图端 MessagePort 经 postMessage 的 transfer 传入，取 event.ports[0]。
export interface WasmWorkerRequestGenerateCardFace {
    action: "generateCardFace";
    params: {
        deck: CardDeck;
        card: CardItem;
        /** 解析失败时可为 undefined，由 worker 报 "Card face not found."。 */
        face: CardFace | "front" | "back" | undefined;
    };
}

export interface OutputEventData {
    action: "output";
    params: string;
}
export interface ErrorEventData {
    action: "error";
    params: string;
}
export interface FinishEventData {
    action: "finish";
    params: string;
    /** 制作成功时的最终画面（由 Draw worker 在 syncDone 时快照，经 transfer 传递）。 */
    bitmap?: ImageBitmap;
}
export type WasmWorkerEventData = OutputEventData | ErrorEventData | FinishEventData;

// ── 主线程 ↔ Draw worker ───────────────────────────────────────────────
// init 时绘图端 MessagePort 经 transfer 传入（event.ports[0]）。
export interface DrawWorkerInitRequest {
    action: "init";
    params: {
        deck: CardDeck;
        card: CardItem;
        /** 解析失败时可为 undefined：变量取值自然回落，绘制照常由 wasm 侧错误终止。 */
        face: CardFace | undefined;
    };
}

export interface DrawWorkerBitmapEvent {
    action: "bitmap";
    /** ImageBitmap 本体，经 transfer 传入。 */
    params: ImageBitmap;
}
export interface DrawWorkerErrorEvent {
    action: "error";
    params: string;
}
export type DrawWorkerEventData = DrawWorkerBitmapEvent | DrawWorkerErrorEvent;

// ── MessagePort（WASM worker ↔ Draw worker）────────────────────────────
export interface DrawPortCommandMessage {
    action: "draw";
    params: string;
}
/** WASM worker 请求等待已提交指令全部画完。 */
export interface DrawPortSyncMessage {
    action: "sync";
}
/** Draw worker 确认已提交指令全部画完（或已出错中止）。 */
export interface DrawPortSyncDoneMessage {
    action: "syncDone";
    /** 画完后的最终画面快照，经 transfer 传入；出错中止时可能缺省。 */
    params?: ImageBitmap;
}
export type DrawPortMessage = DrawPortCommandMessage | DrawPortSyncMessage | DrawPortSyncDoneMessage;
