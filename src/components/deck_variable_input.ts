import { DataRecordType, mapEnumRangeToValueNameMap } from "../data/deck.ts";

interface DataRecordTypeElementTypeMap {
    [DataRecordType.Unknown]: HTMLInputElement;
    [DataRecordType.Boolean]: HTMLInputElement;
    [DataRecordType.Number]: HTMLInputElement;
    [DataRecordType.Text]: HTMLInputElement;
    [DataRecordType.MultilineText]: HTMLTextAreaElement;
    [DataRecordType.TextEnum]: HTMLSelectElement;
}

export type InputElementType = DataRecordTypeElementTypeMap[keyof DataRecordTypeElementTypeMap];

type ElementBuilderMap = {
    [K in keyof DataRecordTypeElementTypeMap]: (range: string, initValue: string) => DataRecordTypeElementTypeMap[K];
};

const builders: ElementBuilderMap = {
    [DataRecordType.Unknown]: (_range: string, initValue: string) => {
        const input = Object.assign(document.createElement("input"), { type: "text" });
        input.value = initValue;
        return input;
    },
    [DataRecordType.Boolean]: (_range: string, initValue: string) => {
        const input = Object.assign(document.createElement("input"), { type: "checkbox" });
        const value = Number.parseInt(initValue);
        if (value) input.checked = true;
        return input;
    },
    [DataRecordType.Number]: (_range: string, initValue: string) => {
        const input = Object.assign(document.createElement("input"), { type: "number" });
        input.value = initValue;
        return input;
    },
    [DataRecordType.Text]: (_range: string, initValue: string) => {
        const input = Object.assign(document.createElement("input"), { type: "text" });
        input.value = initValue;
        return input;
    },
    [DataRecordType.MultilineText]: (_range: string, initValue: string) => {
        const textarea = document.createElement("textarea");
        textarea.value = initValue;
        return textarea;
    },
    [DataRecordType.TextEnum]: (range: string, initValue: string) => {
        const select = document.createElement("select");
        const map = mapEnumRangeToValueNameMap(range);
        for (const [val, disp] of map) {
            const option = Object.assign(document.createElement("option"), {
                innerText: disp,
                value: val,
            });
            select.appendChild(option);
        }
        select.value = initValue;
        return select;
    },
};

export const buildInputElement = <K extends keyof DataRecordTypeElementTypeMap>(
    type: K,
    range: string,
    initValue: string,
): DataRecordTypeElementTypeMap[K] => builders[type](range, initValue);

type ElementReaderMap = {
    [K in keyof DataRecordTypeElementTypeMap]: (elem: DataRecordTypeElementTypeMap[K]) => string;
};

const readers: ElementReaderMap = {
    [DataRecordType.Unknown]: (elem) => {
        return elem.value;
    },
    [DataRecordType.Boolean]: (elem) => {
        return elem.checked ? "1" : "0";
    },
    [DataRecordType.Number]: (elem) => {
        return elem.value;
    },
    [DataRecordType.Text]: (elem) => {
        return elem.value;
    },
    [DataRecordType.MultilineText]: (elem) => {
        return elem.value;
    },
    [DataRecordType.TextEnum]: (elem) => {
        return elem.value;
    },
};

export const getInputValue = <K extends keyof DataRecordTypeElementTypeMap>(
    type: K,
    elem: DataRecordTypeElementTypeMap[K],
): string => readers[type](elem as DataRecordTypeElementTypeMap[K]);
