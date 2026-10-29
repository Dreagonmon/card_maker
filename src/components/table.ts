const CUSTOM_ELEMENT_NAME_TABLE = "m-table";

export type RowDataType = Partial<Record<string, unknown>>;

export interface ColumnActionConfig<T extends RowDataType> {
    actionName: string;
    action: (table: MTable<T>, rowIndex: number, data: T) => any;
}

export interface ColumnConfig<T extends RowDataType> {
    // header
    displayName?: string;
    widthStyle?: string | ((table: MTable<T>, columnIndex: number, config: ColumnConfig<T>) => string | undefined);
    // elements
    itemKey?: keyof T;
    getItem?: (table: MTable<T>, rowIndex: number, data: T) => string | undefined;
    actionButtons?: ColumnActionConfig<T>[];
}

export interface FooterActionConfig<T extends RowDataType> {
    actionName: string;
    action: (table: MTable<T>) => any;
}

export interface TableConfig<T extends RowDataType> {
    columns?: ColumnConfig<T>[];
    rowHeightStyle?: string | ((table: MTable<T>, rowIndex: number, data: T) => string | undefined);
    footerButtons?: FooterActionConfig<T>[];
    freezeHead?: boolean;
    freezeFoot?: boolean;
    freezeLeft?: number;
    freezeRight?: number;
}

const recalculateStickyPosition = (
    lineThL: HTMLElement[],
    lineThR: HTMLElement[],
    table: HTMLTableElement,
    signal: AbortSignal,
) => {
    const recalc = () => {
        // from left to right
        let leftOffset = 0;
        lineThL.forEach((th) => {
            th.style.left = `${leftOffset}px`;
            leftOffset += th.offsetWidth;
        });
        // from right to left
        let rightOffset = 0;
        [...lineThR].reverse().forEach((th) => {
            th.style.right = `${rightOffset}px`;
            rightOffset += th.offsetWidth;
        });
    };
    // requestAnimationFrame(recalc);
    const obs = new ResizeObserver(recalc);
    obs.observe(table);
    signal.addEventListener("abort", () => obs.disconnect());
};

