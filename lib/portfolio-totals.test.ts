import { test } from "node:test";
import assert from "node:assert/strict";
import { portfolioTotals } from "./portfolio-totals";

test("holdings are valued at the latest price, and cash is added for the total", () => {
  const t = portfolioTotals(1000, { RELIANCE: { qty: 10, avgPrice: 1400 }, TCS: { qty: 2, avgPrice: 4000 } }, { RELIANCE: 1500, TCS: 3900 });
  assert.deepEqual(t, { holdingsValue: 22800, pnl: 1000 - 200, total: 23800 });
});
test("a holding with no price yet counts at what it cost, not as NaN", () => {
  const t = portfolioTotals(0, { "NIFTY 12 NOV 25250 CE#NSE_FO|1": { qty: 65, avgPrice: 100 } }, {});
  assert.deepEqual(t, { holdingsValue: 6500, pnl: 0, total: 6500 });
});
test("nothing held is just the cash", () => {
  assert.deepEqual(portfolioTotals(1_000_000, {}, {}), { holdingsValue: 0, pnl: 0, total: 1_000_000 });
});
