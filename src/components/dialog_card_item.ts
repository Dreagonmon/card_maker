import { CardItem, DataRecordItem, Scope } from "../data/deck.ts";
import { globalDeck } from "../data/global_deck.ts";
import { buildInputElement, getInputValue, InputElementType } from "./deck_variable_input.ts";
import { MDialog } from "./dialog.ts";

const localCollator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
}); // string compare

const getCurrentDialogInput = (dialog: MDialog<CardItem>) => {
    const data: CardItem = {
        id: -1,
        frontFaceId: -1,
        backFaceId: -1,
        data: {},
    };
    data.id = Number.parseInt((dialog.querySelector("#ci-id") as HTMLInputElement).value ?? "-1");
    data.frontFaceId = Number.parseInt((dialog.querySelector("#ci-front-face-id") as HTMLInputElement).value ?? "-1");
    data.backFaceId = Number.parseInt((dialog.querySelector("#ci-back-face-id") as HTMLInputElement).value ?? "-1");
    // map fields
    const fields: Map<string, DataRecordItem> = new Map();
    for (const field of globalDeck.getDeck().recordItems) {
        if (!(field.visibility & Scope.CardItem)) {
            // filter card face type
            continue;
        }
        fields.set(field.name, field);
    }
    for (const elem of dialog.querySelectorAll(".ci-record-field") as NodeListOf<InputElementType>) {
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

export const initDialog = (data: CardItem) => {
    const PFX = "r" + crypto.randomUUID();
    const dialog: MDialog<CardItem> = new MDialog();
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
    <input id="ci-id" type="hidden" value="-1"/>
    <div class="${PFX}-field-item">
        <label>正面模版</label>
        <select id="ci-front-face-id">
            <option value="-1" selected>[无]</option>
        </select>
    </div>
    <div class="${PFX}-field-item">
        <label>反面模版</label>
        <select id="ci-back-face-id">
            <option value="-1" selected>[无]</option>
        </select>
    </div>
    <div class="${PFX}-field-panel" id="ci-field-end">
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
    (dialog.querySelector("#ci-id") as HTMLInputElement).value = data.id.toString();
    const endElement = dialog.querySelector("#ci-field-end")!;
    // card face options
    const cardFaceIdNameMap = globalDeck.getCardFaceIdNameMap();
    for (
        const [selId, field] of [
            ["#ci-front-face-id", "frontFaceId"],
            ["#ci-back-face-id", "backFaceId"],
        ] as Array<[string, keyof CardItem]>
    ) {
        const sel = dialog.querySelector(selId) as HTMLSelectElement;
        for (const [val, disp] of cardFaceIdNameMap) {
            const option = Object.assign(document.createElement("option"), {
                innerText: disp,
                value: val,
            });
            sel.appendChild(option);
        }
        if (cardFaceIdNameMap.has(data[field] as number)) {
            sel.value = (data[field] as number).toString();
        }
    }
    // more options
    const recordFields = [...globalDeck.getDeck().recordItems];
    recordFields.sort((a, b) => localCollator.compare(a.displayName, b.displayName));
    for (const field of recordFields) {
        if (!(field.visibility & Scope.CardItem)) {
            // filter card face type
            continue;
        }
        const div = document.createElement("div");
        div.classList.add(`${PFX}-field-item`);
        const label = document.createElement("label");
        label.innerText = field.displayName;
        div.appendChild(label);
        const elem = buildInputElement(field.type, field.range, data.data[field.name] ?? "");
        elem.classList.add("ci-record-field");
        if (elem instanceof HTMLTextAreaElement) {
            elem.rows = 3;
        }
        elem.dataset.name = field.name;
        div.appendChild(elem);
        endElement.before(div);
    }
    return dialog;
};

export const editCardItem = async (item: CardItem) => {
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
