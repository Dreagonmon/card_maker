import { CardFace, DataRecordType, mapEnumRangeToValueNameMap, Scope } from "../data/deck.ts";
import { globalDeck } from "../data/global_deck.ts";
import { editCardFace } from "./dialog_card_face.ts";
import { ColumnConfig, MTable, TableConfig } from "./table.ts";

let _globalTable: MTable<CardFace> | undefined = undefined;

const localCollator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
}); // string compare

const TEMPLATE_CONFIG: TableConfig<CardFace> = {
    freezeLeft: 1,
    freezeRight: 0,
    freezeHead: true,
    freezeFoot: true,
    columns: [
        {
            displayName: "卡面名称",
            itemKey: "displayName",
        },
        {
            displayName: "渲染程序",
            itemKey: "executable",
        },
        {
            displayName: "程序函数名",
            itemKey: "entryFunction",
        },
        {
            displayName: "操作",
            widthStyle: "6rem",
            actionButtons: [
                {
                    actionName: "编辑",
                    action: async (_table, rowIndex, rowData) => {
                        const newCardFace = await editCardFace(rowData);
                        if (newCardFace) {
                            globalDeck.updateCardFace(rowIndex, newCardFace);
                        }
                    },
                },
                {
                    actionName: "删除",
                    action: (_table, rowIndex, _rowData) => {
                        globalDeck.deleteCardFace(rowIndex);
                    },
                },
            ],
        },
    ],
    footerButtons: [
        {
            actionName: "新增卡面",
            action: async () => {
                const [idx, row] = globalDeck.addCardFace();
                // edit
                const result = await editCardFace(row);
                if (result) {
                    globalDeck.updateCardFace(idx, result);
                } else {
                    globalDeck.deleteCardFace(idx);
                }
            },
        },
    ],
};

const getTable = () => {
    if (!_globalTable) throw new Error();
    return _globalTable;
};

export const syncFromGlobalDeck = () => {
    getTable().buildTableContent(globalDeck.getDeck().cardFaces);
};

export const initRecordItems = () => {
    const table = getTable();
    const config = { ...TEMPLATE_CONFIG };
    config.columns = [...config.columns!];
    const recordFields = [...globalDeck.getDeck().recordItems];
    recordFields.sort((a, b) => localCollator.compare(a.displayName, b.displayName));
    for (const field of recordFields) {
        if (!(field.visibility & Scope.CardFace)) {
            // filter card face type
            continue;
        }
        if (field.type === DataRecordType.TextEnum) {
            const map = mapEnumRangeToValueNameMap(field.range);
            const col: ColumnConfig<CardFace> = {
                displayName: field.displayName,
                getItem: (_table, _rowIndex, rowData) => {
                    return map.get(rowData.data[field.name]);
                },
            };
            config.columns.splice(config.columns.length - 1, 0, col);
        } else {
            const col: ColumnConfig<CardFace> = {
                displayName: field.displayName,
                getItem: (_table, _rowIndex, rowData) => {
                    return rowData.data[field.name];
                },
            };
            config.columns.splice(config.columns.length - 1, 0, col);
        }
    }
    table.buildTable(config);
};

export const initTable = (table: MTable<CardFace>) => {
    _globalTable = table;
    globalDeck.addEventListener("change", (event) => {
        if (event.data.key === "cardFaces") {
            syncFromGlobalDeck();
        }
    });
    globalDeck.addEventListener("change", (event) => {
        if (event.data.key === "recordItems" || event.data.key === "all") {
            initRecordItems();
            syncFromGlobalDeck();
        }
    });
    initRecordItems();
    syncFromGlobalDeck();
};
