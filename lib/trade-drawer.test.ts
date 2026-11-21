import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { positionIdsFor } from "../components/views/TradeDrawerTabs";
import { makeContractId } from "./contract";
import type { Holdings } from "./types";

const opt = (symbol: string, strike: number, type: "CE" | "PE") => makeContractId({ underlying: symbol, expiry: "2026-11-26", strike, type, key: `NSE_FO|${strike}${type}` });

describe("the Positions tab of the trade drawer: what belongs to the symbol on the chart", () => {
  const nifty = opt("NIFTY50", 25500, "CE");
  const relOpt = opt("RELIANCE", 1500, "PE");
  const holdings: Holdings = {
    RELIANCE: { qty: 3, avgPrice: 1490 },
    TCS: { qty: 1, avgPrice: 4100 },
    [nifty]: { qty: 75, avgPrice: 120 },
    [relOpt]: { qty: 250, avgPrice: 20 },
  };
  it("a stock: the stock and the option contracts on it, not another symbol's", () => {
    assert.deepEqual(positionIdsFor("RELIANCE", holdings).sort(), ["RELIANCE", relOpt].sort());
  });
  it("an index: its option contracts (labelled NIFTY for NIFTY50), not a stock's", () => {
    assert.deepEqual(positionIdsFor("NIFTY50", holdings), [nifty]);
  });
  it("a symbol with nothing held has no positions, and a closed position (quantity 0) is not listed", () => {
    assert.deepEqual(positionIdsFor("INFY", holdings), []);
    assert.deepEqual(positionIdsFor("TCS", { TCS: { qty: 0, avgPrice: 4100 } }), []);
  });
});
