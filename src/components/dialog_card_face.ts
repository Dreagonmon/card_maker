import { CardFace, DataRecordItem, Scope } from "../data/deck.ts";
import { globalDeck } from "../data/global_deck.ts";
import { buildInputElement, getInputValue, InputElementType } from "./deck_variable_input.ts";
import { MDialog } from "./dialog.ts";

const localCollator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
}); // string compare

const getCurrentDialogInput = (dialog: MDialog<CardFace>) => {
    const data: CardFace = {
        id: -1,
        displayName: "",
        executable: "",
        entryFunction: "",
        data: {},
    };
    data.id = Number.parseInt((dialog.querySelector("#cf-id") as HTMLInputElement).value ?? "-1");
    data.displayName = (dialog.querySelector("#cf-display-name") as HTMLInputElement).value ?? "";
    data.executable = (dialog.querySelector("#cf-executable") as HTMLInputElement).value ?? "";
    data.entryFunction = (dialog.querySelector("#cf-entry-function") as HTMLInputElement).value ?? "";
    // map fields
    const fields: Map<string, DataRecordItem> = new Map();
    for (const field of globalDeck.getDeck().recordItems) {
        if (!(field.visibility & Scope.CardFace)) {
            // filter card face type
            continue;
        }
        fields.set(field.name, field);
    }
    for (const elem of dialog.querySelectorAll(".cf-record-field") as NodeListOf<InputElementType>) {
        const fieldName = elem.dataset.name;
        if (!fieldName) continue;
        const field = fields.get(fieldName);
        if (!field) continue;
        // get value
        const value = getInputValue(field.type, elem);
        data.data[fieldName] = value;
    }
    return data;
};

export const initDialog = (data: CardFace) => {
    const PFX = "r" + crypto.randomUUID();
    const dialog: MDialog<CardFace> = new MDialog();
    const styleText = /*css*/ `
.${PFX}-field-item {
    display: flex;
    align-items: start;
}
.${PFX}-field-item:not(:first-child) {
    margin-top: 0.5rem;
}
.${PFX}-field-item label {
    flex: 0 0 auto;
    display: inline-block;
    width: 8rem;
    font-size: 1rem;
}
.${PFX}-field-item input:not([type=hidden]),
.${PFX}-field-item textarea,
.${PFX}-field-item select {
    flex: 1 1 auto;
    width: 12rem;
}
.${PFX}-field-item textarea {
    resize: none;
}
.${PFX}-field-panel {
    display: flex;
    width: 100%;
    margin-top: 0.5rem;
    justify-content: space-evenly;
    align-items: center;
}
    `;
    dialog.innerHTML = /*html*/ `
<style>
    ${styleText}
</style>
<div class="${PFX}-field-dialog">
    <input id="cf-id" type="hidden" value="-1"/>
    <div class="${PFX}-field-item">
        <label>卡面名称:</label>
        <input id="cf-display-name" type="text"/>
    </div>
    <div class="${PFX}-field-item">
        <label>渲染程序:</label>
        <input id="cf-executable" type="text"/>
    </div>
    <div class="${PFX}-field-item">
        <label>程序函数名:</label>
        <input id="cf-entry-function" type="text"/>
    </div>
    <div class="${PFX}-field-panel" id="cf-field-end">
        <button class="${PFX}-btn-cancel">取消</button>
        <button class="${PFX}-btn-save">保存</button>
    </div>
</div>
    `;
    dialog.querySelector(`button.${PFX}-btn-cancel`)?.addEventListener("click", () => {
        dialog.resetResult();
        dialog.hide();
    });
    dialog.querySelector(`button.${PFX}-btn-save`)?.addEventListener("click", () => {
        const result = getCurrentDialogInput(dialog);
        dialog.setResult(result);
        dialog.hide();
    });

    // init value fields
    (dialog.querySelector("#cf-id") as HTMLInputElement).value = data.id.toString();
    (dialog.querySelector("#cf-display-name") as HTMLInputElement).value = data.displayName;
    (dialog.querySelector("#cf-executable") as HTMLInputElement).value = data.executable;
    (dialog.querySelector("#cf-entry-function") as HTMLInputElement).value = data.entryFunction;
    const endElement = dialog.querySelector("#cf-field-end")!;
    const recordFields = [...globalDeck.getDeck().recordItems];
    recordFields.sort((a, b) => localCollator.compare(a.displayName, b.displayName));
    for (const field of recordFields) {
        if (!(field.visibility & Scope.CardFace)) {
            // filter card face type
            continue;
        }
        const div = document.createElement("div");
        div.classList.add(`${PFX}-field-item`);
        const label = document.createElement("label");
        label.innerText = field.displayName;
        div.appendChild(label);
        const elem = buildInputElement(field.type, field.range, data.data[field.name] ?? "");
        elem.classList.add("cf-record-field");
        if (elem instanceof HTMLTextAreaElement) {
            elem.rows = 3;
        }
        elem.dataset.name = field.name;
        div.appendChild(elem);
        endElement.before(div);
    }
    return dialog;
};

export const editCardFace = async (item: CardFace) => {
    const dialog = initDialog(item);
    try {
        document.body.appendChild(dialog);
        dialog.show();
        const result = await dialog.waitResult();
        return result;
    } finally {
        document.body.removeChild(dialog);
    }
};
