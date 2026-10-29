let tabIdCounter = 0;

export const CUSTOM_ELEMENT_NAME_TAB = "m-tab";
export const CUSTOM_ELEMENT_NAME_TABPANE = "m-tabpane";

export class TabChangedEvent extends Event {
    data = {
        from: 0,
        to: 0,
    };
    constructor(name: string, from: number, to: number) {
        super(name);
        this.data.from = from;
        this.data.to = to;
    }
}

interface TabPaneEventMap {
    change: TabChangedEvent;
}

// Tab 作为一个面板容器，类似一个最大化的div，期望占满父容器
export class Tab extends HTMLElement {
    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = /*html*/ `
<style>
    :host {
    display: block;
    height: 100%;
    width: 100%;
    max-height: 100%;
    max-width: 100%;
    overflow: hidden;
}
</style>
<slot></slot>
        `;
    }

    connectedCallback() {
        if (!this.id) this.id = `${CUSTOM_ELEMENT_NAME_TAB}-${++tabIdCounter}`;
        this.setAttribute("role", "tabpanel");
        this.setAttribute("tabindex", "0");
    }
}

export class TabPane extends HTMLElement {
    #tablist: HTMLDivElement;
    #slot: HTMLSlotElement;
    #buttons: Array<HTMLElement> = [];
    #panels: Array<HTMLElement> = [];
    #current = 0;
    #initialized = false;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = /*html*/ `
<style>
:host {
    display: block;
    height: 100%;
    width: 100%;
    max-height: 100%;
    max-width: 100%;
    overflow: auto;
    box-sizing: border-box;
}
.tablist {
    display: flex;
    box-sizing: border-box;
}
button {
    all: unset;
    padding: 8px 16px;
    cursor: pointer;
    color: #555;
    border-bottom: 2px solid #DDD;
    user-select: none;
    transition: color .15s, border-color .15s;
}
button:hover { color: #007bff; }
button:focus-visible {
    border: 2px solid #007bff;
    outline-offset: 2px;
    border-radius: 4px;
}
button[aria-selected="true"] {
    color: #007bff;
    border-bottom-color: #007bff;
    font-weight: 600;
}
.tabpane {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}
.tablist {
    flex: 0 0 auto;
    overflow-x: auto;
    white-space: nowrap;
}
.panels {
    flex: 1 1 auto;
    padding: 0;
    margin: 0;
    overflow: hidden;
}
::slotted(${CUSTOM_ELEMENT_NAME_TAB}) { display: none; }
::slotted(${CUSTOM_ELEMENT_NAME_TAB}[active]) {
    display: block;
}
</style>
<div class="tabpane">
    <div class="tablist" role="tablist" aria-label="选项卡"></div>
    <div class="panels"><slot></slot></div>
</div>
        `;
        this.#tablist = root.querySelector(".tablist") as HTMLDivElement;
        this.#slot = root.querySelector("slot") as HTMLSlotElement;
    }

    connectedCallback() {
        if (!this.#initialized) {
            this.#slot.addEventListener("slotchange", () => this.#build());
            this.#initialized = true;
        }
        this.#build();
    }

    #build() {
        this.#panels = Array.from(this.querySelectorAll(`:scope > ${CUSTOM_ELEMENT_NAME_TAB}`));
        if (this.#panels.length === 0) return;

        // 确保每个面板都有 id
        for (const p of this.#panels) {
            if (!p.id) p.id = `${CUSTOM_ELEMENT_NAME_TAB}-${++tabIdCounter}`;
        }

        // 决定默认选中项：优先使用已标记 active 的，否则第一个
        let currentIndex = this.#panels.findIndex((p) => p.hasAttribute("active"));
        if (currentIndex < 0) currentIndex = 0;

        // 重建按钮
        this.#tablist.innerHTML = "";
        this.#buttons = this.#panels.map((panel, i) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.setAttribute("role", "tab");
            btn.id = `${panel.id}-btn`;
            btn.setAttribute("aria-controls", panel.id);
            btn.textContent = panel.getAttribute("label") || `Tab ${i + 1}`;
            panel.setAttribute("aria-labelledby", btn.id);

            btn.addEventListener("click", () => this.#select(i));
            btn.addEventListener("keydown", (e) => this.#onKey(e, i));

            this.#tablist.appendChild(btn);
            return btn;
        });

        this.#select(currentIndex);
    }

    #select(index: number) {
        this.dispatchEvent(new TabChangedEvent("change", this.#current, index));
        this.#current = index;
        this.#panels.forEach((panel, i) => {
            const active = i === index;
            panel.toggleAttribute("active", active);
            this.#buttons[i].setAttribute("aria-selected", String(active));
            this.#buttons[i].setAttribute("tabindex", active ? "0" : "-1");
        });
    }

    #onKey(e: KeyboardEvent, index: number) {
        const n = this.#panels.length;
        let next = -1;
        switch (e.key) {
            case "ArrowRight":
                next = (index + 1) % n;
                break;
            case "ArrowLeft":
                next = (index - 1 + n) % n;
                break;
            case "Home":
                next = 0;
                break;
            case "End":
                next = n - 1;
                break;
            default:
                return;
        }
        e.preventDefault();
        this.#select(next);
        this.#buttons[next].focus();
    }

    override addEventListener<K extends keyof TabPaneEventMap>(
        type: K,
        listener: (this: undefined, ev: TabPaneEventMap[K]) => any,
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

    active(index: number) {
        this.#select(index);
        this.#buttons[index].focus();
    }

    getActived() {
        return this.#current;
    }
}

export const defineCustomElements = () => {
    customElements.define(CUSTOM_ELEMENT_NAME_TAB, Tab);
    customElements.define(CUSTOM_ELEMENT_NAME_TABPANE, TabPane);
};
