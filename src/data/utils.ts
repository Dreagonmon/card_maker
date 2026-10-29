/**
 * Uint8Array -> byte-string
 * 每个字符的 charCode 就是对应字节的值（0~255），即 latin1 / binary string。
 */
export const bytesToByteString = (bytes: Uint8Array) => {
    const parts: string[] = [];
    bytes.forEach((byte) => parts.push(String.fromCharCode(byte)));
    return parts.join("");
}

/**
 * byte-string -> Uint8Array
 * 超出 0~255 的字符会抛错（防止悄悄丢数据）。
 */
export const byteStringToBytes = (str: string) => {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code > 0xff) {
            throw new RangeError(`第 ${i} 个字符码点 ${code} 超出字节范围 (0~255)`);
        }
        out[i] = code;
    }
    return out;
}
