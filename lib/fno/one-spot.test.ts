import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bsm, impliedVol } from "./pricing";
import { computeExtremes, computeStatic, evaluate, greeksNow, prepareLegs, profitGrid, type LegInput } from "./engine";
import { explain } from "./explain";
import { compareStrikes } from "./strikes";
import { quoteFromSnapshot, type FnoLeg, type FnoSnapshot, type FnoStrike } from "./snapshot";
import { SPOT_NOTE_THRESHOLD, buildMarket, freezeReducer, initialFreeze, spotNote, spotNoteText, type FreezeAction, type FreezeState } from "./freeze";

/**
 * One spot. The index quote's last price is the only spot shown and the only one scenarios are measured from. The option chain's
 * own underlying level (the index when its prices were quoted) lives inside the option pricing only, and the page says so in one
 * line when the two differ by more than 0.1%.
 */

const COSTS = { r: 6.5, q: 1.3, brokerage: 20, slab: 30 };
const T = 6 / 365;
const blank = (): Omit<FnoLeg, "ltp" | "iv"> => ({ bid: null, ask: null, oi: 1, delta: null, gamma: null, theta: null, vega: null, lastTrade: null });

/** A chain whose prices were quoted with the index at `chainSpot`, while the index quote says `spot`. */
function snapshot(o: { spot: number; chainSpot: number; feedAsOf?: string; source?: FnoSnapshot["source"] }): FnoSnapshot {
  const chain: FnoStrike[] = [];
  for (let K = o.chainSpot - 600; K <= o.chainSpot + 600; K += 50) {
    const k = Math.round(K / 50) * 50;
    const c = bsm("CE", o.chainSpot, k, T, 0.16, 0.065, 0.013).price;
    const p = bsm("PE", o.chainSpot, k, T, 0.16, 0.065, 0.013).price;
    chain.push({ strike: k, ce: { ...blank(), ltp: c, bid: c - 0.5, ask: c + 0.5, iv: 16 }, pe: { ...blank(), ltp: p, bid: p - 0.5, ask: p + 0.5, iv: 16 } });
  }
  const t = o.feedAsOf ?? "2026-11-11T13:50:12+05:30";
  return {
    asOf: t, feedAsOf: t, source: o.source ?? "live", underlying: "NIFTY", expiry: "2026-11-17", expiries: ["2026-11-17"],
    spot: o.spot, chainSpot: o.chainSpot, vix: 16, vixPrevClose: 15.5, vixPercentile: 50, atmIv: 16, lot: 65, step: 50, pcr: 1, chain,
  };
}
const long = (type: "CE" | "PE", strike: number): LegInput => ({ id: 1, side: "B", type, strike, lots: 1, price: null });
const run = (s: FreezeState, ...a: FreezeAction[]) => a.reduce(freezeReducer, s);

/** Everything the page computes from one state: the market, the legs priced from the chain, and the figures built on them. */
function page(s: FreezeState, legs: LegInput[]) {
  const m = buildMarket(s.snap, s.ov, COSTS, "square", "index")!;
  const manual = s.ov.spot != null || s.ov.dte != null || s.ov.iv != null;
  const quote = manual ? undefined : quoteFromSnapshot(s.snap, { r: m.r / 100, q: m.q / 100, dte: m.dte });
  const P = prepareLegs(legs, m, quote);
  const st = computeStatic(P, m);
  const sc = evaluate(P, m, m.spot, 0, 0, "square");
  const lines = explain(P, m, st, sc, greeksNow(P, m), "Nifty", 0).map((l) => l.html);
  return { m, P, st, sc, lines, ex: computeExtremes(P, m, st), grid: profitGrid(P, m, 0), cmp: compareStrikes(m, "CE", 15000, "half", quote), note: spotNote(s.snap, s.ov) };
}

describe("the two levels match: nothing to say, nothing changes", () => {
  const s = run(initialFreeze, { type: "feed", feed: snapshot({ spot: 25255.05, chainSpot: 25255.05 }) });
  const p = page(s, [long("CE", 25250)]);
  it("no note", () => assert.equal(p.note, null));
  it("the spot shown is the index quote and the pricing offset is zero", () => {
    assert.equal(p.m.spot, 25255.05);
    assert.equal(p.m.basis, 0);
  });
  it("a flat exit today costs only the charges", () => {
    near(p.sc.gross, 0, 0.01);
    near(p.sc.pre, -p.sc.total, 0.01);
  });
  it("a gap inside 0.1% is not worth a line", () => {
    const close = run(initialFreeze, { type: "feed", feed: snapshot({ spot: 25255.05, chainSpot: 25255.05 + 25 }) }); // 0.099%
    assert.equal(spotNote(close.snap, close.ov), null);
  });
});

