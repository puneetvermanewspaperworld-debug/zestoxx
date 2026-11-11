import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bsm } from "./pricing";
import { marginKind, prepareLegs, presetLegs, type LegInput, type Market } from "./engine";
import { explain } from "./explain";
import { computeStatic, evaluate, greeksNow } from "./engine";
import { gammaStr } from "./format";
import {
  STALE_TRADE_MS,
  WIDE_SPREAD,
  chainForwardCheck,
  daysToExpiry,
  freshestTrade,
  legDoubts,
  midPrice,
  quoteFromSnapshot,
  type FnoLeg,
  type FnoSnapshot,
  type FnoStrike,
} from "./snapshot";

const near = (actual: number, expected: number, tol: number, msg: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: got ${actual}, want ${expected} ± ${tol}`);

/* ------------------------------------------------------------------ 1. gamma --- */

describe("gamma always shows four decimals", () => {
  it("0.0058 is not rounded to 0.01", () => assert.equal(gammaStr(0.0058), "0.0058"));
  it("a lot's gamma", () => assert.equal(gammaStr(0.0525), "0.0525"));
  it("negative gamma has a real minus", () => assert.equal(gammaStr(-0.0467), "−0.0467"));
  it("tiny values never read −0.0000", () => {
    assert.equal(gammaStr(-0.00001), "0.0000");
    assert.equal(gammaStr(0), "0.0000");
  });
  it("rounds to the nearest fourth decimal", () => {
    assert.equal(gammaStr(0.00584), "0.0058");
    assert.equal(gammaStr(0.00586), "0.0059");
  });
});

/* ------------------------------------------------------------------ 2. margin --- */

const M: Market = { spot: 25255.05, dte: 6, iv: 15.2, r: 6.5, q: 1.3, lot: 65, step: 50, brokerage: 20, slab: 30, exitStyle: "square" };
const legsFor = (id: string) => prepareLegs(presetLegs(id, M, 1), M);
const words = (P: ReturnType<typeof legsFor>) => {
  const sc = evaluate(P, M, M.spot, 0, 0, "square");
  return explain(P, M, computeStatic(P, M), sc, greeksNow(P, M), "Nifty", 0);
};
const HEDGED = "Margin is usually lower for hedged spreads. Check the exact amount in your broker's margin calculator.";
const STRONG = "This trade needs margin, not just premium.";

describe("margin kind", () => {
  const cases: [string, string, "none" | "hedged" | "full"][] = [
    ["lc", "long call", "none"],
    ["lp", "long put", "none"],
    ["ls", "long straddle", "none"],
    ["bcs", "bull call spread", "hedged"],
    ["bps", "bear put spread", "hedged"],
    ["ic", "iron condor", "hedged"],
    ["ss", "short straddle (naked)", "full"],
    ["sst", "short strangle (naked)", "full"],
    ["lf", "long future", "full"],
    ["sf", "short future", "full"],
  ];
  for (const [id, name, want] of cases) it(`${name} is ${want}`, () => assert.equal(marginKind(legsFor(id)), want));

  const L = (side: "B" | "S", type: "CE" | "PE" | "FUT", strike: number, lots = 1, id = 1): LegInput => ({ id, side, type, strike, lots, price: null });
  const kind = (legs: LegInput[]) => marginKind(prepareLegs(legs, M));
  it("a naked short call is full", () => assert.equal(kind([L("S", "CE", 25400)]), "full"));
  it("a naked short put is full", () => assert.equal(kind([L("S", "PE", 25000)]), "full"));
  it("a bear call spread (sold low, bought high) is hedged", () => assert.equal(kind([L("S", "CE", 25250), L("B", "CE", 25450, 1, 2)]), "hedged"));
  it("a bull put spread (sold high, bought low) is hedged", () => assert.equal(kind([L("S", "PE", 25250), L("B", "PE", 25050, 1, 2)]), "hedged"));
  it("a ratio spread (one bought, two sold) is full", () => assert.equal(kind([L("B", "CE", 25250), L("S", "CE", 25450, 2, 2)]), "full"));
  it("a covered-by-more spread (two bought, one sold) is hedged", () => assert.equal(kind([L("B", "CE", 25450, 2), L("S", "CE", 25250, 1, 2)]), "hedged"));
  it("a short put against a long call (synthetic long) is full", () => assert.equal(kind([L("B", "CE", 25250), L("S", "PE", 25250, 1, 2)]), "full"));
  it("a future plus a short call is full", () => assert.equal(kind([L("B", "FUT", 0), L("S", "CE", 25400, 1, 2)]), "full"));
});

describe("margin message in the plain-words list", () => {
  const has = (id: string, text: string) => words(legsFor(id)).some((l) => l.html.includes(text));
  for (const id of ["bcs", "bps", "ic"]) {
    it(`${id}: the hedged-spread line, not the strong warning`, () => {
      assert.ok(has(id, HEDGED));
      assert.ok(!has(id, STRONG));
    });
  }
  for (const id of ["ss", "sst", "sf", "lf"]) {
    it(`${id}: keeps the strong warning`, () => {
      assert.ok(has(id, STRONG));
      assert.ok(!has(id, HEDGED));
    });
  }
  for (const id of ["lc", "lp", "ls"]) {
    it(`${id}: no margin line (premium is all it costs)`, () => {
      assert.ok(!has(id, STRONG));
      assert.ok(!has(id, HEDGED));
    });
  }
});

/* --------------------------------------------------- 3. prices and confidence --- */

const blank = (): Omit<FnoLeg, "ltp" | "iv"> => ({ bid: null, ask: null, oi: 1, delta: null, gamma: null, theta: null, vega: null, lastTrade: null });
const leg = (o: Partial<FnoLeg> & { ltp: number }): FnoLeg => ({ ...blank(), iv: 15, ...o });
const minutesAgo = (base: string, m: number) => new Date(Date.parse(base) - m * 60_000).toISOString();
const NOW = "2026-11-11T10:09:59.000Z";

describe("mid price", () => {
  it("is the middle of a two-sided quote", () => near(midPrice({ bid: 100, ask: 102 })!, 101, 1e-12, "mid"));
  it("is null without a bid, without an ask, or when crossed", () => {
    assert.equal(midPrice({ bid: null, ask: 102 }), null);
    assert.equal(midPrice({ bid: 100, ask: null }), null);
    assert.equal(midPrice({ bid: 0, ask: 2 }), null);
    assert.equal(midPrice({ bid: 105, ask: 100 }), null);
  });
});

describe("low confidence", () => {
  it("a tight spread and a fresh trade are fine", () => assert.deepEqual(legDoubts(leg({ ltp: 100, bid: 99.8, ask: 100.3, lastTrade: NOW }), Date.parse(NOW)), []));
  it(`a spread above ${WIDE_SPREAD * 100}% of the mid is flagged`, () => {
    const d = legDoubts(leg({ ltp: 100, bid: 95, ask: 105, lastTrade: NOW }), Date.parse(NOW));
    assert.ok(d.some((x) => x.startsWith("wide bid-ask spread")), d.join());
  });
  it("a spread just inside the limit is not flagged", () => {
    assert.deepEqual(legDoubts(leg({ ltp: 100, bid: 97.6, ask: 102.4, lastTrade: NOW }), Date.parse(NOW)), []); // 4.8%
  });
  it("no two-sided quote is flagged", () => {
    assert.ok(legDoubts(leg({ ltp: 100, bid: 99, ask: null, lastTrade: NOW }), Date.parse(NOW)).some((x) => x.includes("no two-sided")));
  });
  it(`a last trade more than ${STALE_TRADE_MS / 60000} minutes behind the chain's latest is flagged`, () => {
    const d = legDoubts(leg({ ltp: 100, bid: 99.9, ask: 100.1, lastTrade: minutesAgo(NOW, 11) }), Date.parse(NOW));
    assert.ok(d.some((x) => x.includes("minutes older")), d.join());
  });
  it("a last trade just inside the limit is not flagged", () => {
    assert.deepEqual(legDoubts(leg({ ltp: 100, bid: 99.9, ask: 100.1, lastTrade: minutesAgo(NOW, 9) }), Date.parse(NOW)), []);
  });
  it("an unknown trade time is never read as stale", () => {
    assert.deepEqual(legDoubts(leg({ ltp: 100, bid: 99.9, ask: 100.1, lastTrade: null }), Date.parse(NOW)), []);
  });
});

