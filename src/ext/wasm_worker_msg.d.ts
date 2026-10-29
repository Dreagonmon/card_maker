import type { CardDeck, CardFace, CardItem } from "../data/deck.ts";

export interface WasmWorkerRequestGenerateCardFace {
    action: "generateCardFace";
    params: {
        deck: CardDeck;
        card: CardItem;
        face: CardFace | "front" | "back";
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
export interface DrawEventData {
    action: "draw";
    params: string;
}
export interface FinishEventData {
    action: "finish";
    params: string;
}
export type WasmWorkerEventData = OutputEventData | ErrorEventData | DrawEventData | FinishEventData;
