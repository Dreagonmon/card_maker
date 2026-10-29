import asset_fe_wasm from "./builtin/card_maker_plugin_fe.wasm.json" with { type: "json" };
import demo_pelican from "./builtin/demo_pelican.fe.json" with { type: "json" };
import main_fe from "./builtin/main.fe.json" with { type: "json" };
import departure_mono_font_map from "./builtin/departure_mono_font_map.html.json" with { type: "json" };
import { CARD_DECK_DATA_VERSION, CardDeck, DataRecordType, DeckData, Scope } from "./deck.ts";

export const EXAMPLE_DECK: CardDeck = {
    version: CARD_DECK_DATA_VERSION,
    globalMaxId: 100,
    recordItems: [
        {
            id: 1,
            displayName: "脚本名",
            name: "script_file",
            type: DataRecordType.Text,
            range: "",
            defaultValue: "main.fe",
            visibility: Scope.CardFace,
        },
        {
            id: 2,
            displayName: "示例真假0或1",
            name: "example_boolean",
            type: DataRecordType.Boolean,
            range: "",
            defaultValue: "1",
            visibility: Scope.CardFace | Scope.CardItem,
        },
        {
            id: 3,
            displayName: "示例数字",
            name: "example_number",
            type: DataRecordType.Number,
            range: "0 - 100",
            defaultValue: "98.5",
            visibility: Scope.CardFace | Scope.CardItem,
        },
        {
            id: 4,
            displayName: "示例文本",
            name: "example_text",
            type: DataRecordType.Text,
            range: ".*",
            defaultValue: "Hello Text",
            visibility: Scope.CardItem,
        },
        {
            id: 5,
            displayName: "示例多行文本",
            name: "example_multitext",
            type: DataRecordType.MultilineText,
            range: ".*Hello.*",
            defaultValue: "Hello!\nMulitline Text!",
            visibility: Scope.CardFace | Scope.CardItem,
        },
        {
            id: 6,
            displayName: "示例枚举",
            name: "example_enum",
            type: DataRecordType.TextEnum,
            range: "选项1:value1\n选项2:value2\n选项3:value3",
            defaultValue: "value2",
            visibility: Scope.CardFace | Scope.CardItem,
        },
    ],
    cardFaces: [
        {
            id: 20,
            displayName: "示例卡面",
            executable: "card_maker_plugin_fe.wasm",
            entryFunction: "eval",
            data: {
                "script_file": "demo_pelican.fe",
                "example_boolean": "1",
                "example_number": "999",
                "example_multitext": "Hello\nWorld",
                "example_enum": "value2",
            },
        },
    ],
    cardItems: [
        {
            id: 30,
            frontFaceId: 20,
            backFaceId: -1,
            data: {
                "example_boolean": "1",
                "example_number": "999",
                "example_text": "Example Text",
                "example_multitext": "Hello\nWorld",
                "example_enum": "value2",
            },
        },
    ],
    assets: [
        demo_pelican,
        main_fe,
        departure_mono_font_map,
        asset_fe_wasm,
    ],
    name: "My Card Deck",
    note: "",
    cardWidth: 100,
    cardHeight: 100,
    sizeScale: 10.0,
};

export const globalDeck: DeckData = (() => {
    const deck = new DeckData();
    // load from cache
    globalThis.caches.open("saved_deck").then((cs) => {
        return cs.match(new URL("http://example.com/last_deck"));
    }).then((resp) => {
        if (!resp) return;
        return resp.arrayBuffer();
    }).then((buffer) => {
        if (buffer) {
            const text = new TextDecoder("utf-8").decode(buffer);
            deck.setDeck(JSON.parse(text) as CardDeck);
        } else {
            deck.setDeck(EXAMPLE_DECK);
        }
    });
    // save when changed
    deck.addEventListener("change", async () => {
        const data = new TextEncoder().encode(JSON.stringify(deck.getDeck()));
        const cs = await globalThis.caches.open("saved_deck");
        await cs.put(
            new URL("http://example.com/last_deck"),
            new Response(data, { status: 200, headers: { "Content-Type": "application/json" } }),
        );
    });
    return deck;
})();
