import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FAVOURITE_TOOL_IDS, SETTINGS_KEY, loadSettings, parseSettings, saveSettings, type ChartSettings, type StorageLike } from "./chart/settings";
import { pinFirst, toggleFavourite } from "./chart/favourites";
import { THEMES, THEME_IDS, contrast, isThemeId } from "./chart/theme";
import { PREFS_KEY, defaultTarget, forgetPrefs, loadPrefs, savePrefs, savedTarget } from "./chart/prefs";
import { STUDIES } from "./chart/studies";
import { TOOLS } from "./chart/drawings";

const memory = () => {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } satisfies StorageLike & { data: Map<string, string>; removeItem: (k: string) => void };
};

describe("invert price scale, theme and favourites in the settings", () => {
  it("start as: not inverted, dark (the chart page is dark unless the light theme is chosen), nothing starred", () => {
    const s = parseSettings(null);
    assert.deepEqual([s.invert, s.theme, s.favTools, s.favStudies], [false, "dark", [], []]);
  });
  it("a stored light theme stays light", () => {
    assert.equal(parseSettings({ theme: "light" }).theme, "light");
  });
  it("are remembered", () => {
    const st = memory();
    const s: ChartSettings = { ...parseSettings(null), invert: true, theme: "light", favTools: ["fib", "trend"], favStudies: ["rsi", "macd"] };
    saveSettings(st, s);
    assert.deepEqual(loadSettings(st), s);
  });
  it("are checked: a wrong type or an unknown id gives the default, and a list keeps only known ids once each, in order", () => {
    const s = parseSettings({ invert: "yes", theme: "sepia", favTools: ["fib", "nope", "fib", "select", "trend", 7], favStudies: ["macd", "rsi", "macd", "zzz"] });
    assert.deepEqual([s.invert, s.theme], [false, "dark"]);
    assert.deepEqual(s.favTools, ["fib", "trend"]); // Select cannot be starred: it is always first
    assert.deepEqual(s.favStudies, ["macd", "rsi"]);
    assert.deepEqual(parseSettings({ favTools: "fib", favStudies: { a: 1 } }).favTools, []);
  });
  it("only drawing tools can be starred, and every study can", () => {
    assert.ok(!FAVOURITE_TOOL_IDS.includes("select"));
    assert.deepEqual(FAVOURITE_TOOL_IDS, TOOLS.filter((t) => t.id !== "select").map((t) => t.id));
    assert.equal(parseSettings({ favStudies: STUDIES.map((s) => s.id) }).favStudies.length, STUDIES.length);
  });
  it("old stored settings (before these existed) load with the defaults for the new ones", () => {
    const st = memory();
    st.setItem(SETTINGS_KEY, JSON.stringify({ type: "hollow", scale: "log" }));
    const s = loadSettings(st);
    assert.deepEqual([s.type, s.scale, s.invert, s.theme, s.favTools], ["hollow", "log", false, "dark", []]);
  });
});

describe("starring pins an item to the top of its menu", () => {
  const items = ["a", "b", "c", "d", "e"];
  it("puts starred items first, in the order they were starred, and keeps the rest in their own order", () => {
    assert.deepEqual(pinFirst(items, ["d", "b"], (x) => x), ["d", "b", "a", "c", "e"]);
  });
  it("no stars changes nothing; nothing is lost or repeated; an unknown star is ignored", () => {
    assert.deepEqual(pinFirst(items, [], (x) => x), items);
    const r = pinFirst(items, ["c", "zz", "c", "a"], (x) => x);
    assert.deepEqual(r, ["c", "a", "b", "d", "e"]);
    assert.equal(new Set(r).size, items.length);
  });
  it("works on objects by their id", () => {
    assert.deepEqual(pinFirst([{ id: "x" }, { id: "y" }], ["y"], (o) => o.id).map((o) => o.id), ["y", "x"]);
  });
  it("toggling stars and unstars, and a new star goes last among the stars", () => {
    assert.deepEqual(toggleFavourite([], "a"), ["a"]);
    assert.deepEqual(toggleFavourite(["a"], "b"), ["a", "b"]);
    assert.deepEqual(toggleFavourite(["a", "b"], "a"), ["b"]);
  });
  it("starring does not change which items there are (the study list)", () => {
    const ids = STUDIES.map((s) => s.id);
    assert.deepEqual([...pinFirst(STUDIES, ["rsi", "macd"], (s) => s.id).map((s) => s.id)].sort(), [...ids].sort());
    assert.deepEqual(pinFirst(STUDIES, ["rsi", "macd"], (s) => s.id).slice(0, 2).map((s) => s.id), ["rsi", "macd"]);
  });
});

