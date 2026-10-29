import { MDialog } from "./dialog.ts";

export type TextDataType = {
    text: string;
};

const getCurrentDialogInput = (dialog: MDialog<TextDataType>) => {
    const data: TextDataType = {
        text: "",
    };
    data.text = (dialog.querySelector("#ate-textarea") as HTMLTextAreaElement).value;
    return data;
};

const setCurrentDialogInput = (dialog: MDialog<TextDataType>, data: TextDataType) => {
    (dialog.querySelector("#ate-textarea") as HTMLTextAreaElement).value = data.text;
};

export const initDialog = () => {
    const PFX = "r" + crypto.randomUUID();
    const dialog: MDialog<TextDataType> = new MDialog();
    const styleText = /*css*/ `
.${PFX}-field-dialog {
    width: 85vw;
    height: 85vh;
    display: flex;
    flex-direction: column;
}
.${PFX}-field-dialog>label {
    flex: 0 0 auto;
}
.${PFX}-field-dialog>textarea {
    flex: 1 1 auto;
    margin-top: 0.5rem;
    resize: none;
}
.${PFX}-field-panel {
    flex: 0 0 auto;
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
    <label>文本:</label>
    <textarea id="ate-textarea" rows="5"></textarea>
    <div class="${PFX}-field-panel">
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
    return dialog;
};

export const editTextFile = async (item: TextDataType) => {
    const dialog = initDialog();
    setCurrentDialogInput(dialog, item);
    try {
        document.body.appendChild(dialog);
        dialog.show();
        (dialog.querySelector("#ate-textarea") as HTMLTextAreaElement).focus();
        const result = await dialog.waitResult();
        return result?.text;
    } finally {
        document.body.removeChild(dialog);
    }
};
