import { createWasip1 } from "@tegmentum/wasi-polyfill/wasip1";
import type { OutputStream } from "@tegmentum/wasi-polyfill/wasip1";

enum StreamDecodeMode {
    UNKNOWN,
    BYTE,
    CODEPOINT,
}

const CODE_B = "\b".codePointAt(0);
const CODE_R = "\r".codePointAt(0);
const CODE_N = "\n".codePointAt(0);
const CANT_DECODE_CODEPOINT = 0x110000;

const strictUTF8Decoder = new TextDecoder("utf-8", { fatal: true });
const lenientUTF8Decoder = new TextDecoder("utf-8", { fatal: false });
const lenientUTF8Encoder = new TextEncoder();

const utf8ExpectedLength = (b0: number): number => {
    const expected = b0 <= 0x7f
        ? 1
        : b0 >= 0xc2 && b0 <= 0xdf
        ? 2
        : b0 >= 0xe0 && b0 <= 0xef
        ? 3
        : b0 >= 0xf0 && b0 <= 0xf4
        ? 4
        : -1;
    return expected;
};

const isValidContinuation = (buf: Uint8Array, byte: number): boolean => {
    const bufLen = charBufferUsed(buf);
    if (bufLen === 0) return utf8ExpectedLength(byte) > 0; // first byte
    const b0 = buf[0];
    const expected = utf8ExpectedLength(b0);
    if (expected < 0) return false;
    if (bufLen >= expected) return false;
    const b = byte;
    if (b < 0x80 || b > 0xbf) return false;
    // 严格范围检查
    const i = bufLen;
    if (i === 1) {
        if (b0 === 0xe0 && b < 0xa0) return false;
        if (b0 === 0xed && b > 0x9f) return false;
        if (b0 === 0xf0 && b < 0x90) return false;
        if (b0 === 0xf4 && b > 0x8f) return false;
    }
    return true;
};

const decodeUTF8Bytes = (charBuffer: Uint8Array, byte: number): Array<number> => {
    // charBuffer[4] filled with \0
    const oldLen = charBufferUsed(charBuffer);
    if (!isValidContinuation(charBuffer, byte)) {
        const charCodePoint: Array<number> = [];
        if (oldLen > 0) {
            charCodePoint.push(CANT_DECODE_CODEPOINT); // last seq failed to decode
        }
        // clear buffer
        charBuffer.fill(0);
        if (byte <= 0x7f) {
            charCodePoint.push(byte); // current seq
        } else if (utf8ExpectedLength(byte) > 0) {
            charBuffer[0] = byte; // keep current byte as leading byte
        } else {
            charCodePoint.push(CANT_DECODE_CODEPOINT); // another bad byte
        }
        return charCodePoint;
    }
    // append char
    charBuffer[oldLen] = byte;
    // try decode
    for (const l of [3, 2, 4, 1]) { // order irrelevant, decode chinese first, then latin, then emoji, rare case 1 byte as fallsafe
        if (l > oldLen + 1) continue;
        try {
            const ch = strictUTF8Decoder.decode(charBuffer.slice(0, l));
            // success, shift buffer
            let p = 0;
            while (p + l < 4) {
                charBuffer[p] = charBuffer[p + l];
                p++;
            }
            charBuffer.fill(0, 4 - l, 4);
            // return char
            return [ch.codePointAt(0)!];
        } catch {
            // failed to decode
            continue;
        }
    }
    // when decode failed, return undefined
    return [];
};

const charBufferUsed = (charBuffer: Uint8Array) => {
    let i = 0;
    for (const n of charBuffer) {
        if (n != 0) i++;
        else break;
    }
    return i;
};

const checkPointerType = (pt: number) => {
    if (!Number.isInteger(pt) || pt <= 0) throw Error("Error pointer type.");
};
const checkUIntType = (pt: number) => {
    if (!Number.isInteger(pt) || pt <= 0) throw Error("Error uint type.");
};

interface FileItem {
    content: Uint8Array;
    size: number;
}

interface FileStream {
    file: FileItem;
    fp: number;
}

interface WASMEnvOutputEventMap {
    outputLine: WASMEnvOutputEvent;
    editChar: WASMEnvOutputEvent;
    variableChanged: WASMEnvVariableChangedEvent;
}

export class WASMEnvOutputEvent extends Event {
    data = {
        lastLine: "",
        editPos: 0,
        editChar: "",
        editLine: "",
    };
    constructor(name: string, lastLine: string, editPos: number, editChar: string, editLine: string) {
        super(name);
        this.data.lastLine = lastLine;
        this.data.editPos = editPos;
        this.data.editChar = editChar;
        this.data.editLine = editLine;
    }
}

