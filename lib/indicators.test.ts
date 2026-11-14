import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RSI_MIN_BARS, minBarsForRsi, rsiSeries } from "./indicators";
import type { Candle } from "./types";

const bars = (closes: number[]): Candle[] => closes.map((c) => ({ open: c, high: c, low: c, close: c, volume: 1 }));

/**
 * The textbook example for Wilder's RSI: StockCharts ChartSchool, "Relative Strength Index (RSI)", the spreadsheet with 33
 * closes and the RSI(14) it works out for each day from the 15th on. Closes are given to four decimals, as in that spreadsheet.
 */
const TEXTBOOK_CLOSES = [
  44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931, 46.0328, 45.614, 46.282, 46.282, 46.0028, 46.0328,
  46.4116, 46.2222, 45.6439, 46.2122, 46.2521, 45.7137, 46.4515, 45.7835, 45.3548, 44.0288, 44.1783, 44.2181, 44.5672, 43.4205, 42.6628, 43.1314,
];
const TEXTBOOK_RSI = [70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87, 45.46, 37.3, 33.08, 37.77];

describe("Wilder's RSI(14)", () => {
  const s = rsiSeries(bars(TEXTBOOK_CLOSES), 14);
  it("matches the textbook example, every value, to two decimals", () => {
    const got = s.filter((v): v is number => v !== null).map((v) => Math.round(v * 100) / 100);
    assert.equal(got.length, 19);
    assert.deepEqual(got, TEXTBOOK_RSI);
  });
  it("the first value is on the 15th close (14 changes), and nothing before it", () => {
    assert.ok(s.slice(0, 14).every((v) => v === null));
    assert.ok(s[14] !== null);
    assert.equal(s.length, TEXTBOOK_CLOSES.length);
  });
  it("is not the plain 14-change average the app used before (those values differ)", () => {
    // plain average of the last 14 changes at the last bar
    let g = 0;
    let l = 0;
    for (let j = TEXTBOOK_CLOSES.length - 14; j < TEXTBOOK_CLOSES.length; j++) {
      const d = TEXTBOOK_CLOSES[j] - TEXTBOOK_CLOSES[j - 1];
      if (d >= 0) g += d;
      else l -= d;
    }
    const plain = 100 - 100 / (1 + g / l);
    assert.ok(Math.abs(plain - (s[s.length - 1] as number)) > 0.5, `plain ${plain}`);
  });
  it("a series that only rises is 100, only falls is 0, and a flat one is 50", () => {
    assert.equal(rsiSeries(bars(Array.from({ length: 30 }, (_, i) => 100 + i)), 14).at(-1), 100);
    assert.equal(rsiSeries(bars(Array.from({ length: 30 }, (_, i) => 100 - i)), 14).at(-1), 0);
    assert.equal(rsiSeries(bars(new Array(30).fill(100)), 14).at(-1), 50);
  });
  it("fewer than period + 1 closes gives no value", () => {
    assert.ok(rsiSeries(bars(TEXTBOOK_CLOSES.slice(0, 14)), 14).every((v) => v === null));
  });
  it("always stays between 0 and 100", () => {
    const wild = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 3) * 20 + (i % 7) * 3);
    for (const v of rsiSeries(bars(wild), 14)) if (v !== null) assert.ok(v >= 0 && v <= 100);
  });
});

describe("how many bars the RSI needs to settle", () => {
  it("is 78 for period 14: the starting average's weight is under 1% by then", () => {
    assert.equal(minBarsForRsi(14), 78);
    assert.equal(RSI_MIN_BARS, 78);
    assert.ok(Math.pow(13 / 14, RSI_MIN_BARS - 15) < 0.01);
    assert.ok(Math.pow(13 / 14, RSI_MIN_BARS - 16) >= 0.01, "and one bar fewer is not enough");
  });
  it("worst case: two starts that disagree completely (mostly up vs mostly down) agree to under 1 RSI point once RSI_MIN_BARS bars are in, and are far apart early", () => {
    const walk = (changes: number[]) => changes.reduce((acc, d) => [...acc, acc[acc.length - 1] + d], [100]);
    const tail = Array.from({ length: 100 }, (_, i) => Math.sin(i / 3) * 1.2 + 0.05);
    const up = Array.from({ length: 14 }, (_, i) => (i % 2 ? -0.5 : 1.5));
    const down = Array.from({ length: 14 }, (_, i) => (i % 2 ? 0.5 : -1.5));
    const ra = rsiSeries(bars(walk([...up, ...tail])), 14);
    const rb = rsiSeries(bars(walk([...down, ...tail])), 14);
    const diffAt = (n: number) => Math.abs((ra[n] as number) - (rb[n] as number));
    assert.ok(diffAt(RSI_MIN_BARS - 1) < 1, `at ${RSI_MIN_BARS} bars: ${diffAt(RSI_MIN_BARS - 1)}`);
    assert.ok(diffAt(14 + 20) > 5, `20 bars after the seed: ${diffAt(14 + 20)}`);
  });
  it("30 bars are not enough, 250 are", () => {
    assert.ok(30 < RSI_MIN_BARS);
    assert.ok(250 >= RSI_MIN_BARS);
  });
});
