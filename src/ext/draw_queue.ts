import { Scope } from "../data/deck.ts";
import type { CardDeck, CardFace, CardItem } from "../data/deck.ts";

interface ParsedCommand {
    func: string;
    /** 第一个 ":" 之后到行尾、去掉首尾空白的参数串。 */
    rest: string;
}

/** 拆分指令为 { func, rest }；func 统一小写。无 ":" 时整串为指令名、参数为空（零参数指令可省略冒号）。 */
const parseDrawCommand = (cmd: string): ParsedCommand => {
    const i = cmd.indexOf(":");
    if (i < 0) return { func: cmd.trim().toLowerCase(), rest: "" };
    return { func: cmd.slice(0, i).trim().toLowerCase(), rest: cmd.slice(i + 1).trim() };
};

/** 按 | 分割参数；空参数串表示无参数。 */
const splitPipe = (rest: string): string[] => (rest === "" ? [] : rest.split("|"));

/** 按前 4 个 | 分割：前 4 段为 bbox，第 4 个 | 之后整体为 text。 */
const splitFirstFour = (rest: string): [string, string, string, string, string] => {
    const parts = rest.split("|");
    if (parts.length < 5) throw new Error(`文本指令缺少参数（至少需要 4 个 "|"）: ${rest}`);
    return [parts[0], parts[1], parts[2], parts[3], parts.slice(4).join("|")];
};

const isNum = (n: number) => Number.isFinite(n);

/** 角度 → 弧度。 */
const rad = (deg: number) => (deg * Math.PI) / 180;

const ENUMS = {
    fillRule: ["nonzero", "evenodd"],
    linecap: ["butt", "round", "square"],
    linejoin: ["miter", "round", "bevel"],
    textalign: ["start", "end", "left", "right", "center"],
    textbaseline: ["top", "hanging", "middle", "alphabetic", "ideographic", "bottom"],
    direction: ["ltr", "rtl"],
    fontkerning: ["auto", "normal", "none"],
    fontstretch: [
        "ultra-condensed",
        "extra-condensed",
        "condensed",
        "semi-condensed",
        "normal",
        "semi-expanded",
        "expanded",
        "extra-expanded",
        "ultra-expanded",
    ],
    fontvariantcaps: [
        "normal",
        "small-caps",
        "all-small-caps",
        "petite-caps",
        "all-petite-caps",
        "unicase",
        "titling-caps",
    ],
    textrendering: ["auto", "optimizeSpeed", "optimizeLegibility", "geometricPrecision"],
    globalcompositeoperation: [
        "source-over",
        "source-in",
        "source-out",
        "source-atop",
        "destination-over",
        "destination-in",
        "destination-out",
        "destination-atop",
        "lighter",
        "copy",
        "xor",
        "multiply",
        "screen",
        "overlay",
        "darken",
        "lighten",
        "color-dodge",
        "color-burn",
        "hard-light",
        "soft-light",
        "difference",
        "exclusion",
        "hue",
        "saturation",
        "color",
        "luminosity",
    ],
    imagesmoothingquality: ["low", "medium", "high"],
} as const;

type EnumKey = keyof typeof ENUMS;

/** 从 CSS font 串里取字号（px / em / pt），取不到按 16px。 */
const fontSizeOf = (font: string): number => {
    const px = /(-?\d*\.?\d+)px/i.exec(font);
    if (px) return Math.abs(parseFloat(px[1]));
    const em = /(-?\d*\.?\d+)em/i.exec(font);
    if (em) return Math.abs(parseFloat(em[1])) * 16;
    const pt = /(-?\d*\.?\d+)pt/i.exec(font);
    if (pt) return Math.abs(parseFloat(pt[1])) * (96 / 72);
    return 16;
};

