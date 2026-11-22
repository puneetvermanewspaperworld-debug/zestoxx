import { test } from "node:test";
import assert from "node:assert/strict";
import { availableCols, cellFor, daysLabel, daysToExpiry, DEFAULT_COLS, fmtOiChangeShort, fmtOiShort, isItm, maxOiIn, oiShare, shownCols, spotSlot, textWidth, windowRows } from "./chain-view";
import type { ChainRow, OptionLeg } from "./options";

const leg = (o: Partial<OptionLeg> = {}): OptionLeg => ({ ltp: 100, prevClose: 80, oi: 200_000, prevOi: 150_000, volume: 5_000, iv: 12.34, ...o });
const row = (strike: number, c: Partial<OptionLeg> = {}, p: Partial<OptionLeg> = {}): ChainRow => ({ strike, call: leg(c), put: leg(p) });

test("a column is offered only when the chain really has it", () => {
  const bare = [row(100, { volume: 0, iv: 0, prevOi: 0, prevClose: 0 }, { volume: 0, iv: 0, prevOi: 0, prevClose: 0 })];
  assert.deepEqual([...availableCols(bare)].sort(), ["oi"]);
  const full = [row(100, { delta: 0.5, theta: -3, vega: 8, gamma: 0.0012 })];
  assert.deepEqual([...availableCols(full)].sort(), ["delta", "gamma", "iv", "ltpChg", "oi", "oiChg", "theta", "vega", "volume"]);
  assert.equal(availableCols(full).has("delta") && availableCols(bare).has("delta"), false);
  // best bid and ask only when the feed sends them
  assert.equal(availableCols(full).has("bid"), false);
  const quoted = [row(100, { bid: 99.5, ask: 100.5 })];
  assert.deepEqual([availableCols(quoted).has("bid"), availableCols(quoted).has("ask")], [true, true]);
  assert.equal(cellFor("bid", leg({ bid: 99.5 }), "abs").text, "99.50");
  assert.equal(cellFor("ask", leg(), "abs").text, "--");
});

test("what is shown is the choice that the chain has, in the order offered, and the default is the fewest useful", () => {
  const have = new Set(["oiChg", "oi", "iv"] as const);
  assert.deepEqual(shownCols("oi", undefined, have as never), ["oiChg", "oi"]); // the default is the OI and its change, the change beside the LTP
  assert.deepEqual(shownCols("oi", ["volume", "oi", "oiChg"], have as never), ["oiChg", "oi"]); // volume is not in this chain
  assert.deepEqual(shownCols("greeks", undefined, have as never), ["iv"]); // delta is not in this chain
  assert.deepEqual(DEFAULT_COLS.oi, ["oi", "oiChg"]); // the OI and its change, as in the design
  // the Buildup view is always its three columns: the price change beside the LTP, the OI change, the tag at the outer edge
  assert.deepEqual(shownCols("buildup", undefined, new Set()), ["buPx", "buOi", "buTag"]);
  assert.deepEqual(shownCols("buildup", ["buTag"], new Set()), ["buPx", "buOi", "buTag"]);
});

test("narrow figures keep their unit: lakh, crore and thousand, one decimal", () => {
  assert.equal(fmtOiShort(5_890_000), "58.9L");
  assert.equal(fmtOiShort(14_300_000), "1.43Cr");
  assert.equal(fmtOiShort(80_000), "80.0k");
  assert.equal(fmtOiShort(950), "950");
  assert.equal(fmtOiShort(null), "--");
  assert.equal(fmtOiChangeShort(1_180_000), "+11.8L");
  assert.equal(fmtOiChangeShort(-80_000), "−80.0k");
  assert.equal(fmtOiChangeShort(0), "0");
  assert.equal(fmtOiChangeShort(undefined), "--");
});

test("a column is never narrower than its text: the width counts every digit at the full figure width", () => {
  // measured in Inter at 12px with tabular figures: "+11.8L" is 39px, so the estimate must not be under that
  assert.ok(textWidth("+11.8L", 12) >= 39);
  assert.ok(textWidth("−80.0k", 12) >= 39);
  assert.ok(textWidth("1234.55", 14) >= 54); // seven characters of a deep in-the-money premium at 14px
  assert.ok(textWidth("58.9L", 12) < textWidth("+11.8L", 12)); // shorter text, narrower
  // labels: measured "OI chg" 34px, "Price" 27px and "Tag" 20px at 11px; the estimate is not under them and not far over
  for (const [t, real] of [["OI chg", 34], ["Price", 27], ["Tag", 19.5]] as const) {
    assert.ok(textWidth(t, 11) >= real, t);
    assert.ok(textWidth(t, 11) <= real + 7, t);
  }
  assert.equal(textWidth("", 12), 0);
});