export class WASMEnvVariableChangedEvent extends Event {
    data = {
        name: "",
        value: 0 as string | number,
    };
    constructor(name: string, variableName: string, variableValue: string | number) {
        super(name);
        this.data.name = variableName;
        this.data.value = variableValue;
    }
}

export class MemFS {
    private files: Map<string, FileItem> = new Map();
    private opened: Map<number, FileStream> = new Map();
    private readerId: number = 0x100;
    clear() {
        this.files.clear();
        this.opened.clear();
        this.readerId = 0x100;
    }
    writeFile(name: string, content: ArrayBuffer | Uint8Array) {
        let file: FileItem;
        if (this.files.has(name)) {
            file = this.files.get(name)!;
        } else {
            file = {
                content: new Uint8Array(),
                size: 0,
            };
        }
        file.content = new Uint8Array(content);
        file.size = content.byteLength;
        this.files.set(name, file);
    }
    readFile(name: string) {
        if (this.files.has(name)) {
            return new Uint8Array(this.files.get(name)!.content);
        }
        return undefined;
    }
    openFileReader(name: string) {
        if (this.files.has(name)) {
            const readerId = this.readerId++;
            const stream: FileStream = {
                file: this.files.get(name)!,
                fp: 0,
            };
            this.opened.set(readerId, stream);
            return readerId;
        }
        return 0;
    }
    closeFileReader(readerId: number) {
        this.opened.delete(readerId);
    }
    readFileReader(readerId: number) {
        if (this.opened.has(readerId)) {
            const stream = this.opened.get(readerId)!;
            const buf = stream.file.content;
            if (stream.fp >= buf.length) return -1; // EOF
            return buf[stream.fp++];
        }
        return -2; // ReaderNotFound
    }
}

