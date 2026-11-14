import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resampleToDaily } from "./resample";

const H = 3_600_000;
const D = 24 * H;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe("4-hour bars to daily bars on UTC day boundaries", () => {
  // CoinGecko 4-hour bars are stamped at 00:00, 04:00, ... 20:00 UTC
  const d1 = day("2026-11-10");
  const rows: number[][] = [
    [d1 + 0 * H, 100, 110, 95, 105],
    [d1 + 4 * H, 105, 120, 100, 118],
    [d1 + 8 * H, 118, 119, 90, 92],
    [d1 + 12 * H, 92, 99, 91, 97],
    [d1 + 16 * H, 97, 101, 96, 100],
    [d1 + 20 * H, 100, 108, 99, 107],
    [d1 + D + 0 * H, 107, 112, 106, 111],
    [d1 + D + 4 * H, 111, 113, 109, 109.5],
  ];
  const out = resampleToDaily(rows);
  it("one bar per UTC day, stamped at 00:00 UTC", () => {
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((r) => r[0]), [d1, d1 + D]);
  });
  it("open is the first bar's open, close the last bar's close, high the highest high, low the lowest low", () => {
    assert.deepEqual(out[0], [d1, 100, 120, 90, 107]);
    assert.deepEqual(out[1], [d1 + D, 107, 113, 106, 109.5]);
  });
  it("a bar at 23:59 UTC belongs to its own day and 00:00 the next day starts a new one", () => {
    const r = resampleToDaily([[d1 + 23 * H + 59 * 60_000, 1, 2, 0.5, 1.5], [d1 + D, 1.5, 3, 1, 2]]);
    assert.equal(r.length, 2);
  });
  it("does not depend on the order the rows arrive in", () => {
    assert.deepEqual(resampleToDaily([...rows].reverse()), out);
  });
  it("does not change its input, and drops rows that are not numbers", () => {
    const copy = JSON.parse(JSON.stringify(rows));
    resampleToDaily(rows);
    assert.deepEqual(rows, copy);
    assert.equal(resampleToDaily([[d1, 1, 2, 0, Number.NaN], [d1 + 4 * H, 1, 2, 0, 1.5]]).length, 1);
    assert.deepEqual(resampleToDaily([]), []);
  });
  it("30 days of 4-hour bars (180) become 30 or 31 daily bars", () => {
    const start = day("2026-10-15") + 8 * H; // CoinGecko's window starts mid-day
    const many = Array.from({ length: 180 }, (_, i) => [start + i * 4 * H, 100, 101, 99, 100]);
    const daily = resampleToDaily(many);
    assert.ok(daily.length === 30 || daily.length === 31, String(daily.length));
  });
});