test("the OI split is the calls' share and the puts' share of the same two totals as the PCR", () => {
  const rows = [row(1, { oi: 300 }, { oi: 100 }), row(2, { oi: 100 }, { oi: 500 })];
  const s = oiShare(rows)!;
  assert.equal(s.call, 0.4); // 400 of 1000
  assert.equal(s.put, 0.6);
  assert.ok(Math.abs(s.put / s.call - 1.5) < 1e-9); // the PCR
  assert.equal(oiShare([row(1, { oi: 0 }, { oi: 0 })]), null); // no open interest: no bar
  assert.equal(oiShare([]), null);
});

test("OI change and LTP change are absolute or a percentage, and read -- when there is nothing to compare with", () => {
  assert.deepEqual(cellFor("oiChg", leg(), "abs"), { text: "+50.0k", tone: "up" });
  assert.deepEqual(cellFor("oiChg", leg(), "pct"), { text: "+33.3%", tone: "up" });
  assert.deepEqual(cellFor("oiChg", leg({ oi: 100_000 }), "abs"), { text: "−50.0k", tone: "down" });
  assert.deepEqual(cellFor("oiChg", leg({ prevOi: 0 }), "pct"), { text: "--", tone: "flat" });
  assert.deepEqual(cellFor("ltpChg", leg(), "abs"), { text: "+20.00", tone: "up" });
  assert.deepEqual(cellFor("ltpChg", leg(), "pct"), { text: "+25.00%", tone: "up" });
  assert.deepEqual(cellFor("ltpChg", leg({ prevClose: 0 }), "abs"), { text: "--", tone: "flat" });
  assert.equal(cellFor("iv", leg({ iv: 0 }), "abs").text, "--");
  assert.equal(cellFor("iv", leg(), "abs").text, "12.3%");
  assert.equal(cellFor("delta", leg(), "abs").text, "--"); // the leg has no Greeks: not invented
  assert.deepEqual(cellFor("delta", leg({ delta: -0.4321 }), "abs"), { text: "-0.43", tone: "down" });
  assert.equal(cellFor("gamma", leg({ gamma: 0.00123 }), "abs").text, "0.0012");
});

test("days to expiry are by calendar date", () => {
  assert.equal(daysToExpiry("2026-11-23", "2026-11-22"), 1);
  assert.equal(daysToExpiry("2026-12-01", "2026-11-22"), 9);
  assert.equal(daysToExpiry("2026-11-22", "2026-11-22"), 0);
  assert.equal(daysToExpiry("2027-01-01", "2026-12-31"), 1);
  assert.deepEqual([0, 1, 9].map(daysLabel), ["today", "1d", "9d"]);
});

test("the window is the strikes around the at-the-money one; in the money is below the spot for a call and above it for a put", () => {
  const rows = Array.from({ length: 101 }, (_, i) => row(24000 + i * 50));
  const w = windowRows(rows, 25000, 20);
  assert.equal(w.length, 41);
  assert.equal(w[20].strike, 25000);
  assert.equal(windowRows(rows, undefined).length, 101); // no ATM known: everything
  // the spot is between the strikes: after the last strike at or below it
  assert.equal(spotSlot(rows, 25010), 21); // 24000..25000 are 21 strikes
  assert.equal(spotSlot(rows, 25000), 21); // on a strike: after it
  assert.equal(spotSlot(rows, 100), 0);
  assert.equal(spotSlot(rows, 99999), 101);
  assert.equal(isItm(24900, 25010, "CE"), true);
  assert.equal(isItm(24900, 25010, "PE"), false);
  assert.equal(isItm(25100, 25010, "PE"), true);
  assert.equal(isItm(25000, 25000, "CE") || isItm(25000, 25000, "PE"), false);
});

test("the OI bars are scaled to the largest open interest in view", () => {
  const rows = [row(1, { oi: 100 }, { oi: 300 }), row(2, { oi: 500 }, { oi: 50 })];
  assert.equal(maxOiIn(rows), 500);
});
