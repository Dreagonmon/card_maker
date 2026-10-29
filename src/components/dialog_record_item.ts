import { DataRecordItem, DataRecordType, Scope } from "../data/deck.ts";
import { DATA_TYPE_NAME_MAPPING, SCOPE_NAME_MAPPING } from "../data/deck.ts";
import { MDialog } from "./dialog.ts";

const getCurrentDialogInput = (dialog: MDialog<DataRecordItem>) => {
    const data: DataRecordItem = {
        id: 0,
        displayName: "",
        name: "",
        type: 0,
        range: "",
        defaultValue: "",
        visibility: 0,
    };
    data.id = Number.parseInt((dialog.querySelector("#dri-id") as HTMLInputElement).value ?? "-1");
    data.displayName = (dialog.querySelector("#dri-display-name") as HTMLInputElement).value ?? "";
    data.name = (dialog.querySelector("#dri-name") as HTMLInputElement).value ?? "";
    data.type = Number.parseInt((dialog.querySelector("#dri-type") as HTMLSelectElement).value ?? "0");
    data.range = (dialog.querySelector("#dri-range") as HTMLTextAreaElement).value ?? "";
    data.defaultValue = (dialog.querySelector("#dri-default-value") as HTMLTextAreaElement).value ?? "";
    data.visibility = Number.parseInt((dialog.querySelector("#dri-visibility") as HTMLSelectElement).value ?? "0");
    return data;
};

const setCurrentDialogInput = (dialog: MDialog<DataRecordItem>, data: DataRecordItem) => {
    (dialog.querySelector("#dri-id") as HTMLInputElement).value = data.id.toString();
    (dialog.querySelector("#dri-display-name") as HTMLInputElement).value = data.displayName;
    (dialog.querySelector("#dri-name") as HTMLInputElement).value = data.name;
    (dialog.querySelector("#dri-type") as HTMLSelectElement).value = data.type.toString();
    (dialog.querySelector("#dri-range") as HTMLTextAreaElement).value = data.range;
    (dialog.querySelector("#dri-default-value") as HTMLTextAreaElement).value = data.defaultValue;
    (dialog.querySelector("#dri-visibility") as HTMLSelectElement).value = data.visibility.toString();
};

export const initDialog = () => {
    const PFX = "r" + crypto.randomUUID();
    const dialog: MDialog<DataRecordItem> = new MDialog();
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
    <div class="${PFX}-field-item">
        <label>数据项名称:</label>
        <input id="dri-display-name" type="text"/>
    </div>
    <div class="${PFX}-field-item">
        <label>变量名:</label>
        <input id="dri-name" type="text"/>
    </div>
    <div class="${PFX}-field-item">
        <label>变量类型:</label>
        <select id="dri-type">
            <option value="${DataRecordType.Boolean}">${DATA_TYPE_NAME_MAPPING[DataRecordType.Boolean]}</option>
            <option value="${DataRecordType.Number}">${DATA_TYPE_NAME_MAPPING[DataRecordType.Number]}</option>
            <option value="${DataRecordType.Text}">${DATA_TYPE_NAME_MAPPING[DataRecordType.Text]}</option>
            <option value="${DataRecordType.MultilineText}">${
        DATA_TYPE_NAME_MAPPING[DataRecordType.MultilineText]
    }</option>
            <option value="${DataRecordType.TextEnum}">${DATA_TYPE_NAME_MAPPING[DataRecordType.TextEnum]}</option>
        </select>
    </div>
    <div class="${PFX}-field-item">
        <label>取值范围:</label>
        <textarea id="dri-range" rows="5"></textarea>
    </div>
    <div class="${PFX}-field-item">
        <label>默认值:</label>
        <textarea id="dri-default-value" rows="5"></textarea>
    </div>
    <div class="${PFX}-field-item">
        <label>可见性:</label>
        <select id="dri-visibility">
            <option value="0">隐藏</option>
            <option value="${Scope.CardFace}">${SCOPE_NAME_MAPPING[Scope.CardFace]}</option>
            <option value="${Scope.CardItem}">${SCOPE_NAME_MAPPING[Scope.CardItem]}</option>
            <option value="${Scope.CardFace | Scope.CardItem}">${SCOPE_NAME_MAPPING[Scope.CardFace]}, ${
        SCOPE_NAME_MAPPING[Scope.CardItem]
    }</option>
        </select>
    </div>
    <div class="${PFX}-field-panel">
        <button class="${PFX}-btn-cancel">取消</button>
        <button class="${PFX}-btn-save">保存</button>
    </div>
    <input id="dri-id" type="hidden" value="-1"/>
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
    return dialog;
};

export const editDataRecordItem = async (item: DataRecordItem) => {
    const dialog = initDialog();
    setCurrentDialogInput(dialog, item);
    try {
        document.body.appendChild(dialog);
        dialog.show();
        const result = await dialog.waitResult();
        return result;
    } finally {
        document.body.removeChild(dialog);
    }
};
