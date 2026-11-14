import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fmtBarDate, readoutFor } from "./chart/readout";
import { fmtPrice, PRICE_DECIMALS, roundPrice } from "./chart/price";
import type { TimedCandle } from "./chart/series";

const DAY = 86_400;
const T0 = Date.UTC(2026, 10, 9) / 1000; // 9 Nov 2026
const bars: TimedCandle[] = [
  { t: T0, open: 100, high: 110, low: 95, close: 105, volume: 10 },
  { t: T0 + DAY, open: 105, high: 112, low: 101, close: 102.5, volume: 12 },
  { t: T0 + 2 * DAY, open: 102, high: 108, low: 99, close: 107, volume: 9 },
];

describe("crosshair readout", () => {
  it("is the open, high, low and close of the bar at that time", () => {
    const r = readoutFor(bars, T0 + DAY)!;
    assert.deepEqual([r.open, r.high, r.low, r.close], [105, 112, 101, 102.5]);
    assert.equal(r.date, "10 Nov 2026");
  });
  it("gives the change from the previous close, in points and per cent", () => {
    const r = readoutFor(bars, T0 + DAY)!;
    assert.equal(r.change, -2.5);
    assert.ok(Math.abs(r.pct! - (-2.5 / 105) * 100) < 1e-9);
    assert.equal(readoutFor(bars, T0 + 2 * DAY)!.change, 4.5);
  });
  it("has no change on the first bar, and says whether the candle closed up", () => {
    const first = readoutFor(bars, T0)!;
    assert.equal(first.change, null);
    assert.equal(first.pct, null);
    assert.equal(first.up, true);
    assert.equal(readoutFor(bars, T0 + DAY)!.up, false);
  });
  it("is null where there is no bar: off the data is never filled in", () => {
    assert.equal(readoutFor(bars, T0 + 5), null);
    assert.equal(readoutFor(bars, T0 - DAY), null);
    assert.equal(readoutFor([], T0), null);
  });
  it("finds any bar in a long history", () => {
    const long: TimedCandle[] = Array.from({ length: 1000 }, (_, i) => ({ t: T0 + i * DAY, open: i, high: i + 1, low: i - 1, close: i + 0.5, volume: 1 }));
    for (const i of [0, 1, 499, 500, 998, 999]) assert.equal(readoutFor(long, T0 + i * DAY)!.open, i);
  });
  it("writes the date from the bar's calendar day", () => {
    assert.equal(fmtBarDate(Date.UTC(2026, 0, 1) / 1000), "1 Jan 2026");
    assert.equal(fmtBarDate(Date.UTC(2026, 11, 31) / 1000), "31 Dec 2026");
  });
});

describe("price precision", () => {
  it("is two decimals", () => assert.equal(PRICE_DECIMALS, 2));
  it("rounds for display only: 1306.38929519 shows as 1306.39", () => {
    assert.equal(roundPrice(1306.38929519), "1306.39");
    assert.equal(roundPrice(1450.5), "1450.50");
    assert.equal(roundPrice(0.004), "0.00");
    assert.equal(roundPrice(NaN), "");
  });
  it("groups digits by market and always shows two decimals", () => {
    assert.equal(fmtPrice(1306.3, "stock"), "1,306.30");
    assert.equal(fmtPrice(125000.5, "stock"), "1,25,000.50");
    assert.equal(fmtPrice(91500, "crypto"), "91,500.00");
    assert.equal(fmtPrice(NaN), "--");
  });
});