/** A chain priced consistently: every strike at 17% with the dividend yield the model uses, so parity holds. */
function consistentChain(spot: number, dte: number): FnoStrike[] {
  const T = dte / 365;
  const out: FnoStrike[] = [];
  for (let K = spot - 500; K <= spot + 500; K += 50) {
    const k = Math.round(K / 50) * 50;
    const c = bsm("CE", spot, k, T, 0.17, 0.065, 0.013).price;
    const p = bsm("PE", spot, k, T, 0.17, 0.065, 0.013).price;
    out.push({
      strike: k,
      ce: leg({ ltp: c, bid: c - 0.4, ask: c + 0.4, lastTrade: NOW }),
      pe: leg({ ltp: p, bid: p - 0.4, ask: p + 0.4, lastTrade: NOW }),
    });
  }
  return out;
}
const snap = (spot: number, chain: FnoStrike[], source: FnoSnapshot["source"] = "delayed"): FnoSnapshot => ({
  asOf: NOW, feedAsOf: NOW, source, underlying: "NIFTY", expiry: "2026-11-17", expiries: ["2026-11-17"], spot, vix: 17, vixPrevClose: 17,
  vixPercentile: 50, atmIv: 17, lot: 65, step: 50, pcr: 1, chain,
});

describe("chain forward check (spot and option prices describe the same moment?)", () => {
  const dte = 6;
  const chain = consistentChain(25250, dte);
  it("is in step when prices and spot agree", () => {
    const f = chainForwardCheck(snap(25250, chain), 0.065, 0.013, dte)!;
    near(f.gapPoints, 0, 0.5, "gap");
    assert.equal(f.outOfSync, false);
  });
  it("flags spot read 60 points away from the option prices", () => {
    const f = chainForwardCheck(snap(25310, chain), 0.065, 0.013, dte)!;
    assert.equal(f.outOfSync, true);
    assert.ok(f.gapPoints < -50 && f.gapPoints > -70, String(f.gapPoints));
  });
  it("tolerates a small rate/yield error", () => {
    // the chain uses q=1.3%; the model assumes 0.8%: a few points of forward, not a flag
    assert.equal(chainForwardCheck(snap(25250, chain), 0.065, 0.008, dte)!.outOfSync, false);
  });
  it("returns null with too little data", () => assert.equal(chainForwardCheck(snap(25250, chain.slice(0, 1)), 0.065, 0.013, dte), null));
});

