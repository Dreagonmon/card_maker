import { DataRecordItem, Scope } from "../data/deck.ts";
import { DATA_TYPE_NAME_MAPPING, SCOPE_NAME_MAPPING } from "../data/deck.ts";
import { MTable } from "./table.ts";
import { globalDeck } from "../data/global_deck.ts";
import { editDataRecordItem } from "./dialog_record_item.ts";

let _globalTable: MTable<DataRecordItem> | undefined = undefined;

const getTable = () => {
    if (!_globalTable) throw new Error();
    return _globalTable;
};

export const syncFromGlobalDeck = () => {
    getTable().buildTableContent(globalDeck.getDeck().recordItems);
};

export const initTable = (table: MTable<DataRecordItem>) => {
    _globalTable = table;
    table.buildTable({
        freezeLeft: 1,
        freezeRight: 0,
        freezeHead: true,
        freezeFoot: true,
        columns: [
            {
                displayName: "数据项名称",
                itemKey: "displayName",
            },
            {
                displayName: "变量名",
                itemKey: "name",
            },
            {
                displayName: "变量类型",
                getItem: (_table, _idx, row) => {
                    const typeId = row.type;
                    return DATA_TYPE_NAME_MAPPING[typeId];
                },
            },
            {
                displayName: "取值范围",
                itemKey: "range",
            },
            {
                displayName: "默认值",
                itemKey: "defaultValue",
            },
            {
                displayName: "可见性",
                getItem: (_table, _idx, row) => {
                    const visibility = row.visibility;
                    const scope = [];
                    for (const key in SCOPE_NAME_MAPPING) {
                        if (!Object.hasOwn(SCOPE_NAME_MAPPING, key)) continue;
                        const s = Number.parseInt(key) as Scope;
                        if (visibility & s) {
                            scope.push(SCOPE_NAME_MAPPING[s]);
                        }
                    }
                    return scope.join(", ");
                },
            },
            {
                displayName: "操作",
                widthStyle: "6rem",
                actionButtons: [
                    {
                        actionName: "编辑",
                        action: async (_table, rowIndex, rowData) => {
                            const newRowData = await editDataRecordItem(rowData);
                            if (newRowData) {
                                globalDeck.updateRecordItem(rowIndex, newRowData);
                            }
                        },
                    },
                    {
                        actionName: "删除",
                        action: (_table, rowIndex, _rowData) => {
                            globalDeck.deleteRecordItem(rowIndex);
                        },
                    },
                ],
            },
        ],
        footerButtons: [
            {
                actionName: "新增字段",
                action: async () => {
                    const [idx, row] = globalDeck.addRecordItem();
                    // edit
                    const result = await editDataRecordItem(row);
                    if (result) {
                        globalDeck.updateRecordItem(idx, result);
                    } else {
                        globalDeck.deleteRecordItem(idx);
                    }
                },
            },
        ],
    });
    globalDeck.addEventListener("change", (event) => {
        if (event.data.key === "recordItems" || event.data.key === "all") {
            syncFromGlobalDeck();
        }
    });
    syncFromGlobalDeck();
};