export class MTable<T extends RowDataType> extends HTMLElement {
    #root: ShadowRoot;
    #config: TableConfig<T>;
    #table: HTMLTableElement;
    #records: Array<T> = [];
    #metactl: AbortController = new AbortController();
    #contentctl: AbortController = new AbortController();
    constructor() {
        super();
        this.#config = {};
        this.#root = this.attachShadow({ mode: "open" });
        const styleText = /*css*/ `
* {
    box-sizing:border-box;
}
:host {
    display: block;
    height: 100%;
    width: 100%;
    max-height: 100%;
    max-width: 100%;
    overflow: hidden;
}
.s-table {
    --color-table-header: #dadada;
    --color-table-cells: #ffffff;
    --color-table-cells-alt: #f5f5f5;
    --color-table-footer: #dadada;
    --color-table-border: #aaaaaa;
}
.s-table {
    width: 100%;
    height: 100%;
    overflow: auto;
}
.s-table table {
    border-collapse: separate;
    border-spacing: 0;
    min-width: 100%;
    border-top: 1px solid var(--color-table-border);
    border-left: 1px solid var(--color-table-border);
}
.s-table th,
.s-table td {
    padding: 0.2rem 0.5rem;
    flex: 1 1 auto;
    border-right: 1px solid var(--color-table-border);
    border-bottom: 1px solid var(--color-table-border);
}
.s-table th:not(.stk-right) + .stk-right,
.s-table td:not(.stk-right) + .stk-right {
    border-left: 1px solid var(--color-table-border);
}
.s-table th:not(.stk-left):not(.stk-right):has(+ .stk-right),
.s-table td:not(.stk-left):not(.stk-right):has(+ .stk-right) {
    border-right: none;
}
.s-table thead th {
    white-space: nowrap;
    background: var(--color-table-header);
}
.s-table tbody tr:nth-child(odd) td {
    background: var(--color-table-cells);
}
.s-table tbody tr:nth-child(even) td {
    background: var(--color-table-cells-alt);
}
.s-table table:has(tfoot) tbody tr:last-child td {
    border-bottom: none;
}
.s-table tfoot td {
    background: var(--color-table-footer);
    border-top: 1px solid var(--color-table-border);
}
.s-table .stk-left {
    position: sticky;
    left: 0;
    z-index: 2;
}
.s-table .stk-right {
    position: sticky;
    right: 0;
    z-index: 2;
}
.s-table .stk-top {
    position: sticky;
    top: 0;
    z-index: 3;
}
.s-table .stk-bottom {
    position: sticky;
    bottom: 0;
    z-index: 3;
}
.s-table .stk-left.stk-top,
.s-table .stk-left.stk-bottom,
.s-table .stk-right.stk-top,
.s-table .stk-right.stk-bottom {
    z-index: 4;
}
.s-table tfoot td>span {
    display: flex;
    justify-content: space-evenly;
    align-items: center;
    gap: 0.5rem;
}
        `;
        this.#root.innerHTML = /*html*/ `
<style>
    ${styleText}
</style>
<div class="s-table">
    <table id="s-table-element"><tbody></tbody></table>
</div>
        `;
        this.#table = this.#root.querySelector("#s-table-element") as HTMLTableElement;
    }

    buildTable(config: TableConfig<T>) {
        this.#config = config;
        this.#table.innerHTML = ""; // clear everything
        this.#contentctl.abort(); // unregister event listener
        this.#metactl.abort();
        this.#metactl = new AbortController();
        this.#contentctl = new AbortController();
        // build header
        const columnCount = this.#config.columns?.length ?? 0;
        if (this.#config.columns) {
            const thead = this.#table.appendChild(document.createElement("thead"));
            const tr = thead.appendChild(document.createElement("tr"));
            const lineThL: HTMLTableCellElement[] = [];
            const lineThR: HTMLTableCellElement[] = [];
            this.#config.columns.forEach((cfg, colIndex) => {
                const th = tr.appendChild(document.createElement("th"));
                const span = th.appendChild(document.createElement("span"));
                if (this.#config.freezeHead) {
                    th.classList.add("stk-top");
                }
                if (colIndex < (this.#config.freezeLeft ?? 0)) {
                    th.classList.add("stk-left");
                    lineThL.push(th);
                } else if (colIndex >= columnCount - (this.#config.freezeRight ?? 0)) {
                    th.classList.add("stk-right");
                    lineThR.push(th);
                }
                span.innerText = cfg.displayName ?? "";
                if (cfg.widthStyle) {
                    span.style.display = "inline-block";
                    if (typeof cfg.widthStyle === "string") {
                        span.style.width = cfg.widthStyle;
                        th.style.width = cfg.widthStyle;
                    } else {
                        const w = cfg.widthStyle(this, colIndex, cfg);
                        if (w) {
                            span.style.width = w;
                            th.style.width = w;
                        }
                    }
                }
            });
            recalculateStickyPosition(lineThL, lineThR, this.#table, this.#metactl.signal);
        }
        // tbody placeholder
        this.#table.appendChild(document.createElement("tbody"));
        // build footer
        if (this.#config.footerButtons) {
            const tfoot = this.#table.appendChild(document.createElement("tfoot"));
            const tr = tfoot.appendChild(document.createElement("tr"));
            const td = tr.appendChild(document.createElement("td"));
            td.colSpan = columnCount;
            if (this.#config.freezeHead) {
                td.classList.add("stk-bottom");
            }
            const span = td.appendChild(document.createElement("span"));
            for (const bcfg of this.#config.footerButtons) {
                const btn = document.createElement("button");
                btn.innerText = bcfg.actionName;
                const cb = bcfg.action.bind(this, this);
                btn.addEventListener("click", cb, { signal: this.#metactl.signal });
                span.appendChild(btn);
            }
        }
    }

    buildTableContent(records: Array<T>) {
        this.#records = records;
        // clear tbody
        const tbody = this.#table.querySelector("tbody")!;
        tbody.innerHTML = ""; // clear body
        this.#contentctl.abort();
        this.#contentctl = new AbortController();
        // build content
        const columnCount = this.#config.columns?.length ?? 0;
        this.#records.forEach((rowData, rowIndex) => {
            const tr = tbody.appendChild(document.createElement("tr"));
            const lineThL: HTMLTableCellElement[] = [];
            const lineThR: HTMLTableCellElement[] = [];
            this.#config.columns?.forEach((columnConfig, colIndex) => {
                const td = tr.appendChild(document.createElement("td"));
                const span = td.appendChild(document.createElement("span"));
                // set column style
                if (colIndex < (this.#config.freezeLeft ?? 0)) {
                    td.classList.add("stk-left");
                    lineThL.push(td);
                } else if (colIndex >= columnCount - (this.#config.freezeRight ?? 0)) {
                    td.classList.add("stk-right");
                    lineThR.push(td);
                }
                if (columnConfig.widthStyle) {
                    span.style.display = "inline-block";
                    if (typeof columnConfig.widthStyle === "string") {
                        span.style.width = columnConfig.widthStyle;
                        td.style.width = columnConfig.widthStyle;
                    } else {
                        const w = columnConfig.widthStyle(this, colIndex, columnConfig);
                        if (w) {
                            span.style.width = w;
                            td.style.width = w;
                        }
                    }
                }
                // set content
                if (columnConfig.itemKey) {
                    span.innerText = rowData[columnConfig.itemKey]?.toString?.() ?? "";
                }
                if (columnConfig.getItem) {
                    const item = columnConfig.getItem(this, rowIndex, rowData);
                    if (item) span.innerText = item;
                }
                if (columnConfig.actionButtons) {
                    for (const bcfg of columnConfig.actionButtons) {
                        const btn = document.createElement("button");
                        btn.innerText = bcfg.actionName;
                        const cb = bcfg.action.bind(this, this, rowIndex, rowData);
                        btn.addEventListener("click", cb, { signal: this.#contentctl.signal });
                        span.appendChild(btn);
                    }
                    span.style.display = "flex";
                    span.style.flexWrap = "wrap";
                    span.style.justifyContent = "space-evenly";
                    span.style.alignItems = "center";
                    span.style.gap = "0.5rem";
                }
            });
            recalculateStickyPosition(lineThL, lineThR, this.#table, this.#contentctl.signal);
        });
    }

    getCurrentConfig() {
        return this.#config;
    }

    getCurrentRecords() {
        return this.#records;
    }
}

export const defineCustomElements = () => {
    customElements.define(CUSTOM_ELEMENT_NAME_TABLE, MTable);
};