describe("quotes from the chain", () => {
  const dte = 6;
  const base = consistentChain(25250, dte);
  const withLeg = (strike: number, patch: Partial<FnoLeg>, type: "ce" | "pe" = "ce"): FnoStrike[] => base.map((r) => (r.strike === strike ? { ...r, [type]: { ...r[type], ...patch } } : r));
  const ctx = { r: 0.065, q: 0.013, dte };

  it("prices from the middle of the bid and ask, not the last trade", () => {
    const chain = withLeg(25250, { ltp: 99, bid: 200, ask: 202 });
    const q = quoteFromSnapshot(snap(25250, chain), ctx)!("CE", 25250)!;
    near(q.ltp, 201, 1e-9, "price");
    assert.equal(q.basis, "mid");
  });
  it("falls back to the last trade when there is no two-sided quote", () => {
    const chain = withLeg(25250, { ltp: 205, bid: null, ask: null });
    const q = quoteFromSnapshot(snap(25250, chain), ctx)!("CE", 25250)!;
    near(q.ltp, 205, 1e-9, "price");
    assert.equal(q.basis, "last");
    assert.ok(q.low?.includes("no two-sided"));
  });
  it("has no low-confidence note for a healthy, in-step chain", () => {
    const q = quoteFromSnapshot(snap(25250, base), ctx)!("CE", 25250)!;
    assert.equal(q.low, undefined);
  });
  it("marks a wide spread and a stale trade", () => {
    const chain = withLeg(25000, { bid: 95, ask: 110, lastTrade: minutesAgo(NOW, 40) });
    const q = quoteFromSnapshot(snap(25250, chain), ctx)!("CE", 25000)!;
    assert.ok(q.low?.includes("wide bid-ask spread"));
    assert.ok(q.low?.includes("minutes older"));
    assert.equal(quoteFromSnapshot(snap(25250, chain), ctx)!("CE", 25250)!.low, undefined, "the neighbour is unaffected");
  });
  it("marks every strike when spot and option prices are out of step", () => {
    const q = quoteFromSnapshot(snap(25320, base), ctx)!;
    for (const K of [25000, 25250, 25500]) assert.ok(q("CE", K)?.low?.includes("out of step"), `strike ${K}`);
  });
  it("gives nothing for a contract with no price at all, and nothing at all for a simulated chain", () => {
    const chain = withLeg(25250, { ltp: 0, bid: null, ask: null });
    assert.equal(quoteFromSnapshot(snap(25250, chain), ctx)!("CE", 25250), null);
    assert.equal(quoteFromSnapshot(snap(25250, base, "simulated"), ctx), undefined);
  });
  it("the engine uses the mid as the entry price and carries the confidence note through", () => {
    const chain = withLeg(25250, { ltp: 99, bid: 195, ask: 215, lastTrade: minutesAgo(NOW, 30) });
    const m: Market = { ...M, spot: 25250, dte };
    const P = prepareLegs([{ id: 1, side: "B", type: "CE", strike: 25250, lots: 1, price: null }], m, quoteFromSnapshot(snap(25250, chain), ctx));
    near(P[0].entry, 205, 1e-9, "entry");
    assert.equal(P[0].quoteBasis, "mid");
    assert.ok(P[0].lowConfidence?.includes("wide bid-ask spread"));
    // the volatility is the one that reproduces that mid price
    near(bsm("CE", 25250, 25250, dte / 365, P[0].iv as number, 0.065, 0.013).price, 205, 1e-5, "price at the implied volatility");
  });
  it("freshestTrade is the latest time in the chain", () => {
    const chain = withLeg(25000, { lastTrade: minutesAgo(NOW, 40) });
    assert.equal(freshestTrade(chain), Date.parse(NOW));
  });
});

