import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PULSE_LOADING, PULSE_NO_HISTORY, pulseFor } from "./pulse";
import { RSI_MIN_BARS } from "./indicators";
import { buildHistory } from "./history";
import type { Candle, SymbolInfo } from "./types";

const SYM: SymbolInfo = { id: "X", name: "X Ltd", type: "stock", base: 100 };
/** The 250 invented bars every symbol starts with. */
const INVENTED = buildHistory(SYM);
const real = (n: number): Candle[] => Array.from({ length: n }, (_, i) => ({ open: 100 + i * 0.1, high: 101 + i * 0.1, low: 99 + i * 0.1, close: 100 + i * 0.1 + Math.sin(i) * 0.5, volume: 1 }));
const base = { symId: "X", live: { X: 105 }, prevClose: 104 };

describe("Pulse shows a score only from a live quote and real history", () => {
  it("before the quote arrives: Loading, never a score", () => {
    const p = pulseFor({ ...base, histories: { X: real(271) }, hasQuote: false, hasRealHistory: true });
    assert.deepEqual(p, { state: "loading", text: PULSE_LOADING });
  });
  it("with a quote but before the real history arrives: Loading, even though 250 bars are sitting there", () => {
    assert.equal(INVENTED.length, 250);
    assert.ok(INVENTED.length >= RSI_MIN_BARS);
    const p = pulseFor({ ...base, histories: { X: INVENTED }, hasQuote: true, hasRealHistory: false });
    assert.deepEqual(p, { state: "loading", text: PULSE_LOADING });
  });
  it("with neither: Loading", () => {
    assert.equal(pulseFor({ ...base, histories: { X: INVENTED }, hasQuote: false, hasRealHistory: false }).state, "loading");
  });
  it("with both but too few real bars for Wilder's RSI to settle: Not enough price history", () => {
    for (const n of [0, 15, 30, RSI_MIN_BARS - 1]) {
      const p = pulseFor({ ...base, histories: { X: real(n) }, hasQuote: true, hasRealHistory: true });
      assert.deepEqual(p, { state: "no-history", text: PULSE_NO_HISTORY }, `${n} bars`);
    }
  });
  it("with both and enough real bars: a score between 0 and 100 that says what it is based on", () => {
    for (const n of [RSI_MIN_BARS, 271]) {
      const p = pulseFor({ ...base, histories: { X: real(n) }, hasQuote: true, hasRealHistory: true });
      assert.equal(p.state, "ok", `${n} bars`);
      if (p.state === "ok") {
        assert.ok(p.result.score >= 0 && p.result.score <= 100);
        assert.match(p.result.basis, /^Pulse scores are based on price momentum \(day change\) and RSI positioning\./);
      }
    }
  });
  it("a symbol missing from the histories is not a crash", () => {
    assert.equal(pulseFor({ ...base, histories: {}, hasQuote: true, hasRealHistory: true }).state, "no-history");
  });
});

describe("where the real-history flag comes from", () => {
  const src = fs.readFileSync("components/ZestoxxProvider.tsx", "utf8");
  it("is set only when a feed's candle history is applied, not by quotes and not by the simulation", () => {
    const sets = src.split("setRealHistory(").length - 1;
    assert.equal(sets, 1);
    const at = src.indexOf("setRealHistory((prev)");
    const before = src.slice(Math.max(0, at - 700), at);
    assert.match(before, /setLiveSource|applyHistory|ids\.forEach/);
    assert.ok(src.lastIndexOf("const applyHistory", at) > 0);
  });
  it("crypto history is cut to daily bars before it is used", () => {
    assert.match(src, /resampleToDaily\(data\[id\]\)/);
  });
  it("the Pulse page and the Trade page both go through pulseFor", () => {
    assert.match(fs.readFileSync("components/views/PulseView.tsx", "utf8"), /pulseFor\(/);
    assert.match(fs.readFileSync("components/views/TradeView.tsx", "utf8"), /pulseFor\(/);
  });
});
