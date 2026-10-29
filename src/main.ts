// register components
import { defineCustomElements as defineCustomElements1 } from "./components/tab_pane.ts";
import { defineCustomElements as defineCustomElements2 } from "./components/table.ts";
import { defineCustomElements as defineCustomElements3 } from "./components/dialog.ts";
import { defineCustomElements as defineCustomElements4 } from "./components/page_generate_card.ts";
import { initTable as initRecordItemTable } from "./components/table_record_item.ts";
import { initTable as initAssetsTable } from "./components/table_assets.ts";
import { initTable as initCardFaceTable } from "./components/table_card_face.ts";
import { initTable as initCardItemTable } from "./components/table_card_item.ts";
defineCustomElements1();
defineCustomElements2();
defineCustomElements3();
defineCustomElements4();

globalThis.addEventListener("load", () => {
    // init table
    initRecordItemTable(document.querySelector("#data_record_table")!);
    initAssetsTable(document.querySelector("#asset_table")!);
    initCardFaceTable(document.querySelector("#card_face_table")!);
    initCardItemTable(document.querySelector("#card_item_table")!);
    console.log("inited. Hello Wyvern");
});