export class WASMEnv extends EventTarget {
    // wasm
    private wasmModule: WebAssembly.Module | undefined = undefined;
    private wasmInstance: WebAssembly.Instance | undefined = undefined;
    private providedMemmory: WebAssembly.Memory | undefined = undefined;
    // text output
    private maxHistory: number;
    private streamDecodeMode: StreamDecodeMode = StreamDecodeMode.UNKNOWN;
    private historyLines: Array<string> = [];
    private lineCodePointChar: Array<string> = [];
    private linePointer: number = 0;
    private charBuffer: Uint8Array = new Uint8Array(4);
    // variable table
    private variableTable: Map<string, string | number> = new Map();
    // virtual filesystem
    filesystem: MemFS = new MemFS();
    constructor(maxHistory: number = 1000) {
        super();
        this.maxHistory = maxHistory;
        this.charBuffer.fill(0);
    }
    async compileModuleStreaming(source: Response | PromiseLike<Response>) {
        this.wasmModule = await WebAssembly.compileStreaming(source);
    }
    async initInstance() {
        if (!this.wasmModule) {
            throw Error("WebAssembly module is not initialized, compile first.");
        }
        // wasi
        const output: OutputStream = {
            write: (data: Uint8Array): void | Promise<void> => {
                for (const byt of data) {
                    this.api_wasmenv_putc(byt);
                }
            },
        };
        const wasi = createWasip1({
            args: [],
            env: { HOME: "/", PWD: "/" },
            stdin: undefined,
            stdout: output,
            stderr: output,
            // preopens: { '/': filesystem },  // optional
            returnOnExit: true,
            blockingPoll: true, // requires to run in the worker
        });
        // base runtime
        this.providedMemmory = new WebAssembly.Memory({ initial: 64, maximum: 64 }); // 4mb
        this.wasmInstance = await WebAssembly.instantiate(this.wasmModule, {
            env: {
                memory: this.providedMemmory,
                wasmenv_clock_ms: this.api_wasmenv_clock_ms.bind(this),
                wasmenv_time_ms: this.api_wasmenv_time_ms.bind(this),
                wasmenv_abort: this.api_wasmenv_abort.bind(this),
                wasmenv_putc: this.api_wasmenv_putc.bind(this),
                vfile_open: this.api_vfile_open.bind(this),
                vfile_close: this.api_vfile_close.bind(this),
                vfile_getc: this.api_vfile_getc.bind(this),
                set_string: this.api_set_string.bind(this),
                set_number: this.api_set_number.bind(this),
                get_string_length: this.api_get_string_length.bind(this),
                get_string: this.api_get_string.bind(this),
                get_number: this.api_get_number.bind(this),
            },
            wasi_snapshot_preview1: wasi.getImports(),
        });
        // init wasi
        wasi.initialize(this.wasmInstance);
        // call start function
        if (typeof this.wasmInstance?.exports?._start == "function") this.wasmInstance.exports._start();
    }
    private api_wasmenv_clock_ms() {
        return performance.now();
    }
    private api_wasmenv_time_ms() {
        return performance.timeOrigin + performance.now();
    }
    private api_wasmenv_abort() {
        this.finishOutputBuffer();
        throw new Error("WASM runtime aborted!");
    }
    private api_wasmenv_putc(codepoint: number) {
        if (!Number.isInteger(codepoint) || codepoint < 0) return;
        const switchToCodePointMode = () => {
            // switch to codepoint mode
            this.streamDecodeMode = StreamDecodeMode.CODEPOINT;
            // append charBuffer to line
            for (const n of this.charBuffer) {
                if (n === 0) break;
                this.linePutCharCode(n);
            }
            this.charBuffer.fill(0);
        };
        // process depending on mode
        if (this.streamDecodeMode === StreamDecodeMode.CODEPOINT) {
            this.linePutCharCode(codepoint);
        } else if (this.streamDecodeMode === StreamDecodeMode.BYTE) {
            if (codepoint > 0xFF) {
                // should not appears in byte mode.
                // switch to codepoint mode
                switchToCodePointMode();
                this.linePutCharCode(codepoint);
            } else {
                const tmp = decodeUTF8Bytes(this.charBuffer, codepoint);
                for (const ch of tmp) {
                    this.linePutCharCode(ch);
                }
            }
        } else {
            // unknown mode
            if (codepoint <= 0x7F || codepoint > 0xFF) {
                if (codepoint > 0xFF || charBufferUsed(this.charBuffer) > 0) {
                    // switch to codepoint mode
                    switchToCodePointMode();
                }
                this.linePutCharCode(codepoint);
            } else {
                if (!isValidContinuation(this.charBuffer, codepoint)) {
                    // switch to codepoint mode
                    switchToCodePointMode();
                    this.linePutCharCode(codepoint);
                } else {
                    // try decode
                    const tmp = decodeUTF8Bytes(this.charBuffer, codepoint);
                    for (const ch of tmp) {
                        // decode success, switch to byte mode
                        this.streamDecodeMode = StreamDecodeMode.BYTE;
                        this.linePutCharCode(ch);
                    }
                }
            }
        }
    }
    private api_set_string(namePt: number, textPt: number) {
        checkPointerType(namePt);
        checkPointerType(textPt);
        const name = this.readCString(namePt);
        const text = this.readCString(textPt);
        this.variableTable.set(name, text);
        this.dispatchVariableChangedEvent(name, text);
    }
    private api_set_number(namePt: number, value: number) {
        checkPointerType(namePt);
        const name = this.readCString(namePt);
        this.variableTable.set(name, value);
        this.dispatchVariableChangedEvent(name, value);
    }
    private api_get_string_length(namePt: number) {
        checkPointerType(namePt);
        const name = this.readCString(namePt);
        const val = this.variableTable.get(name);
        if (typeof val !== "string") {
            return -1;
        }
        return lenientUTF8Encoder.encode(val).byteLength;
    }
    private api_get_string(namePt: number, bufPt: number, bufLen: number) {
        checkPointerType(namePt);
        checkPointerType(bufPt);
        checkUIntType(bufLen);
        const name = this.readCString(namePt);
        const val = this.variableTable.get(name);
        if (typeof val !== "string") {
            return -1;
        }
        const written = this.writeCString(val, bufPt, bufLen);
        return written;
    }
    private api_get_number(namePt: number) {
        checkPointerType(namePt);
        const name = this.readCString(namePt);
        const val = this.variableTable.get(name);
        if (typeof val !== "number") {
            return NaN;
        }
        return val;
    }
    private api_vfile_open(namePt: number) {
        checkPointerType(namePt);
        const name = this.readCString(namePt);
        const readerId = this.filesystem.openFileReader(name);
        return readerId;
    }
    private api_vfile_close(readerId: number) {
        this.filesystem.closeFileReader(readerId);
    }
    private api_vfile_getc(readerId: number) {
        return this.filesystem.readFileReader(readerId);
    }
    private linePutCharCode(codepoint: number) {
        if (codepoint === CODE_R) {
            this.linePointer = 0;
            return;
        } else if (codepoint === CODE_B) {
            this.linePointer--;
            if (this.linePointer < 0) this.linePointer = 0;
            return;
        } else if (codepoint === CODE_N) {
            const line = this.lineCodePointChar.join("");
            this.historyLines.push(line);
            if (this.historyLines.length > this.maxHistory) {
                this.historyLines.shift();
            }
            this.lineCodePointChar.splice(0, this.lineCodePointChar.length);
            this.linePointer = 0;
            this.dispatchOutputLineEvent(line);
            return;
        }
        // codepoint -> chat
        let char = "\uFFFD";
        if (codepoint !== CANT_DECODE_CODEPOINT) {
            try {
                char = String.fromCodePoint(codepoint);
            } catch {
                char = "\uFFFD";
            }
        }
        if (this.linePointer >= this.lineCodePointChar.length) {
            // append char
            this.lineCodePointChar.push(char);
            this.linePointer = this.lineCodePointChar.length;
        } else {
            // replace char in the mid
            this.lineCodePointChar.splice(this.linePointer, 1, char);
            this.linePointer += 1;
        }
        this.dispatchEditCharEvent(this.linePointer - 1, char, this.lineCodePointChar.join(""));
    }
    private flushOutputBuffer() {
        if (charBufferUsed(this.charBuffer) > 0) {
            if (this.streamDecodeMode === StreamDecodeMode.CODEPOINT) {
                // bug case, should not appear.
                for (const n of this.charBuffer) {
                    if (n === 0) break;
                    this.linePutCharCode(n);
                }
                console.warn("[WASMEnv] charBuffer non-empty in CODEPOINT mode");
            } else {
                this.linePutCharCode(CANT_DECODE_CODEPOINT);
            }
            this.charBuffer.fill(0);
        }
    }
    private dispatchOutputLineEvent(line: string) {
        this.dispatchEvent(new WASMEnvOutputEvent("outputLine", line, 0, "", ""));
    }
    private dispatchEditCharEvent(pos: number, char: string, line: string) {
        this.dispatchEvent(new WASMEnvOutputEvent("editChar", "", pos, char, line));
    }
    private dispatchVariableChangedEvent(name: string, value: string | number) {
        this.dispatchEvent(new WASMEnvVariableChangedEvent("variableChanged", name, value));
    }
    private getMemory() {
        const mem = this.wasmInstance?.exports?.memory;
        if (mem instanceof WebAssembly.Memory) {
            return mem;
        }
        if (!this.providedMemmory) throw Error("Memory not loaded.");
        return this.providedMemmory;
    }
    private readCString(pt: number) {
        checkPointerType(pt);
        const mem = this.getMemory();
        const memBuf = new Uint8Array(mem.buffer);
        // get string length
        let len = 0;
        while ((pt + len) < memBuf.length && memBuf[pt + len]) {
            len++;
        }
        // decode string
        return lenientUTF8Decoder.decode(memBuf.slice(pt, pt + len));
    }
    private writeCString(text: string, buf: number, bufLen: number) {
        checkPointerType(buf);
        checkUIntType(bufLen);
        const data = lenientUTF8Encoder.encode(text);
        const mem = this.getMemory();
        const memBuf = new Uint8Array(mem.buffer);
        const maxLen = Math.min(data.byteLength, bufLen - 1, memBuf.length - buf - 1);
        memBuf.set(data.slice(0, maxLen), buf);
        memBuf[buf + maxLen] = 0;
        return maxLen;
    }
    override addEventListener<K extends keyof WASMEnvOutputEventMap>(
        type: K,
        listener: (this: undefined, ev: WASMEnvOutputEventMap[K]) => any,
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
    cloneWithCompiledModule() {
        const another = new WASMEnv(this.maxHistory);
        another.wasmModule = this.wasmModule;
        return another;
    }
    /** finish output buffer, push last line to the history. */
    finishOutputBuffer() {
        this.flushOutputBuffer();
        if (this.lineCodePointChar.length > 0) {
            const line = this.lineCodePointChar.join("");
            this.historyLines.push(line);
            this.lineCodePointChar.length = 0;
            this.linePointer = 0;
            this.dispatchOutputLineEvent(line);
        }
    }
    setVariable(name: string, value: string | number) {
        this.variableTable.set(name, value);
        this.dispatchVariableChangedEvent(name, value);
    }
    getVariable(name: string) {
        return this.variableTable.get(name);
    }
    getExportedFunctions<T extends Record<string, CallableFunction>>() {
        if (!this.wasmInstance) {
            throw new Error("WebAssembly instance is not initialized");
        }
        return this.wasmInstance?.exports as T;
    }
}
