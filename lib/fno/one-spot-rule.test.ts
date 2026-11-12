import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bsm } from "./pricing";
import { PRESETS, evaluate, prepareLegs, presetLegs } from "./engine";
import { quoteFromSnapshot, type FnoLeg, type FnoSnapshot, type FnoStrike } from "./snapshot";
import { buildMarket, freezeReducer, initialFreeze, type FreezeState } from "./freeze";

/**
 * The entry-spot rule, for every strategy: with the exit at the entry spot (the index quote), 0 days held and no volatility change,
 * the result is exactly minus the charges. It must hold whatever the chain's own underlying level is relative to the index quote,
 * with the market open (a live feed) or closed (a delayed one), for calls, puts, futures and multi-leg trades, and when the user has
 * typed their own spot.
 */

const COSTS = { r: 6.5, q: 1.3, brokerage: 20, slab: 30 };
const blank = (): Omit<FnoLeg, "ltp" | "iv"> => ({ bid: null, ask: null, oi: 1, delta: null, gamma: null, theta: null, vega: null, lastTrade: null });

/** A chain priced with the index at `chainSpot`, while the index quote says `spot`. */
function snapshot(o: { spot: number; chainSpot: number; source: "live" | "delayed" }): FnoSnapshot {
  const feedAsOf = o.source === "live" ? "2026-11-11T13:50:12+05:30" : "2026-11-11T15:30:00+05:30";
  const asOf = o.source === "live" ? feedAsOf : "2026-11-12T02:42:00+05:30"; // closed: read the next morning, prices from the close
  const T = 5.9 / 365;
  const chain: FnoStrike[] = [];
  for (let K = 24400; K <= 26200; K += 50) {
    const c = bsm("CE", o.chainSpot, K, T, 0.16, 0.065, 0.013).price;
    const p = bsm("PE", o.chainSpot, K, T, 0.16, 0.065, 0.013).price;
    chain.push({ strike: K, ce: { ...blank(), ltp: c, bid: c - 0.4, ask: c + 0.4, iv: 16 }, pe: { ...blank(), ltp: p, bid: p - 0.4, ask: p + 0.4, iv: 16 } });
  }
  return {
    asOf, feedAsOf, source: o.source, underlying: "NIFTY", expiry: "2026-11-17", expiries: ["2026-11-17"], spot: o.spot, chainSpot: o.chainSpot,
    vix: 16, vixPrevClose: 15.5, vixPercentile: 50, atmIv: 16, lot: 65, step: 50, pcr: 1, chain,
  };
}

const SPOT = 25200;
// the chain's level relative to the index quote: equal, above and below, inside and outside the 0.1% note threshold
const GAPS = [0, 12, -12, 50, -50, 130, -130];

for (const source of ["live", "delayed"] as const) {
  describe(`entry-spot rule, market ${source === "live" ? "open (live feed)" : "closed (delayed feed)"}`, () => {
    for (const gap of GAPS) {
      for (const preset of PRESETS) {
        it(`${preset.label}, chain level ${gap >= 0 ? "+" : ""}${gap} points from the index quote`, () => {
          const s: FreezeState = freezeReducer(initialFreeze, { type: "feed", feed: snapshot({ spot: SPOT, chainSpot: SPOT + gap, source }) });
          const m = buildMarket(s.snap, s.ov, COSTS, "square", "index")!;
          assert.equal(m.spot, SPOT, "the spot is the index quote");
          assert.equal(m.basis, gap, "the chain's level only enters as the pricing offset");
          const P = prepareLegs(presetLegs(preset.id, m, 1), m, quoteFromSnapshot(s.snap, { r: m.r / 100, q: m.q / 100, dte: m.dte }));
          assert.ok(P.length > 0);
          const o = evaluate(P, m, m.spot, 0, 0, "square");
          assert.ok(Math.abs(o.gross) < 0.01, `gross ${o.gross}`);
          assert.ok(Math.abs(o.pre + o.total) < 0.01, `result ${o.pre} should equal minus the charges ${-o.total}`);
          assert.ok(o.total > 0);
        });
      }
    }
  });
}

describe("entry-spot rule with a typed spot (chain prices are dropped, options are priced from the spot shown)", () => {
  for (const source of ["live", "delayed"] as const) {
    for (const preset of PRESETS) {
      it(`${preset.label}, ${source}`, () => {
        let s: FreezeState = freezeReducer(initialFreeze, { type: "feed", feed: snapshot({ spot: SPOT, chainSpot: SPOT + 130, source }) });
        s = freezeReducer(s, { type: "override", patch: { spot: 25000 } });
        const m = buildMarket(s.snap, s.ov, COSTS, "square", "index")!;
        assert.equal(m.spot, 25000);
        assert.equal(m.basis, 0);
        const P = prepareLegs(presetLegs(preset.id, m, 1), m); // no quote: the model prices it at the typed spot
        const o = evaluate(P, m, m.spot, 0, 0, "square");
        assert.ok(Math.abs(o.gross) < 0.01, `gross ${o.gross}`);
        assert.ok(Math.abs(o.pre + o.total) < 0.01);
      });
    }
  }
});

describe("a move is measured from the index quote, whatever the chain's level", () => {
  it("a 1% rise from the index quote reprices the call from the chain's level plus that move", () => {
    const s = freezeReducer(initialFreeze, { type: "feed", feed: snapshot({ spot: SPOT, chainSpot: SPOT + 50, source: "live" }) });
    const m = buildMarket(s.snap, s.ov, COSTS, "square", "index")!;
    const P = prepareLegs([{ id: 1, side: "B", type: "CE", strike: 25200, lots: 1, price: null }], m, quoteFromSnapshot(s.snap, { r: m.r / 100, q: m.q / 100, dte: m.dte }));
    const up = evaluate(P, m, SPOT * 1.01, 0, 0, "square");
    const want = (bsm("CE", SPOT * 1.01 + 50, 25200, m.dte / 365, P[0].iv as number, 0.065, 0.013).price - P[0].entry) * P[0].qty;
    assert.ok(Math.abs(up.gross - want) < 1e-6, `${up.gross} vs ${want}`);
  });
});
