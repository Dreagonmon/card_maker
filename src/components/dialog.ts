const CUSTOM_ELEMENT_NAME_DIALOG = "m-dialog";

export type DialogDataType = Partial<Record<string, unknown>>;

export class MDialog<T extends DialogDataType> extends HTMLElement {
    #root: ShadowRoot;
    #result: T | undefined = undefined;
    #waiting: Array<((result: T | undefined) => unknown)> = [];
    constructor() {
        super();
        this.#root = this.attachShadow({ mode: "open" });
        const styleText = /*css*/ `
* {
    box-sizing:border-box;
}
:host {
    --color-bg: white;
}
:host {
    display: none;
    position: fixed;
    z-index: 9999;
    top: 0;
    left: 0;
    right: 0;
    height: 0;
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    max-height: 100vh;
    background: rgba(0, 0, 0, 0.3);
    flex-direction: column;
    justify-content: center;
    align-items: center;
}
.m-dialog {
    max-width: 100%;
    max-height: 100%;
    background: var(--color-bg);
    padding: 1rem;
    border-radius: 0.5rem;
    overflow: auto;
}
.m-dialog>div {
    width: fit-content;
    height: fit-content;
}
        `;
        this.#root.innerHTML = /*html*/ `
<style>
    ${styleText}
</style>
<div class="m-dialog">
    <div>
        <slot>Dialog</slot>
    </div>
</div>
        `;
    }

    show() {
        this.style.display = "flex";
    }

    hide() {
        this.style.display = "none";
    }

    resetResult() {
        this.#result = undefined;
        for (const cb of this.#waiting) {
            cb(this.#result);
        }
        this.#waiting.splice(0, this.#waiting.length);
    }

    setResult(value: T) {
        this.#result = value;
        for (const cb of this.#waiting) {
            cb(this.#result);
        }
        this.#waiting.splice(0, this.#waiting.length);
    }

    getResult() {
        return this.#result;
    }

    waitResult() {
        if (this.#result !== undefined) {
            return Promise.resolve(this.#result);
        }
        return new Promise((resolve: (r: T | undefined) => void) => {
            this.#waiting.push(resolve);
        });
    }
}

export const defineCustomElements = () => {
    customElements.define(CUSTOM_ELEMENT_NAME_DIALOG, MDialog);
};

export const dialogAlert = async (msg: string) => {
    const PFX = "r" + crypto.randomUUID();
    const dialog = new MDialog();
    const styleText = /*css*/ `
.${PFX}-alert-dialog {
    display: flex;
    flex-direction: column;
    align-items: center;
}
.${PFX}-alert-pre {
    max-width: min(90vw, 32rem);
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
}
.${PFX}-alert-btn-ok {
    margin-top: 1rem;
}
    `;
    dialog.innerHTML = /*html*/ `
<style>
    ${styleText}
</style>
<div class="${PFX}-alert-dialog">
    <div>
        <pre class="${PFX}-alert-pre"></pre>
    </div>
    <div>
        <button class="${PFX}-alert-btn-ok">好的</button>
    </div>
</div>
    `;
    (dialog.querySelector(`pre.${PFX}-alert-pre`) as HTMLPreElement).innerText = msg;
    document.body.appendChild(dialog);
    try {
        return await new Promise((resolve: (value: void) => void) => {
            dialog.show();
            (dialog.querySelector(`button.${PFX}-alert-btn-ok`) as HTMLButtonElement).addEventListener(
                "click",
                () => resolve(),
                {
                    once: true,
                },
            );
        });
    } finally {
        dialog.hide();
        document.body.removeChild(dialog);
    }
};

export const dialogConfirm = async (msg: string) => {
    const PFX = "r" + crypto.randomUUID();
    const dialog = new MDialog();
    const styleText = /*css*/ `
.${PFX}-confirm-dialog {
    display: flex;
    flex-direction: column;
    align-items: center;
}
.${PFX}-confirm-pre {
    max-width: min(90vw, 32rem);
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
}
.${PFX}-confirm-btn-cancel {
    margin-top: 1rem;
}
.${PFX}-confirm-btn-ok {
    margin-top: 1rem;
    margin-left: 1rem;
}
    `;
    dialog.innerHTML = /*html*/ `
<style>
    ${styleText}
</style>
<div class="${PFX}-confirm-dialog">
    <div>
        <pre class="${PFX}-confirm-pre"></pre>
    </div>
    <div>
        <button class="${PFX}-confirm-btn-cancel">取消</button>
        <button class="${PFX}-confirm-btn-ok">确定</button>
    </div>
</div>
    `;
    (dialog.querySelector(`pre.${PFX}-confirm-pre`) as HTMLPreElement).innerText = msg;
    document.body.appendChild(dialog);
    try {
        return await new Promise((resolve: (value: boolean) => void) => {
            dialog.show();
            (dialog.querySelector(`button.${PFX}-confirm-btn-cancel`) as HTMLButtonElement).addEventListener(
                "click",
                () => resolve(false),
                {
                    once: true,
                },
            );
            (dialog.querySelector(`button.${PFX}-confirm-btn-ok`) as HTMLButtonElement).addEventListener(
                "click",
                () => resolve(true),
                {
                    once: true,
                },
            );
        });
    } finally {
        dialog.hide();
        document.body.removeChild(dialog);
    }
};

export const dialogPrompt = async (msg: string, initValue: string = "") => {
    const PFX = "r" + crypto.randomUUID();
    const dialog = new MDialog();
    const styleText = /*css*/ `
.${PFX}-prompt-dialog {
    display: flex;
    flex-direction: column;
    align-items: center;
}
.${PFX}-prompt-pre-div {
    align-self: flex-start;
}
.${PFX}-prompt-pre {
    max-width: min(90vw, 32rem);
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
}
.${PFX}-prompt-input-div {
    width: 100%;
}
.${PFX}-prompt-input {
    margin-top: 1rem;
    width: 100%;
    padding: 0.25rem;
}
.${PFX}-prompt-btn-div {
    align-self: center;
}
.${PFX}-prompt-btn-cancel {
    margin-top: 1rem;
}
.${PFX}-prompt-btn-ok {
    margin-top: 1rem;
    margin-left: 1rem;
}
    `;
    dialog.innerHTML = /*html*/ `
<style>
    ${styleText}
</style>
<div class="${PFX}-prompt-dialog">
    <div class="${PFX}-prompt-pre-div">
        <pre class="${PFX}-prompt-pre"></pre>
    </div>
    <div class="${PFX}-prompt-input-div">
        <input class="${PFX}-prompt-input" type="text"/>
    </div>
    <div class="${PFX}-prompt-btn-div">
        <button class="${PFX}-prompt-btn-cancel">取消</button>
        <button class="${PFX}-prompt-btn-ok">确定</button>
    </div>
</div>
    `;
    (dialog.querySelector(`pre.${PFX}-prompt-pre`) as HTMLPreElement).innerText = msg;
    (dialog.querySelector(`input.${PFX}-prompt-input`) as HTMLInputElement).value = initValue;
    document.body.appendChild(dialog);
    try {
        return await new Promise((resolve: (value: string | undefined) => void) => {
            dialog.show();
            (dialog.querySelector(`input.${PFX}-prompt-input`) as HTMLInputElement).focus();
            (dialog.querySelector(`input.${PFX}-prompt-input`) as HTMLInputElement).select();
            (dialog.querySelector(`button.${PFX}-prompt-btn-cancel`) as HTMLButtonElement).addEventListener(
                "click",
                () => resolve(undefined),
                {
                    once: true,
                },
            );
            (dialog.querySelector(`button.${PFX}-prompt-btn-ok`) as HTMLButtonElement).addEventListener(
                "click",
                () => resolve((dialog.querySelector(`input.${PFX}-prompt-input`) as HTMLInputElement).value),
                {
                    once: true,
                },
            );
        });
    } finally {
        dialog.hide();
        document.body.removeChild(dialog);
    }
};
