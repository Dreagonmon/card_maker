/// <reference lib="webworker" />

import { CardFace, CardItem, DeckData, Scope } from "./data/deck.ts";
import type { WasmWorkerEventData, WasmWorkerRequestGenerateCardFace } from "./ext/wasm_worker_msg.d.ts";
import { WASMEnv } from "./ext/wasmenv.ts";

class CardMakerWorkerRuntimeError extends Error {
    constructor(msg?: string) {
        super(msg);
    }
}

const sendSimpleEvent = (action: "error" | "output" | "draw" | "finish", params: string) => {
    const msg: WasmWorkerEventData = {
        action,
        params,
    };
    globalThis.postMessage(msg);
};

const generateCardFace = async (
    deck: DeckData,
    card: CardItem,
    face: CardFace | "front" | "back" | undefined,
    historySize: number = 1000,
) => {
    // get card face
    if (typeof face === "string") {
        if (face === "front") face = deck.getCardFaceById(card.frontFaceId);
        else if (face === "back") face = deck.getCardFaceById(card.backFaceId);
    }
    if (!face) throw new CardMakerWorkerRuntimeError("Card face not found."); // nothing to generate
    // init runtime
    const rt = new WASMEnv(historySize);
    // get exec
    const wasmBinary = deck.getAsset(face.executable);
    if (!wasmBinary) throw new CardMakerWorkerRuntimeError(`WASM module not found: '${face.executable}'`);
    // copy assets
    for (let idx = 0; idx < deck.getDeck().assets.length; idx++) {
        const [name, data] = deck.getAssetByIndex(idx);
        if (name.length > 0 && data.length > 0) {
            rt.filesystem.writeFile(name, data);
        }
    }
    // set variable
    for (const record of deck.getDeck().recordItems) {
        const name = record.name;
        rt.setVariable(name, record.defaultValue);
        if (record.visibility & Scope.CardFace) {
            if (face.data[name]) {
                rt.setVariable(name, face.data[name]);
            }
        }
        if (record.visibility & Scope.CardItem) {
            if (card.data[name]) {
                rt.setVariable(name, card.data[name]);
            }
        }
    }
    // callback
    rt.addEventListener("outputLine", ({ data }) => {
        sendSimpleEvent("output", data.lastLine);
    });
    rt.addEventListener("variableChanged", ({ data }) => {
        if (data.name === "@draw") {
            // process draw command
            sendSimpleEvent("draw", data.value.toString());
        }
    });
    // init modules
    await rt.compileModuleStreaming(
        new Response(new Blob([wasmBinary]).stream(), {
            status: 200,
            headers: { "Content-Type": "application/wasm" },
        }),
    );
    await rt.initInstance();
    // run function
    const funcName = face.entryFunction;
    if (!(rt.getExportedFunctions()?.[funcName])) {
        throw new CardMakerWorkerRuntimeError(`Function '${funcName}' not found in the wasm module.`);
    } else {
        const funcTable = rt.getExportedFunctions();
        (funcTable[funcName])();
    }
    // clean up
    rt.finishOutputBuffer();
    return;
};

globalThis.addEventListener("message", async (event: MessageEvent<WasmWorkerRequestGenerateCardFace>) => {
    if (event.data.action === "generateCardFace") {
        try {
            const deck = new DeckData();
            deck.setDeck(event.data.params.deck);
            await generateCardFace(deck, event.data.params.card, event.data.params.face);
            sendSimpleEvent("finish", "");
        } catch (err) {
            console.error(err);
            if (err instanceof Error) {
                sendSimpleEvent("error", err.message);
            } else {
                sendSimpleEvent("error", `${err}`);
            }
        }
    }
});
