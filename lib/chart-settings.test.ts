import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, DEFAULT_STUDIES, SETTINGS_KEY, loadSettings, nextUid, parseSettings, saveSettings, type ChartSettings, type StorageLike } from "./chart/settings";
import { suggestBrickSize } from "./chart/charttypes";
import type { Candle } from "./types";

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe("what the chart remembers on this device", () => {
  it("starts with the candle chart, two moving averages and volume, grid on, magnet off", () => {
    const s = parseSettings(null);
    assert.equal(s.type, "candle");
    assert.deepEqual(s.studies.map((x) => [x.id, x.params.n ?? null]), [["sma", 10], ["sma", 30], ["volume", null]]);
    assert.deepEqual([s.scale, s.grid, s.magnet, s.interval, s.range], ["normal", true, false, null, null]);
  });
  it("remembers the chart type: save, then load on the next visit", () => {
    const st = memory();
    saveSettings(st, { ...DEFAULT_SETTINGS, type: "hollow" });
    assert.equal(loadSettings(st).type, "hollow");
    saveSettings(st, { ...DEFAULT_SETTINGS, type: "renko", renko: { RELIANCE: 12.5 } });
    const back = loadSettings(st);
    assert.equal(back.type, "renko");
    assert.deepEqual(back.renko, { RELIANCE: 12.5 });
  });
  it("a chart type that is not offered (Kagi) falls back to the candle chart", () => {
    assert.equal(parseSettings({ type: "kagi" }).type, "candle");
    assert.equal(parseSettings({ type: 7 }).type, "candle");
  });
  it("round-trips studies and their parameters exactly", () => {
    const st = memory();
    const s: ChartSettings = { ...DEFAULT_SETTINGS, studies: [{ uid: 4, id: "macd", params: { fast: 8, slow: 21, signal: 5 } }, { uid: 9, id: "bb", params: { n: 30, k: 2.5 }, color: "#2563eb" }], scale: "log", grid: false, magnet: true, interval: "15m", range: "5D" };
    saveSettings(st, s);
    assert.deepEqual(loadSettings(st), s);
  });
  it("drops a study whose saved parameters are not valid, keeps the rest, and never repairs", () => {
    const s = parseSettings({ studies: [{ uid: 1, id: "rsi", params: { n: 0 } }, { uid: 2, id: "rsi", params: { n: 21 } }, { uid: 3, id: "nope", params: {} }, { uid: 2, id: "atr", params: {} }, { uid: "x", id: "atr" }] });
    assert.deepEqual(s.studies, [{ uid: 2, id: "rsi", params: { n: 21 } }]);
  });
  it("fills in a missing parameter with the study's default", () => {
    assert.deepEqual(parseSettings({ studies: [{ uid: 1, id: "macd", params: { fast: 5 } }] }).studies[0].params, { fast: 5, slow: 26, signal: 9 });
  });
  it("corrupt or wrong-shaped storage gives the defaults; storage that throws never breaks anything", () => {
    for (const raw of ["{not json", "null", "[]", '"x"', "42"]) {
      const st = memory();
      st.data.set(SETTINGS_KEY, raw);
      assert.deepEqual(loadSettings(st), parseSettings(null));
    }
    const boom: StorageLike = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    assert.deepEqual(loadSettings(boom), parseSettings(null));
    assert.doesNotThrow(() => saveSettings(boom, DEFAULT_SETTINGS));
    assert.deepEqual(loadSettings(null), parseSettings(null));
  });
  it("brick sizes must be positive numbers; a bad one is dropped", () => {
    assert.deepEqual(parseSettings({ renko: { A: 5, B: -1, C: "x", D: 0, E: NaN } }).renko, { A: 5 });
  });
  it("default studies are not shared between loads (changing one never changes the defaults)", () => {
    const a = parseSettings(null);
    a.studies[0].params.n = 99;
    assert.equal(parseSettings(null).studies[0].params.n, 10);
    assert.equal(DEFAULT_STUDIES[0].params.n, 10);
  });
  it("next uid is above every uid in use", () => {
    assert.equal(nextUid([]), 1);
    assert.equal(nextUid([{ uid: 3, id: "sma", params: {} }, { uid: 7, id: "sma", params: {} }]), 8);
  });
});

describe("the brick size suggested for Renko", () => {
  const bars = (n: number, range: number): Candle[] => Array.from({ length: n }, (_, i) => ({ open: 100, high: 100 + range / 2 + (i % 2), low: 100 - range / 2, close: 100, volume: 0 }));
  it("is the 14-bar ATR rounded to two significant digits", () => {
    // every bar's range is `range` (or range + 1 on odd bars); the ATR sits between them
    const s = suggestBrickSize(bars(60, 10))!;
    assert.ok(s >= 10 && s <= 11.5);
    assert.equal(Number(s.toPrecision(2)), s);
  });
  it("is a suggestion only: it needs 14 bars, and gives nothing for flat bars", () => {
    assert.equal(suggestBrickSize(bars(13, 10)), null);
    assert.equal(suggestBrickSize(Array.from({ length: 20 }, () => ({ open: 5, high: 5, low: 5, close: 5, volume: 0 }))), null);
  });
});