/** 按 maxWidth 自动换行：优先空格断行，超长片段按字符拆分。 */
const wrapLine = (ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const out: string[] = [];
    const hardSplit = (chunk: string): string => {
        let cur = "";
        for (const ch of chunk) {
            if (cur !== "" && ctx.measureText(cur + ch).width > maxWidth) {
                out.push(cur);
                cur = ch;
            } else {
                cur += ch;
            }
        }
        return cur;
    };
    let line = "";
    for (const token of text.split(/([ \t]+)/)) {
        if (token === "") continue;
        if (line === "") {
            line = (token.startsWith(" ") === false && ctx.measureText(token).width > maxWidth)
                ? hardSplit(token)
                : token;
            continue;
        }
        if (ctx.measureText(line + token).width <= maxWidth) {
            line += token;
            continue;
        }
        out.push(line.replace(/[ \t]+$/, ""));
        line = "";
        if (token.startsWith(" ")) continue; // 换行处的空格丢弃
        line = ctx.measureText(token).width > maxWidth ? hardSplit(token) : token;
    }
    out.push(line.replace(/[ \t]+$/, ""));
    return out;
};

export class DrawingQueue {
    #cmd: Array<string> = [];
    #d: CardDeck;
    #cv: OffscreenCanvas;
    #working: Promise<void> | undefined = undefined;
    #onDraw: (bitmap: ImageBitmap) => void;
    #onError: (errMsg: string) => void;
    /** 当前卡牌/卡面：${var} 取值来源（卡牌覆盖卡面）。 */
    #card?: CardItem;
    #face?: CardFace;
    /** 手动注册的变量，优先级最高。 */
    #vars = new Map<string, string>();
    /** 已解码图片（drawimage 同图多次绘制时避免重复解码）。 */
    #images = new Map<string, CanvasImageSource>();
    /** 解析器自己记录的行高倍数（Canvas 原生无此属性）。 */
    #lineheight = 1.2;
    /** 与 ctx.save/restore 同步的行高栈。 */
    #lineheightStack: number[] = [];
    #scale: number;
    #loadedFonts = new Set<string>();

    constructor(
        deck: CardDeck,
        onDraw: (bitmap: ImageBitmap) => void,
        onError: (errMsg: string) => void,
        /** 当前卡牌/卡面：变量从 card.data → face.data → recordItems.defaultValue 取值。 */
        cardCtx: { card?: CardItem; face?: CardFace } = {},
    ) {
        this.#d = deck;
        this.#card = cardCtx.card;
        this.#face = cardCtx.face;
        this.#scale = deck.sizeScale;
        this.#cv = new OffscreenCanvas(deck.cardWidth * deck.sizeScale, deck.cardHeight * deck.sizeScale);
        const ctx = this.#cv.getContext("2d", { alpha: true })!;
        ctx.clearRect(0, 0, deck.cardWidth * deck.sizeScale, deck.cardHeight * deck.sizeScale);
        ctx.scale(deck.sizeScale, deck.sizeScale);
        this.#onDraw = onDraw;
        this.#onError = onError;
    }

    // ── 资源注册表（覆盖 deck 取值的兜底） ──────────────────────────────

    setVar(name: string, value: string) {
        this.#vars.set(name, value);
    }

    setVars(vars: Record<string, string>) {
        for (const [k, v] of Object.entries(vars)) this.#vars.set(k, String(v));
    }

    setImage(name: string, source: CanvasImageSource) {
        this.#images.set(name, source);
    }

    // ── 参数解析 ────────────────────────────────────────────────────────

    #getVar(name: string): string {
        if (this.#vars.has(name)) return this.#vars.get(name)!;
        // 变量以 recordItems 中的定义为准：visibility 决定从 cardItem / cardFace 取，
        // 都没有（或 visibility 不允许）则用 defaultValue
        const rec = this.#d.recordItems.find((r) => r.name === name);
        if (rec) {
            if ((rec.visibility & Scope.CardItem) && this.#card?.data?.[name] !== undefined) {
                return this.#card.data[name]!;
            }
            if ((rec.visibility & Scope.CardFace) && this.#face?.data?.[name] !== undefined) {
                return this.#face.data[name]!;
            }
            return rec.defaultValue;
        }
        throw new Error(`未定义变量: ${name}`);
    }