describe("the two levels differ by more than 0.1%", () => {
  const SPOT = 25180.55, CHAIN = 25230;
  const s = run(initialFreeze, { type: "feed", feed: snapshot({ spot: SPOT, chainSpot: CHAIN }) });
  const p = page(s, [long("CE", 25200)]);
  it("the note says what the prices were quoted at and where the index is now, in one line", () => {
    assert.deepEqual(p.note, { quoted: CHAIN, now: SPOT });
    assert.equal(spotNoteText(p.note!), "Option prices were quoted when the index was at 25,230.00; the index is now at 25,180.55.");
    assert.ok(!spotNoteText(p.note!).includes("\n"));
  });
  it("is strictly above 0.1%: exactly 0.1% says nothing, a touch more does", () => {
    const at = (gap: number) => run(initialFreeze, { type: "feed", feed: snapshot({ spot: 25000, chainSpot: 25000 * (1 + gap) }) });
    assert.equal(spotNote(at(SPOT_NOTE_THRESHOLD).snap, {}), null);
    assert.notEqual(spotNote(at(SPOT_NOTE_THRESHOLD * 1.05).snap, {}), null);
    assert.notEqual(spotNote(at(-SPOT_NOTE_THRESHOLD * 1.05).snap, {}), null, "either direction");
  });
  it("the spot shown everywhere is the index quote, never the chain's level", () => {
    assert.equal(p.m.spot, SPOT);
    assert.equal(p.m.basis, CHAIN - SPOT);
    // scenarios are measured from the quote: the stress case, the grid's rows and the strike comparison's strikes
    near(p.ex.best.stress[0].spot, SPOT * 1.2, 1e-9);
    near(p.grid.cells.length, 9, 0);
    const k = (m: number) => Math.round(SPOT * (1 + m / 100));
    assert.ok(p.cmp.cols.every((c) => Math.abs(c.K - SPOT) < SPOT * 0.05));
    assert.ok(k(0) > 0);
    // no plain-words line or comparison quotes the chain's level as a spot
    const text = p.lines.join(" ");
    assert.ok(!text.includes("25,230"), "the chain's level is not shown in the plain words");
    assert.ok(p.cmp.cols.every((c) => c.K !== CHAIN || c.K % 50 === 0));
  });
  it("the chain's level is used inside the pricing: the volatility is the one that reproduces the price at that level", () => {
    const leg = p.P[0];
    const atChain = impliedVol("CE", CHAIN, 25200, p.m.dte / 365, leg.entry, 0.065, 0.013)!;
    const atQuote = impliedVol("CE", SPOT, 25200, p.m.dte / 365, leg.entry, 0.065, 0.013)!;
    near(leg.iv as number, atChain, 1e-9);
    assert.ok(Math.abs(atChain - atQuote) > 0.002, "reading it at the index quote would have given a different volatility");
  });
  it("a flat scenario (index unchanged) still costs only the charges, and a move reprices from the chain's level", () => {
    near(p.sc.gross, 0, 0.01);
    near(p.sc.pre, -p.sc.total, 0.01);
    const up = evaluate(p.P, p.m, SPOT * 1.01, 0, 0, "square");
    const want = (bsm("CE", SPOT * 1.01 + (CHAIN - SPOT), 25200, p.m.dte / 365, p.P[0].iv as number, 0.065, 0.013).price - p.P[0].entry) * p.P[0].qty;
    near(up.gross, want, 1e-6);
  });
  it("the cards, plain words, grid and comparison are consistent with each other (one snapshot, one spot)", () => {
    assert.equal(p.grid.cells[p.grid.moves.indexOf(0)][0], p.sc.pre);
    assert.equal(p.cmp.cols.find((c) => c.K === 25200)!.entry, p.P[0].entry);
  });
  it("the chain-consistency check is made at the chain's level, so a moved index quote does not wrongly flag a healthy chain", () => {
    const q = quoteFromSnapshot(s.snap, { r: 0.065, q: 0.013, dte: p.m.dte })!("CE", 25200)!;
    assert.equal(q.low, undefined);
  });
});

