import { AssetItem } from "../data/deck.ts";
import { globalDeck } from "../data/global_deck.ts";
import { dialogPrompt } from "./dialog.ts";
import { editTextFile } from "./dialog_asset_text_editor.ts";
import { MTable } from "./table.ts";

let _globalTable: MTable<AssetItem> | undefined = undefined;

const getTable = () => {
    if (!_globalTable) throw new Error();
    return _globalTable;
};

export const syncFromGlobalDeck = () => {
    getTable().buildTableContent(globalDeck.getDeck().assets);
};

export const initTable = (table: MTable<AssetItem>) => {
    _globalTable = table;
    table.buildTable({
        freezeLeft: 1,
        freezeRight: 0,
        freezeHead: true,
        freezeFoot: true,
        columns: [
            {
                displayName: "资源名称",
                itemKey: "name",
            },
            {
                displayName: "资源大小",
                widthStyle: "6rem",
                itemKey: "size",
            },
            {
                displayName: "操作",
                widthStyle: "16rem",
                actionButtons: [
                    {
                        actionName: "编辑文本",
                        action: async (_table, _rowIndex, rowData) => {
                            const data = globalDeck.getAsset(rowData.name)!;
                            const text = new TextDecoder("utf-8").decode(data);
                            const result = await editTextFile({ text });
                            if (typeof result === "string") {
                                const data2 = new TextEncoder().encode(result);
                                globalDeck.addAsset(rowData.name, data2);
                            }
                        },
                    },
                    {
                        actionName: "下载",
                        action: async (_table, _rowIndex, rowData) => {
                            const data = globalDeck.getAsset(rowData.name)!;
                            const b = new Blob([data]);
                            const url = URL.createObjectURL(b);
                            const a = document.createElement("a");
                            a.download = rowData.name;
                            a.href = url;
                            a.click();
                            setTimeout(() => {
                                URL.revokeObjectURL(url);
                            }, 5000);
                        },
                    },
                    {
                        actionName: "重命名",
                        action: async (_table, _rowIndex, rowData) => {
                            const newName = await dialogPrompt("文件名:", rowData.name);
                            if (newName) {
                                globalDeck.renameAsset(rowData.name, newName);
                            }
                        },
                    },
                    {
                        actionName: "删除",
                        action: (_table, _rowIndex, rowData) => {
                            globalDeck.deleteAsset(rowData.name);
                        },
                    },
                ],
            },
        ],
        footerButtons: [
            {
                actionName: "添加资源",
                action: async () => {
                    const input = document.createElement("input");
                    input.style.display = "none";
                    input.type = "file";
                    input.multiple = true;
                    input.addEventListener("change", async () => {
                        const files = Array.from(input.files ?? []);
                        const pms = files.map(async (file) => {
                            const data = await file.bytes();
                            globalDeck.addAsset(file.name, data);
                        });
                        await Promise.all(pms);
                        syncFromGlobalDeck();
                    }, { once: true });
                    input.click();
                },
            },
        ],
    });
    globalDeck.addEventListener("change", (event) => {
        if (event.data.key === "assets" || event.data.key === "all") {
            syncFromGlobalDeck();
        }
    });
    syncFromGlobalDeck();
};
