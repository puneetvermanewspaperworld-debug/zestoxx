import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fillShortfall, fundsError } from "./order-check";

const base = { side: "buy" as const, qty: 10, price: 100, cash: 5000, held: 0, symbol: "RELIANCE" };

describe("the funds check every paper order goes through", () => {
  it("a buy needs quantity x price in cash, to the rupee", () => {
    assert.equal(fundsError({ ...base, cash: 1000 }), null); // exactly enough
    assert.match(fundsError({ ...base, cash: 999.99 })!, /Not enough virtual cash: this needs ₹1,000(\.00)? and you have ₹999/);
  });
  it("a sell needs the shares: no short selling", () => {
    assert.equal(fundsError({ ...base, side: "sell", held: 10 }), null);
    assert.equal(fundsError({ ...base, side: "sell", held: 9 }), "You only hold 9 unit(s) of RELIANCE.");
    assert.equal(fundsError({ ...base, side: "sell", held: 0 }), "You only hold 0 unit(s) of RELIANCE.");
  });
  it("cash does not matter to a sell, and shares do not matter to a buy", () => {
    assert.equal(fundsError({ ...base, side: "sell", held: 10, cash: 0 }), null);
    assert.equal(fundsError({ ...base, held: 0, cash: 1000 }), null);
  });
  it("refuses a quantity that is not a whole number of 1 or more, and a missing price", () => {
    for (const qty of [0, -1, 1.5, NaN]) assert.match(fundsError({ ...base, qty })!, /whole quantity/);
    for (const price of [0, -5, NaN]) assert.match(fundsError({ ...base, price })!, /no price/);
  });
  it("a resting order is checked at its limit price, not the market price", () => {
    // 10 at a limit of 90 costs 900; at the market price of 100 it would cost 1000
    assert.equal(fundsError({ ...base, price: 90, cash: 950 }), null);
    assert.notEqual(fundsError({ ...base, price: 100, cash: 950 }), null);
  });
  it("says why a resting order was cancelled", () => {
    assert.equal(fillShortfall("buy"), "not enough virtual cash");
    assert.equal(fillShortfall("sell"), "you no longer hold enough");
  });
});