describe("a typed spot is what is shown, in both modes", () => {
  for (const mode of ["live", "frozen"] as const) {
    it(`${mode}: the typed value wins, chain prices are dropped, and no note is shown`, () => {
      const feed = snapshot({ spot: 25180.55, chainSpot: 25230 });
      let s = run({ ...initialFreeze, mode }, { type: "feed", feed }, { type: "override", patch: { spot: 25000 } });
      let p = page(s, [long("CE", 25000)]);
      assert.equal(p.m.spot, 25000);
      assert.equal(p.m.basis, 0, "options are priced from the spot shown once prices are typed over");
      assert.equal(p.P[0].priceSource, "model");
      assert.equal(p.note, null);
      // it survives feed updates and an update, with a different gap each time
      s = run(s, { type: "feed", feed: snapshot({ spot: 25190, chainSpot: 25300 }) }, { type: "update", feed: snapshot({ spot: 25195, chainSpot: 25320 }) });
      p = page(s, [long("CE", 25000)]);
      assert.equal(p.m.spot, 25000);
      assert.equal(p.note, null);
    });
  }
  it("typing a volatility or days also drops the note (chain prices are no longer used)", () => {
    const feed = snapshot({ spot: 25180.55, chainSpot: 25230 });
    assert.equal(spotNote(feed, { iv: 20 }), null);
    assert.equal(spotNote(feed, { dte: 3 }), null);
    assert.notEqual(spotNote(feed, { lot: 75 }), null, "a typed lot size does not affect the prices");
  });
  it("clearing the override brings the index quote and the note back", () => {
    const feed = snapshot({ spot: 25180.55, chainSpot: 25230 });
    let s = run(initialFreeze, { type: "feed", feed }, { type: "override", patch: { spot: 25000 } });
    s = run(s, { type: "clearOverrides" });
    const p = page(s, [long("CE", 25200)]);
    assert.equal(p.m.spot, 25180.55);
    assert.notEqual(p.note, null);
  });
});

describe("the spot shown and the note come from the same snapshot, in Live and Frozen", () => {
  const A = snapshot({ spot: 25180.55, chainSpot: 25230, feedAsOf: "2026-11-11T13:50:12+05:30" });
  const B = snapshot({ spot: 25200.1, chainSpot: 25200.1, feedAsOf: "2026-11-11T13:50:17+05:30" }); // the gap closed
  const C = snapshot({ spot: 25210, chainSpot: 25300, feedAsOf: "2026-11-11T13:50:22+05:30" }); // a new, bigger gap
  const same = (s: FreezeState) => {
    const p = page(s, [long("CE", 25200)]);
    if (p.note) {
      assert.equal(p.note.now, p.m.spot, "the 'now' in the note is the spot shown");
      assert.equal(p.note.quoted, s.snap!.chainSpot);
    }
    return p;
  };
  it("Live: every update brings a new spot and a new note together", () => {
    let s = run(initialFreeze, { type: "feed", feed: A });
    assert.equal(same(s).m.spot, A.spot);
    assert.notEqual(same(s).note, null);
    s = run(s, { type: "feed", feed: B });
    assert.equal(same(s).m.spot, B.spot);
    assert.equal(same(s).note, null, "the gap closed, so the note goes with the new spot");
    s = run(s, { type: "feed", feed: C });
    assert.equal(same(s).m.spot, C.spot);
    assert.deepEqual(same(s).note, { quoted: 300 + 25000, now: 25210 });
  });
  it("Frozen: the spot and the note both stay on the frozen snapshot while the feed moves", () => {
    let s = run({ ...initialFreeze, mode: "frozen" }, { type: "feed", feed: A });
    const before = same(s);
    s = run(s, { type: "feed", feed: B }, { type: "feed", feed: C });
    const after = same(s);
    assert.equal(after.m.spot, before.m.spot);
    assert.deepEqual(after.note, before.note);
    assert.deepEqual(after.lines, before.lines);
    s = run(s, { type: "update", feed: C });
    assert.equal(same(s).m.spot, C.spot);
    assert.deepEqual(same(s).note, { quoted: 25300, now: 25210 });
  });
});

describe("snapshots without a chain level (simulated, or older) behave as before", () => {
  it("no chain level: no note, no offset", () => {
    const { chainSpot: _drop, ...bare } = snapshot({ spot: 25255.05, chainSpot: 25255.05 });
    void _drop;
    assert.equal(spotNote(bare as FnoSnapshot, {}), null);
    assert.equal(buildMarket(bare as FnoSnapshot, {}, COSTS, "square", "index")!.basis, 0);
  });
  it("simulated feeds never carry a note", () => {
    assert.equal(spotNote(snapshot({ spot: 100, chainSpot: 200, source: "simulated" }), {}), null);
  });
});

function near(actual: number, expected: number, tol: number) {
  assert.ok(Math.abs(actual - expected) <= tol, `got ${actual}, want ${expected} ± ${tol}`);
}
