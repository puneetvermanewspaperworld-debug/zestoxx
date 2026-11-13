import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { depthFromQuote, depthKeyFor } from "./upstox";
import { depthView, DEPTH_NOT_AVAILABLE, DEPTH_WHEN_OPEN, type DepthResponse } from "./depth-state";

describe("depth from an Upstox full quote", () => {
  it("maps the levels exactly as sent, best first, at most five", () => {
    const d = depthFromQuote({
      depth: {
        buy: [{ quantity: 18, price: 100.5, orders: 4 }, { quantity: 7, price: 100.45, orders: 1 }],
        sell: [{ quantity: 9, price: 100.55, orders: 2 }],
      },
      total_buy_quantity: 1614,
      total_sell_quantity: 1373,
    });
    assert.deepEqual(d.bids, [{ qty: 18, price: 100.5, orders: 4 }, { qty: 7, price: 100.45, orders: 1 }]);
    assert.deepEqual(d.asks, [{ qty: 9, price: 100.55, orders: 2 }]);
    assert.equal(d.totalBuyQty, 1614);
    assert.equal(d.totalSellQty, 1373);
    assert.equal(depthFromQuote({ depth: { buy: Array.from({ length: 9 }, (_, i) => ({ quantity: 1, price: 10 - i * 0.05, orders: 1 })) } }).bids.length, 5);
  });

  it("an empty or missing depth gives empty sides, never invented levels", () => {
    assert.deepEqual(depthFromQuote(undefined), { bids: [], asks: [], totalBuyQty: 0, totalSellQty: 0 });
    assert.deepEqual(depthFromQuote({ depth: { buy: [{ quantity: 0, price: 0, orders: 0 }], sell: [] } }).bids, []);
  });

  it("only listed equities have depth; indices and crypto do not", () => {
    assert.match(depthKeyFor("RELIANCE") ?? "", /^NSE_EQ\|/);
    assert.equal(depthKeyFor("NIFTY50"), null);
    assert.equal(depthKeyFor("SENSEX"), null);
    assert.equal(depthKeyFor("BTC"), null);
    assert.equal(depthKeyFor("NOPE"), null);
  });
});

describe("what the order book shows", () => {
  const lvl = (price: number, qty: number) => ({ price, qty, orders: 1 });
  it("shows real levels when there are some", () => {
    const res: DepthResponse = { source: "live", bids: [lvl(99, 5)], asks: [lvl(101, 6)] };
    assert.deepEqual(depthView(res, true), { kind: "levels", bids: [lvl(99, 5)], asks: [lvl(101, 6)] });
  });
  it("says so for an unsupported symbol (index, crypto), a failed request, and a null answer", () => {
    for (const res of [{ source: "unsupported" }, { source: "unavailable" }, null] as const) {
      assert.deepEqual(depthView(res, true), { kind: "message", text: DEPTH_NOT_AVAILABLE });
    }
  });
  it("an empty real book says when it will be there, once the market is shut", () => {
    const empty: DepthResponse = { source: "live", bids: [], asks: [] };
    assert.deepEqual(depthView(empty, false), { kind: "message", text: DEPTH_WHEN_OPEN });
    assert.deepEqual(depthView(empty, true), { kind: "message", text: DEPTH_NOT_AVAILABLE });
  });
  it("is loading until the first answer", () => {
    assert.deepEqual(depthView(undefined, true), { kind: "loading" });
  });
  it("the ladder component uses no random numbers", () => {
    const src = fs.readFileSync("components/DepthLadder.tsx", "utf8");
    assert.doesNotMatch(src, /seededRandom|Math\.random|strSeed|Date\.now/);
  });
});
