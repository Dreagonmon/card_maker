/// <reference lib="webworker" />

import { DrawingQueue } from "./ext/draw_queue.ts";
import type {
    DrawPortMessage,
    DrawWorkerEventData,
    DrawWorkerInitRequest,
} from "./ext/wasm_worker_msg.d.ts";

// Draw worker：只跑 DrawingQueue。
// - 主线程发来 init（附带与 WASM worker 共享的 MessagePort，经 transfer 传入）；
// - WASM worker 通过端口异步投递 draw 指令，本 worker 逐条绘制并把累积画面
//   以 ImageBitmap transfer 回主线程；
// - WASM worker 发来 sync 时，等已提交指令全部画完再回 syncDone。

let port: MessagePort | null = null;

globalThis.addEventListener("message", (event: MessageEvent<DrawWorkerInitRequest>) => {
    if (event.data.action !== "init") return;
    const { deck, card, face } = event.data.params;
    port = event.ports[0] ?? null;
    const dq = new DrawingQueue(deck, (bitmap) => {
        const msg: DrawWorkerEventData = { action: "bitmap", params: bitmap };
        globalThis.postMessage(msg, { transfer: [bitmap] });
    }, (errMsg) => {
        const msg: DrawWorkerEventData = { action: "error", params: errMsg };
        globalThis.postMessage(msg);
    }, { card, face });
    if (port) {
        port.addEventListener("message", (ev: MessageEvent<DrawPortMessage>) => {
            const m = ev.data;
            if (m.action === "draw") {
                dq.submitDrawCommand(m.params);
            } else if (m.action === "setVar") {
                // 与绘图指令同队列排队，保证变量改动与指令顺序一致
                dq.submitSetVar(m.params.name, m.params.value);
            } else if (m.action === "sync") {
                dq.waitFinish().then(async () => {
                    // 画完后快照最终画面，随 syncDone transfer 回 wasm worker
                    let bitmap: ImageBitmap | undefined;
                    try {
                        bitmap = await dq.snapshot();
                    } catch {
                        bitmap = undefined;
                    }
                    const done: DrawPortMessage = { action: "syncDone", params: bitmap };
                    if (bitmap) {
                        port?.postMessage(done, { transfer: [bitmap] });
                    } else {
                        port?.postMessage(done);
                    }
                });
            }
        });
        port.start();
    }
});