describe("the chart's light and dark themes", () => {
  it("there are two, light and dark", () => {
    assert.deepEqual(THEME_IDS, ["light", "dark"]);
    assert.ok(isThemeId("dark") && !isThemeId("blue"));
  });
  it("text is readable on its background in both (contrast of at least 4.5)", () => {
    for (const id of THEME_IDS) {
      const p = THEMES[id];
      assert.ok(contrast(p.text, p.background) >= 4.5, `${id} text`);
      assert.ok(contrast(p.muted, p.background) >= 3.5, `${id} secondary text`);
      assert.ok(contrast(p.text, p.panel) >= 4.5, `${id} text on panels`);
    }
  });
  it("the dark background is dark and the light one is light; the grid is quieter than the text", () => {
    assert.ok(contrast("#000000", THEMES.dark.background) < contrast("#000000", THEMES.light.background));
    for (const id of THEME_IDS) assert.ok(contrast(THEMES[id].grid, THEMES[id].background) < contrast(THEMES[id].text, THEMES[id].background));
  });
  it("every colour is a plain #rrggbb", () => {
    for (const id of THEME_IDS) for (const v of Object.values(THEMES[id])) assert.match(v, /^#[0-9a-f]{6}$/i);
  });
  it("contrast is 21 for black on white and 1 for a colour on itself", () => {
    assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
    assert.equal(contrast("#336699", "#336699"), 1);
  });
});

describe("save preferences and reset preferences", () => {
  const changed: ChartSettings = { ...parseSettings(null), type: "ha", interval: "15m", range: "5D", scale: "log", invert: true, theme: "dark", grid: false, favTools: ["fib"], favStudies: ["rsi"], studies: [{ uid: 9, id: "macd", params: { fast: 8, slow: 21, signal: 5 } }], renko: { RELIANCE: 12 } };
  it("saving keeps the chart type, interval, studies and every setting, in the browser's storage", () => {
    const st = memory();
    const rec = savePrefs(st, changed, new Date("2026-11-14T10:00:00Z"));
    assert.equal(rec?.savedAt, "2026-11-14T10:00:00.000Z");
    assert.ok(st.data.has(PREFS_KEY));
    assert.deepEqual(loadPrefs(st)?.settings, changed);
  });
  it("Reset to saved goes back to the saved snapshot", () => {
    const st = memory();
    savePrefs(st, changed);
    assert.deepEqual(savedTarget(loadPrefs(st)), changed);
  });
  it("with nothing saved there is nothing to reset to (the menu does not offer Reset to saved)", () => {
    assert.equal(savedTarget(null), null);
    assert.equal(savedTarget(loadPrefs(memory())), null);
  });
  it("Reset to defaults is always the app's defaults, whether or not something is saved, and never the snapshot", () => {
    const st = memory();
    assert.deepEqual(defaultTarget(), parseSettings(null));
    savePrefs(st, changed);
    assert.deepEqual(defaultTarget(), parseSettings(null));
    assert.notDeepEqual(defaultTarget(), savedTarget(loadPrefs(st)));
  });
  it("each Reset to defaults gives its own copy: changing one never changes the defaults", () => {
    const a = defaultTarget();
    a.studies[0].params.n = 99;
    a.favTools.push("fib");
    assert.deepEqual(defaultTarget(), parseSettings(null));
  });
  it("forgetting the saved preferences removes them: Reset to saved is gone, Reset to defaults is not", () => {
    const st = memory();
    savePrefs(st, changed);
    forgetPrefs(st);
    assert.equal(loadPrefs(st), null);
    assert.equal(savedTarget(loadPrefs(st)), null);
    assert.deepEqual(defaultTarget(), parseSettings(null));
  });
  it("a later save replaces an earlier one; the chart's own remembered settings are a separate key and are not touched", () => {
    const st = memory();
    saveSettings(st, changed);
    const before = st.data.get(SETTINGS_KEY);
    savePrefs(st, parseSettings(null));
    savePrefs(st, changed);
    assert.deepEqual(loadPrefs(st)?.settings, changed);
    assert.equal(st.data.get(SETTINGS_KEY), before);
    assert.notEqual(PREFS_KEY, SETTINGS_KEY);
  });
  it("what was saved is a copy: changing the settings afterwards does not change it", () => {
    const st = memory();
    const s = parseSettings(null);
    savePrefs(st, s);
    s.studies[0].params.n = 99;
    assert.equal(loadPrefs(st)?.settings.studies[0].params.n, 10);
  });
  it("corrupt or invalid saved data is ignored, not trusted; storage that fails never breaks anything", () => {
    for (const raw of ["{nope", "null", "[]", JSON.stringify({ savedAt: "never", settings: {} }), JSON.stringify({ savedAt: "2026-11-14T10:00:00Z", settings: "x" })]) {
      const st = memory();
      st.data.set(PREFS_KEY, raw);
      assert.equal(loadPrefs(st), null, raw);
    }
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };
    assert.equal(loadPrefs(bad), null);
    assert.equal(savePrefs(bad, changed), null);
    assert.doesNotThrow(() => forgetPrefs(bad));
    assert.equal(savePrefs(null, changed), null);
  });
  it("a saved snapshot with a damaged study or setting is cleaned on load, like any setting", () => {
    const st = memory();
    st.data.set(PREFS_KEY, JSON.stringify({ savedAt: "2026-11-14T10:00:00Z", settings: { type: "kagi", theme: "dark", studies: [{ uid: 1, id: "rsi", params: { n: 0 } }] } }));
    const p = loadPrefs(st)!;
    assert.deepEqual([p.settings.type, p.settings.theme, p.settings.studies.length], ["candle", "dark", 0]);
  });
});