/* ------------------------------------ the case reported: Nifty 25,000 call after the close --- */

// Six strikes from the real Upstox chain for the 17 Nov 2026 expiry, read after the close on 11 Nov 2026
// (spot 25,255.05, delayed). Last trades were all around 15:40 IST; spreads are tight.
const REAL: { strike: number; ce: [number, number, number, number]; pe: [number, number, number, number] }[] = [
  { strike: 25000, ce: [340.9, 341.05, 343.35, 15.48], pe: [131.15, 131.1, 132.05, 18.17] },
  { strike: 25150, ce: [258.4, 257.05, 257.7, 16.06], pe: [196, 195.9, 196.95, 18.67] },
  { strike: 25200, ce: [233.7, 232.6, 234.05, 16.21], pe: [221.55, 220.05, 221.55, 18.79] },
  { strike: 25250, ce: [209.95, 209.95, 211.8, 16.56], pe: [248.95, 247.15, 249.25, 18.96] },
  { strike: 25300, ce: [189, 189, 189.7, 16.77], pe: [276.55, 275.85, 277.35, 19.17] },
  { strike: 25350, ce: [170.5, 169.6, 170.75, 16.96], pe: [306.25, 307, 308, 19.34] },
];
const realLeg = ([ltp, bid, ask, iv]: [number, number, number, number]) => leg({ ltp, bid, ask, iv, lastTrade: "2026-11-11T10:09:59.500Z" });
const realSnap = snap(25255.05, REAL.map((r) => ({ strike: r.strike, ce: realLeg(r.ce), pe: realLeg(r.pe) })));
const realDte = daysToExpiry("2026-11-17", new Date("2026-11-11T10:30:00.000Z"));

describe("the real chain behind the low 25,000-call volatility", () => {
  it("the options imply a forward about 64 points below the one the model builds from spot", () => {
    const f = chainForwardCheck(realSnap, 0.065, 0.013, realDte)!;
    near(f.modelForward, 25276.6, 1, "model forward");
    near(f.impliedForward, 25212.3, 2, "parity forward");
    near(f.gapPoints, -64.3, 3, "gap");
    assert.equal(f.outOfSync, true);
  });
  it("so every strike is marked low confidence, with the reason", () => {
    const q = quoteFromSnapshot(realSnap, { r: 0.065, q: 0.013, dte: realDte })!;
    const c = q("CE", 25000)!;
    assert.equal(c.basis, "mid");
    near(c.ltp, 342.2, 1e-9, "mid of 341.05 and 343.35");
    assert.ok(c.low?.includes("out of step"), c.low);
    assert.ok(c.low?.includes("most in the money"));
  });
  it("last trade times and spreads on their own would not have flagged it", () => {
    const f = freshestTrade(realSnap.chain);
    assert.deepEqual(legDoubts(realSnap.chain[0].ce, f), []);
  });
});
