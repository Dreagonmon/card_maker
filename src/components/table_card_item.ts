import { CardItem, DataRecordType, mapEnumRangeToValueNameMap, Scope } from "../data/deck.ts";
import { globalDeck } from "../data/global_deck.ts";
import { editCardItem } from "./dialog_card_item.ts";
import { ColumnConfig, MTable, TableConfig } from "./table.ts";

let _globalTable: MTable<CardItem> | undefined = undefined;

const localCollator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
}); // string compare

const TEMPLATE_CONFIG: TableConfig<CardItem> = {
    freezeLeft: 1,
    freezeRight: 0,
    freezeHead: true,
    freezeFoot: true,
    columns: [
        {
            displayName: "卡牌名称",
            itemKey: "name",
        },
        {
            displayName: "操作",
            widthStyle: "6rem",
            actionButtons: [
                {
                    actionName: "编辑",
                    action: async (_table, rowIndex, rowData) => {
                        const newCardFace = await editCardItem(rowData);
                        if (newCardFace) {
                            globalDeck.updateCardItem(rowIndex, newCardFace);
                        }
                    },
                },
                {
                    actionName: "删除",
                    action: (_table, rowIndex, _rowData) => {
                        globalDeck.deleteCardItem(rowIndex);
                    },
                },
            ],
        },
    ],
    footerButtons: [
        {
            actionName: "新增卡牌",
            action: async () => {
                const [idx, row] = globalDeck.addCardItem();
                // edit
                const result = await editCardItem(row);
                if (result) {
                    globalDeck.updateCardItem(idx, result);
                } else {
                    globalDeck.deleteCardItem(idx);
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
    getTable().buildTableContent(globalDeck.getDeck().cardItems);
};

export const initRecordItems = () => {
    const table = getTable();
    const cardFaceIdNameMap = globalDeck.getCardFaceIdNameMap();
    const config = { ...TEMPLATE_CONFIG };
    config.columns = [...config.columns!];
    config.columns.splice(config.columns.length - 1, 0, {
        displayName: "正面模版",
        getItem(_table, _rowIndex, data) {
            return cardFaceIdNameMap.get(data.frontFaceId) ?? "[无]";
        },
    });
    config.columns.splice(config.columns.length - 1, 0, {
        displayName: "反面模版",
        getItem(_table, _rowIndex, data) {
            return cardFaceIdNameMap.get(data.backFaceId) ?? "[无]";
        },
    });
    const recordFields = [...globalDeck.getDeck().recordItems];
    recordFields.sort((a, b) => localCollator.compare(a.displayName, b.displayName));
    for (const field of recordFields) {
        if (!(field.visibility & Scope.CardItem)) {
            // filter card face type
            continue;
        }
        if (field.type === DataRecordType.TextEnum) {
            const map = mapEnumRangeToValueNameMap(field.range);
            const col: ColumnConfig<CardItem> = {
                displayName: field.displayName,
                getItem: (_table, _rowIndex, rowData) => {
                    return map.get(rowData.data[field.name]);
                },
            };
            config.columns.splice(config.columns.length - 1, 0, col);
        } else {
            const col: ColumnConfig<CardItem> = {
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

export const initTable = (table: MTable<CardItem>) => {
    _globalTable = table;
    globalDeck.addEventListener("change", (event) => {
        if (event.data.key === "cardItems") {
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