    /** ${var} 字符串替换；未知变量报错。替换后不再按 | 重新分割。 */
    #sub(raw: string): string {
        return raw.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => this.#getVar(name));
    }

    #num(raw: string, what = "数字参数"): number {
        const s = this.#sub(raw).trim();
        const n = Number(s);
        if (s === "" || !isNum(n)) throw new Error(`${what} 无法解析为数字: "${raw}" → "${s}"`);
        return n;
    }

    #nums(raws: string[], what = "数字参数"): number[] {
        return raws.map((r) => this.#num(r, what));
    }

    #str(raw: string, what = "字符串参数"): string {
        const s = this.#sub(raw);
        if (s === "") throw new Error(`${what} 不能为空: "${raw}"`);
        return s;
    }

    #bool(raw: string): boolean {
        const s = this.#sub(raw).trim();
        if (s !== "true" && s !== "false") throw new Error(`布尔参数只允许 true / false: "${raw}"`);
        return s === "true";
    }

    #enum(raw: string, key: EnumKey): string {
        const s = this.#sub(raw).trim();
        const allowed: readonly string[] = ENUMS[key];
        // 含驼峰的枚举（如 geometricPrecision）保持原大小写，其余统一小写
        const hasUpper = allowed.some((v) => v !== v.toLowerCase());
        const probe = hasUpper ? s : s.toLowerCase();
        if (!allowed.includes(probe)) {
            throw new Error(`${key} 取值非法: "${s}"（允许: ${allowed.join(" / ")}）`);
        }
        return probe;
    }

    /** 可选的 anticlockwise 尾参。 */
    #optBool(raws: string[], index: number, max: number): boolean {
        if (raws.length > max) throw new Error(`参数过多: ${raws.length}`);
        return raws.length > index ? this.#bool(raws[index]) : false;
    }

    // ── 样式指令 ────────────────────────────────────────────────────────

    #applyStyle(ctx: OffscreenCanvasRenderingContext2D, func: string, rest: string) {
        const single = () => this.#sub(rest); // 整体一个参数，不按 | 分割
        const num = (what: string) => this.#num(rest, what);

        switch (func) {
            case "save":
                this.#lineheightStack.push(this.#lineheight);
                ctx.save();
                return;
            case "restore":
                if (this.#lineheightStack.length > 0) {
                    this.#lineheight = this.#lineheightStack.pop()!;
                }
                ctx.restore();
                return;
            case "reset":
                if (rest !== "") throw new Error("reset 不接受参数");
                if (typeof ctx.reset === "function") ctx.reset();
                else {
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.globalAlpha = 1;
                    ctx.globalCompositeOperation = "source-over";
                    ctx.filter = "none";
                    ctx.shadowColor = "rgba(0, 0, 0, 0)";
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    ctx.lineWidth = 1;
                    ctx.lineCap = "butt";
                    ctx.lineJoin = "miter";
                    ctx.miterLimit = 10;
                    ctx.setLineDash([]);
                    ctx.lineDashOffset = 0;
                    ctx.font = "10px sans-serif";
                    ctx.textAlign = "start";
                    ctx.textBaseline = "alphabetic";
                    ctx.fillStyle = "#000000";
                    ctx.strokeStyle = "#000000";
                }
                // reset 会清掉构造时设置的缩放，这里恢复
                ctx.scale(this.#scale, this.#scale);
                this.#lineheight = 1.2;
                this.#lineheightStack = [];
                return;

            // 填充与描边
            case "fillstyle":
                ctx.fillStyle = single();
                return;
            case "strokestyle":
                ctx.strokeStyle = single();
                return;

            // 线条
            case "linewidth": {
                const v = num("linewidth");
                if (v < 0) throw new Error(`linewidth 必须非负: ${v}`);
                ctx.lineWidth = v;
                return;
            }
            case "linecap":
                ctx.lineCap = this.#enum(rest, "linecap") as CanvasLineCap;
                return;
            case "linejoin":
                ctx.lineJoin = this.#enum(rest, "linejoin") as CanvasLineJoin;
                return;
            case "setlinedash": {
                const dashes = splitPipe(rest).map((p) => {
                    const v = this.#num(p, "setlinedash");
                    if (v < 0) throw new Error(`setlinedash 数字必须非负: ${v}`);
                    return v;
                });
                ctx.setLineDash(dashes);
                return;
            }
            case "linedashoffset":
                ctx.lineDashOffset = num("linedashoffset");
                return;
            case "miterlimit": {
                const v = num("miterlimit");
                if (v < 0) throw new Error(`miterlimit 必须非负: ${v}`);
                ctx.miterLimit = v;
                return;
            }

            // 阴影
            case "shadowcolor":
                ctx.shadowColor = single();
                return;
            case "shadowblur": {
                const v = num("shadowblur");
                if (v < 0) throw new Error(`shadowblur 必须非负: ${v}`);
                ctx.shadowBlur = v;
                return;
            }
            case "shadowoffsetx":
                ctx.shadowOffsetX = num("shadowoffsetx");
                return;
            case "shadowoffsety":
                ctx.shadowOffsetY = num("shadowoffsety");
                return;

            // 文本样式
            case "font":
                ctx.font = single();
                return;
            case "textalign":
                ctx.textAlign = this.#enum(rest, "textalign") as CanvasTextAlign;
                return;
            case "textbaseline":
                ctx.textBaseline = this.#enum(rest, "textbaseline") as CanvasTextBaseline;
                return;
            case "direction":
                ctx.direction = this.#enum(rest, "direction") as CanvasDirection;
                return;
            case "fontkerning":
                ctx.fontKerning = this.#enum(rest, "fontkerning") as CanvasFontKerning;
                return;
            case "fontstretch":
                ctx.fontStretch = this.#enum(rest, "fontstretch") as CanvasFontStretch;
                return;
            case "fontvariantcaps":
                ctx.fontVariantCaps = this.#enum(rest, "fontvariantcaps") as CanvasFontVariantCaps;
                return;
            case "letterspacing":
                ctx.letterSpacing = single();
                return;
            case "wordspacing":
                ctx.wordSpacing = single();
                return;
            case "textrendering":
                ctx.textRendering = this.#enum(rest, "textrendering") as CanvasTextRendering;
                return;
            case "lineheight": {
                const v = num("lineheight");
                if (v < 0) throw new Error(`lineheight 必须非负: ${v}`);
                this.#lineheight = v;
                return;
            }

            // 全局合成与图像平滑
            case "globalalpha": {
                const v = num("globalalpha");
                if (v < 0 || v > 1) throw new Error(`globalalpha 必须在 0 ~ 1 之间: ${v}`);
                ctx.globalAlpha = v;
                return;
            }
            case "globalcompositeoperation":
                ctx.globalCompositeOperation = this.#enum(rest, "globalcompositeoperation") as GlobalCompositeOperation;
                return;
            case "filter":
                ctx.filter = single();
                return;
            case "imagesmoothingenabled":
                ctx.imageSmoothingEnabled = this.#bool(rest);
                return;
            case "imagesmoothingquality":
                ctx.imageSmoothingQuality = this.#enum(rest, "imagesmoothingquality") as ImageSmoothingQuality;
                return;

            default:
                throw new Error(`未知指令: ${func}`);
        }
    }

    // ── 路径指令 ────────────────────────────────────────────────────────

    #applyPath(ctx: OffscreenCanvasRenderingContext2D, func: string, rest: string) {
        const p = splitPipe(rest);
        const none = () => {
            if (p.length > 0) throw new Error(`${func} 不接受参数`);
        };
        const exactly = (n: number) => {
            if (p.length !== n) throw new Error(`${func} 需要 ${n} 个参数，实际 ${p.length} 个`);
        };
        /** fill / clip 的可选 fillRule（整体单参数，不按 | 分割）。 */
        const fillRule = (): CanvasFillRule => rest === "" ? "nonzero" : this.#enum(rest, "fillRule") as CanvasFillRule;

        switch (func) {
            case "beginpath":
                none();
                ctx.beginPath();
                return;
            case "closepath":
                none();
                ctx.closePath();
                return;
            case "moveto": {
                exactly(2);
                const [x, y] = this.#nums(p);
                ctx.moveTo(x, y);
                return;
            }
            case "lineto": {
                exactly(2);
                const [x, y] = this.#nums(p);
                ctx.lineTo(x, y);
                return;
            }
            case "beziercurveto": {
                exactly(6);
                const [c1x, c1y, c2x, c2y, x, y] = this.#nums(p);
                ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
                return;
            }
            case "quadraticcurveto": {
                exactly(4);
                const [cx, cy, x, y] = this.#nums(p);
                ctx.quadraticCurveTo(cx, cy, x, y);
                return;
            }
            case "arc": {
                if (p.length < 5 || p.length > 6) throw new Error(`arc 需要 5~6 个参数，实际 ${p.length} 个`);
                const [x, y, r, sa, ea] = this.#nums(p.slice(0, 5));
                if (r < 0) throw new Error(`arc 的 radius 必须 >= 0: ${r}`);
                ctx.arc(x, y, r, rad(sa), rad(ea), this.#optBool(p, 5, 6));
                return;
            }
            case "arcto": {
                exactly(5);
                const [x1, y1, x2, y2, r] = this.#nums(p);
                if (r < 0) throw new Error(`arcto 的 radius 必须 >= 0: ${r}`);
                ctx.arcTo(x1, y1, x2, y2, r);
                return;
            }
            case "ellipse": {
                if (p.length < 7 || p.length > 8) throw new Error(`ellipse 需要 7~8 个参数，实际 ${p.length} 个`);
                const [x, y, rx, ry, rot, sa, ea] = this.#nums(p.slice(0, 7));
                if (rx < 0 || ry < 0) throw new Error(`ellipse 的 rx / ry 必须 >= 0: ${rx}, ${ry}`);
                ctx.ellipse(x, y, rx, ry, rad(rot), rad(sa), rad(ea), this.#optBool(p, 7, 8));
                return;
            }
            case "rect": {
                exactly(4);
                const [x, y, w, h] = this.#nums(p);
                ctx.rect(x, y, w, h);
                return;
            }
            case "roundrect": {
                if (![5, 6, 8].includes(p.length)) {
                    throw new Error(`roundrect 参数总数只允许 5、6、8 个（radii 为 1/2/4 个），实际 ${p.length} 个`);
                }
                const [x, y, w, h] = this.#nums(p.slice(0, 4));
                const radii = this.#nums(p.slice(4), "roundrect radii");
                for (const r of radii) {
                    if (r < 0) throw new Error(`roundrect 的 radii 必须 >= 0: ${r}`);
                }
                if (typeof ctx.roundRect !== "function") {
                    throw new Error("当前环境不支持 roundRect");
                }
                ctx.roundRect(x, y, w, h, radii.length === 1 ? radii[0] : radii);
                return;
            }
            case "fill":
                ctx.fill(fillRule());
                return;
            case "stroke":
                none();
                ctx.stroke();
                return;
            case "clip":
                ctx.clip(fillRule());
                return;
            default:
                throw new Error(`未知路径指令: ${func}`);
        }
    }

    // ── 矩形 / 图片 / 文本绘制 ──────────────────────────────────────────

    #applyDraw(ctx: OffscreenCanvasRenderingContext2D, func: string, rest: string) {
        const p = splitPipe(rest);

        switch (func) {
            case "fillrect":
            case "strokerect":
            case "clearrect": {
                if (p.length !== 4) throw new Error(`${func} 需要恰好 4 个参数，实际 ${p.length} 个`);
                const [x, y, w, h] = this.#nums(p);
                if (func === "fillrect") ctx.fillRect(x, y, w, h);
                else if (func === "strokerect") ctx.strokeRect(x, y, w, h);
                else ctx.clearRect(x, y, w, h);
                return;
            }
            default:
                throw new Error(`未知绘制指令: ${func}`);
        }
    }

    /** deck.assets 里的 base64 资产 → 新分配的 ArrayBuffer。 */
    #assetBytes(name: string): ArrayBuffer | undefined {
        const asset = this.#d.assets.find((a) => a.name === name);
        if (!asset) return undefined;
        const bin = globalThis.atob(asset.content);
        const buf = new ArrayBuffer(bin.length);
        const u8 = new Uint8Array(buf);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return buf;
    }

    async #getImage(name: string): Promise<CanvasImageSource> {
        if (this.#images.has(name)) return this.#images.get(name)!;
        const buf = this.#assetBytes(name);
        if (buf === undefined) throw new Error(`图片资源不存在或未加载: ${name}`);
        const src = await globalThis.createImageBitmap(new Blob([buf], { type: "image/*" }));
        this.#images.set(name, src);
        return src;
    }

    async #drawImage(ctx: OffscreenCanvasRenderingContext2D, rest: string) {
        const p = splitPipe(rest);
        if (![3, 5, 9].includes(p.length)) {
            throw new Error(`drawimage 参数总数只允许 3、5、9 个，实际 ${p.length} 个`);
        }
        const name = this.#str(p[0], "drawimage 的 image");
        const img = await this.#getImage(name);
        const n = this.#nums(p.slice(1), "drawimage");
        if (n.length === 2) {
            const [dx, dy] = n;
            ctx.drawImage(img, dx, dy);
        } else if (n.length === 4) {
            const [dx, dy, dw, dh] = n;
            ctx.drawImage(img, dx, dy, dw, dh);
        } else {
            const [sx, sy, sw, sh, dx, dy, dw, dh] = n;
            if (sw < 0 || sh < 0) throw new Error(`drawimage 的 sw / sh 必须非负: ${sw}, ${sh}`);
            ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        }
    }

    /** 在 bbox 内布局并绘制文本：换行、对齐、行高、裁剪到 bbox。 */
    #drawText(
        ctx: OffscreenCanvasRenderingContext2D,
        mode: "fill" | "stroke",
        x: number,
        y: number,
        w: number,
        h: number,
        text: string,
    ) {
        if (text === "") return; // 空文本不绘制，但指令成功

        const align = ctx.textAlign as string;
        const baseline = ctx.textBaseline as string;
        const fontSize = fontSizeOf(ctx.font);
        const lh = fontSize * this.#lineheight;

        // 换行：text 中的真实换行符强制换行（换行不影响指令解析），
        // 其余按 bbox 宽度自动换行
        const lines: string[] = [];
        for (const para of text.split(/\r?\n/)) {
            for (const l of wrapLine(ctx, para, w)) lines.push(l);
        }

        // 行高只影响多行布局
        const blockH = lines.length > 1 ? lines.length * lh : fontSize;

        let y0: number;
        if (baseline === "middle") y0 = y + (h - blockH) / 2 + (lines.length > 1 ? lh / 2 : 0);
        else if (baseline === "bottom" || baseline === "alphabetic" || baseline === "ideographic") {
            y0 = y + h - blockH + (lines.length > 1 ? lh / 2 : 0);
        } else {
            y0 = y + (lines.length > 1 ? lh / 2 : 0); // top / hanging / 其他按 top
        }

        let ax: number;
        let ha: CanvasTextAlign;
        // start/end 是逻辑方向，随 ctx.direction 翻转；left/right 是物理方向
        const rtl = ctx.direction === "rtl";
        if (align === "center") {
            ax = x + w / 2;
            ha = "center";
        } else if (align === "right" || (align === "end" && !rtl) || (align === "start" && rtl)) {
            ax = x + w;
            ha = "right";
        } else if (align === "left" || (align === "start" && !rtl) || (align === "end" && rtl)) {
            ax = x;
            ha = "left";
        } else {
            ax = x;
            ha = "left";
        } // 其他按 left

        ctx.save();
        try {
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.textAlign = ha;
            lines.forEach((line, i) => {
                const ly = y0 + i * lh;
                if (mode === "fill") ctx.fillText(line, ax, ly);
                else ctx.strokeText(line, ax, ly);
            });
        } finally {
            ctx.restore(); // clip 不影响后续绘制
        }
    }

    async #drawTextCommand(ctx: OffscreenCanvasRenderingContext2D, func: string, rest: string) {
        const [rx, ry, rw, rh, rtext] = splitFirstFour(rest);
        const x = this.#num(rx, `${func} x`);
        const y = this.#num(ry, `${func} y`);
        const w = this.#num(rw, `${func} w`);
        const h = this.#num(rh, `${func} h`);
        if (w <= 0 || h <= 0) throw new Error(`${func} 的 w、h 必须为正数: ${w}, ${h}`);
        const text = this.#sub(rtext); // text 内部的 | 不再分割，允许为空
        this.#drawText(ctx, func === "filltext" ? "fill" : "stroke", x, y, w, h, text);
    }

    // ── fontface ────────────────────────────────────────────────────────

    async #fontface(rest: string) {
        const p = rest.split("|");
        if (p.length !== 2) throw new Error(`fontface 需要恰好 2 个参数（family|source），实际 ${p.length} 个`);
        const family = this.#str(p[0], "fontface family");
        const source = this.#str(p[1], "fontface source");
        const data = this.#assetBytes(source);
        if (!data) throw new Error(`字体资源不存在: ${source}`);
        const FontFaceCtor = globalThis.FontFace;
        // 主线程是 document.fonts，worker 里字体集合挂在 self.fonts 上。
        const fonts = globalThis.document?.fonts ?? (globalThis as unknown as { fonts?: FontFaceSet }).fonts;
        if (!FontFaceCtor || !fonts) throw new Error("当前环境不支持 FontFace 加载");
        const face = new FontFaceCtor(family, data);
        await face.load();
        fonts.add(face); // 同名覆盖
        this.#loadedFonts.add(family);
    }

    // ── 指令分发 ────────────────────────────────────────────────────────

    async _draw(cmd: string) {
        const { func, rest } = parseDrawCommand(cmd);
        const ctx = this.#cv.getContext("2d")!;

        // 异步指令
        switch (func) {
            case "fontface":
                await this.#fontface(rest);
                return;
            case "drawimage":
                await this.#drawImage(ctx, rest);
                return;
            case "filltext":
            case "stroketext":
                await this.#drawTextCommand(ctx, func, rest);
                return;
        }
        // 三类同步指令
        if (PATH_FUNCS.has(func)) this.#applyPath(ctx, func, rest);
        else if (RECT_FUNCS.has(func)) this.#applyDraw(ctx, func, rest);
        else this.#applyStyle(ctx, func, rest); // 未知指令在这里报错
    }

    _startTask() {
        if (this.#working) return;
        const run = (async () => {
            await Promise.resolve();
            while (this.#cmd.length > 0) {
                const cmd = this.#cmd.shift()!;
                try {
                    await this._draw(cmd);
                    // 注意：不能用 transferToImageBitmap()——它会清空画布，
                    // 使每条指令只交付"增量"，跨指令的累积效果（合成模式、
                    // 多行文本、clearrect 等）会丢失。createImageBitmap 保留画布内容。
                    this.#onDraw(await globalThis.createImageBitmap(this.#cv));
                } catch (err) {
                    const msg = (err instanceof Error) ? err.message : `${err}`;
                    this.#onError(msg);
                    // cancel all following commands.
                    this.#cmd.splice(0);
                    break;
                }
            }
        })();
        this.#working = run.finally(() => {
            this.#working = undefined;
        });
    }

    submitDrawCommand(cmd: string) {
        this.#cmd.push(cmd);
        this._startTask();
    }

    waitFinish() {
        return this.#working ? this.#working : Promise.resolve();
    }
}

/** 路径构建 / 路径绘制裁剪指令集合。 */
const PATH_FUNCS = new Set([
    "beginpath",
    "closepath",
    "moveto",
    "lineto",
    "beziercurveto",
    "quadraticcurveto",
    "arc",
    "arcto",
    "ellipse",
    "rect",
    "roundrect",
    "fill",
    "stroke",
    "clip",
]);

/** 矩形快捷绘制指令集合。 */
const RECT_FUNCS = new Set(["fillrect", "strokerect", "clearrect"]);
