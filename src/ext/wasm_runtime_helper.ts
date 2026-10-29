import WORKER_JS_SOURCE from "../../dist/tmp/wasm_plugin_worker.js" with { type: "text" };
import { CardFace, CardItem, DeckData } from "../data/deck.ts";
import { DrawingQueue } from "./draw_queue.ts";
import type { WasmWorkerEventData, WasmWorkerRequestGenerateCardFace } from "./wasm_worker_msg.d.ts";
const WORKER_BLOB_URL = (() => {
    const blob = new Blob([WORKER_JS_SOURCE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    return url;
})();

export class CardMakerRuntimeError extends Error {
    constructor(msg?: string) {
        super(msg);
    }
}

export class GenerateCardFaceRunner {
    #worker: Worker;
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
        // drawing queue
        const cd = globalThis.structuredClone(deck.getDeck()); // snapshot current deck
        const dq = new DrawingQueue(cd, (bitmap) => {
            const result = onDraw?.(bitmap) ?? {};
            if (result instanceof Promise) {
                result.finally(() => bitmap.close());
            } else {
                bitmap.close();
            }
        }, (errMsg) => {
            settle(() => onError?.(errMsg));
        }, { card, face: face });
        // wasm worker
        this.#worker = new Worker(WORKER_BLOB_URL);
        this.#worker.addEventListener("message", (event: MessageEvent<WasmWorkerEventData>) => {
            if (event.data.action === "output") {
                onOutput?.(event.data.params);
            } else if (event.data.action === "draw") {
                dq.submitDrawCommand(event.data.params);
            } else if (event.data.action === "finish") {
                dq.waitFinish().then(() => {
                    settle(() => onFinish?.());
                });
            } else if (event.data.action === "error") {
                dq.waitFinish().then(() => {
                    settle(() => onError?.(event.data.params));
                });
            }
        });
        // call the worker
        this.start = () => {
            this.#worker.postMessage({
                action: "generateCardFace",
                params: {
                    deck: cd,
                    card: card,
                    face: face,
                },
            } as WasmWorkerRequestGenerateCardFace);
        };
    }
    terminate() {
        this.#worker.terminate();
    }
}
