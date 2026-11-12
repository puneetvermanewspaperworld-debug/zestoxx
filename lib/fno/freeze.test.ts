import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bsm } from "./pricing";
import { computeExtremes, computeStatic, evaluate, greeksNow, prepareLegs, profitGrid, type LegInput } from "./engine";
import { explain } from "./explain";
import { compareStrikes } from "./strikes";
import { quoteFromSnapshot, type FnoLeg, type FnoSnapshot, type FnoStrike } from "./snapshot";
import { buildMarket, feedMoved, freezeReducer, initialFreeze, pricedAtText, snapKey, type FreezeAction, type FreezeState } from "./freeze";

/**
 * Frozen prices: the analysis is priced from one snapshot held still while the feed refreshes in the background. It changes
 * only when the user acts, and a value typed over the feed is never overwritten by a refresh.
 */

const COSTS = { r: 6.5, q: 1.3, brokerage: 20, slab: 30 };
const T = 6 / 365;
const blank = (): Omit<FnoLeg, "ltp" | "iv"> => ({ bid: null, ask: null, oi: 1, delta: null, gamma: null, theta: null, vega: null, lastTrade: null });

/** A snapshot of the Nifty chain at a moment: spot and the exchange's update time move together, so do option prices. */
function snapshot(o: { spot: number; feedAsOf: string; iv?: number; underlying?: string; expiry?: string; source?: FnoSnapshot["source"] }): FnoSnapshot {
  const iv = o.iv ?? 0.16;
  const chain: FnoStrike[] = [];
  for (let K = o.spot - 600; K <= o.spot + 600; K += 50) {
    const k = Math.round(K / 50) * 50;
    const c = bsm("CE", o.spot, k, T, iv, 0.065, 0.013).price;
    const p = bsm("PE", o.spot, k, T, iv, 0.065, 0.013).price;
    chain.push({
      strike: k,
      ce: { ...blank(), ltp: c, bid: c - 0.5, ask: c + 0.5, iv: iv * 100 },
      pe: { ...blank(), ltp: p, bid: p - 0.5, ask: p + 0.5, iv: iv * 100 },
    });
  }
  return {
    asOf: o.feedAsOf, feedAsOf: o.feedAsOf, source: o.source ?? "live", underlying: o.underlying ?? "NIFTY", expiry: o.expiry ?? "2026-11-17",
    expiries: ["2026-11-17", "2026-11-24"], spot: o.spot, vix: 16, vixPrevClose: 15.5, vixPercentile: 50, atmIv: 16, lot: 65, step: 50, pcr: 1, chain,
  };
}
const feedAt = (spot: number, hhmmss: string) => snapshot({ spot, feedAsOf: `2026-11-11T${hhmmss}+05:30` });
/** The tests below that are about holding still start in Frozen mode; Live is the default and has its own tests at the end. */
const initialFrozen: FreezeState = { ...initialFreeze, mode: "frozen" };
const run = (s: FreezeState, ...actions: FreezeAction[]) => actions.reduce(freezeReducer, s);

const long = (type: "CE" | "PE", strike: number): LegInput => ({ id: 1, side: "B", type, strike, lots: 1, price: null });
/** Everything the page shows, computed from one frozen snapshot with the typed values on top. */
function analysis(s: FreezeState, legs: LegInput[]) {
  const m = buildMarket(s.snap, s.ov, COSTS, "square", "index")!;
  const quote = quoteFromSnapshot(s.snap, { r: m.r / 100, q: m.q / 100, dte: m.dte });
  const P = prepareLegs(legs, m, quote);
  const st = computeStatic(P, m);
  const sc = evaluate(P, m, m.spot, 0, 0, "square");
  const lines = explain(P, m, st, sc, greeksNow(P, m), "Nifty", 0).map((l) => l.html);
  return { m, P, st, sc, lines, ex: computeExtremes(P, m, st), grid: profitGrid(P, m, 0), cmp: compareStrikes(m, "CE", 15000, "half", quote) };
}

const T1 = feedAt(25255.05, "13:50:12");
const tick = (n: number) => feedAt(25255.05 + n * 3.5, `13:50:${String(12 + n * 5).padStart(2, "0")}`);

describe("frozen mode: the feed refreshing does not move the analysis", () => {
  it("the first snapshot is taken", () => {
    const s = run(initialFrozen, { type: "feed", feed: T1 });
    assert.equal(s.snap, T1);
  });
  it("later refreshes for the same contract leave the state untouched (same object)", () => {
    const s0 = run(initialFrozen, { type: "feed", feed: T1 });
    const s1 = run(s0, { type: "feed", feed: tick(1) }, { type: "feed", feed: tick(2) }, { type: "feed", feed: tick(3) });
    assert.equal(s1, s0);
    assert.equal(s1.snap, T1);
  });
  it("every number on the page is identical after many refreshes", () => {
    const legs = [long("CE", 25250)];
    const s0 = run(initialFrozen, { type: "feed", feed: T1 });
    const before = analysis(s0, legs);
    const s1 = run(s0, ...[1, 2, 3, 4, 5, 6].map((n) => ({ type: "feed", feed: tick(n) }) as FreezeAction));
    const after = analysis(s1, legs);
    assert.deepEqual(after.lines, before.lines);
    assert.deepEqual(after.grid, before.grid);
    assert.deepEqual(after.ex, before.ex);
    assert.deepEqual(after.cmp, before.cmp);
    assert.equal(after.sc.pre, before.sc.pre);
    assert.equal(after.m.spot, 25255.05);
    assert.equal(after.m.dte, before.m.dte, "time to expiry does not creep with the clock");
  });
  it("the cards, plain-words lines, grid and strike comparison all read the same snapshot, so they agree", () => {
    const a = analysis(run(initialFrozen, { type: "feed", feed: T1 }), [long("CE", 25250)]);
    const words = a.lines.join(" ");
    // the exit result quoted in the words is the one the grid shows for 0% today
    const flat = a.grid.cells[a.grid.moves.indexOf(0)][0];
    assert.equal(flat, a.sc.pre);
    // the strike comparison's entry for this strike is the entry price the legs use
    const col = a.cmp.cols.find((c) => c.K === 25250)!;
    assert.equal(col.entry, a.P[0].entry);
    assert.ok(words.includes("Nifty 25,250 call"));
  });
});

describe("feedMoved: when the 'Update to live prices' button appears", () => {
  it("not while the feed shows what the analysis is priced at", () => assert.equal(feedMoved(T1, { ...T1 }), false));
  it("when the exchange's update time moves on", () => assert.equal(feedMoved(T1, tick(1)), true));
  it("when only the spot moves", () => assert.equal(feedMoved(T1, { ...T1, spot: T1.spot + 1 }), true));
  it("when VIX moves", () => assert.equal(feedMoved(T1, { ...T1, vix: 17 }), true));
  it("not for a different contract (that takes a fresh snapshot by itself) or with nothing to compare", () => {
    assert.equal(feedMoved(T1, snapshot({ spot: 25300, feedAsOf: "2026-11-11T13:51:00+05:30", expiry: "2026-11-24" })), false);
    assert.equal(feedMoved(null, T1), false);
    assert.equal(feedMoved(T1, null), false);
  });
});

describe("update: Update to live prices takes a new snapshot", () => {
  it("replaces the snapshot with the latest feed and the numbers follow", () => {
    const legs = [long("CE", 25250)];
    const s0 = run(initialFrozen, { type: "feed", feed: T1 });
    const latest = tick(6);
    const s1 = run(s0, { type: "feed", feed: latest }, { type: "update", feed: latest });
    assert.equal(s1.snap, latest);
    const before = analysis(s0, legs), after = analysis(s1, legs);
    assert.equal(after.m.spot, latest.spot);
    assert.notEqual(after.P[0].entry, before.P[0].entry, "the option price is the new one");
    assert.equal(feedMoved(s1.snap, latest), false, "the button goes away once updated");
  });
  it("the 'Priced at' time follows the exchange's last update", () => {
    const now = new Date("2026-11-11T14:00:00+05:30");
    assert.equal(pricedAtText(T1, now), "Priced at 13:50:12 IST");
    assert.equal(pricedAtText(tick(6), now), "Priced at 13:50:42 IST");
  });
  it("adds the date when the update was not today (market shut)", () => {
    const shut = feedAt(25255.05, "15:39:59");
    assert.equal(pricedAtText(shut, new Date("2026-11-12T02:42:00+05:30")), "Priced at 15:39:59 IST (Wed 11 Nov)");
  });
  it("an update with nothing to update to changes nothing", () => {
    const s0 = run(initialFrozen, { type: "feed", feed: T1 });
    assert.equal(run(s0, { type: "update", feed: null }), s0);
  });
});

describe("manual values survive a refresh", () => {
  const typed = (s: FreezeState) => run(s, { type: "override", patch: { spot: 25000, iv: 20 } });
  it("a typed spot and volatility stay through background refreshes", () => {
    const s = run(typed(run(initialFrozen, { type: "feed", feed: T1 })), { type: "feed", feed: tick(2) });
    const m = buildMarket(s.snap, s.ov, COSTS, "square", "index")!;
    assert.equal(m.spot, 25000);
    assert.equal(m.iv, 20);
  });
  it("and through Update to live prices, which replaces the snapshot underneath", () => {
    const latest = tick(8);
    const s = run(typed(run(initialFrozen, { type: "feed", feed: T1 })), { type: "update", feed: latest });
    assert.equal(s.snap, latest);
    assert.deepEqual({ spot: s.ov.spot, iv: s.ov.iv }, { spot: 25000, iv: 20 });
    const m = buildMarket(s.snap, s.ov, COSTS, "square", "index")!;
    assert.equal(m.spot, 25000);
    assert.equal(m.iv, 20);
    assert.equal(m.lot, 65, "values nobody typed still come from the new snapshot");
  });
  it("and through a trade edit, and through a switch to another expiry's snapshot", () => {
    let s = typed(run(initialFrozen, { type: "feed", feed: T1 }));
    s = run(s, { type: "tradeEdit", feed: tick(3) });
    assert.equal(s.ov.spot, 25000);
    s = run(s, { type: "feed", feed: snapshot({ spot: 25300, feedAsOf: "2026-11-11T13:55:00+05:30", expiry: "2026-11-24" }) });
    assert.equal(s.snap!.expiry, "2026-11-24");
    assert.equal(s.ov.spot, 25000);
    assert.equal(s.ov.iv, 20);
  });
  it("only the user clears them: 'Use live values' drops spot, days and volatility but keeps lot size and strike gap", () => {
    let s = run(initialFrozen, { type: "feed", feed: T1 }, { type: "override", patch: { spot: 25000, dte: 3, iv: 20, lot: 75, step: 100 } });
    s = run(s, { type: "clearOverrides" });
    assert.deepEqual(s.ov, { lot: 75, step: 100 });
  });
  it("a typed value can be cleared by the user typing nothing back (undefined)", () => {
    const s = run(typed(run(initialFrozen, { type: "feed", feed: T1 })), { type: "override", patch: { spot: undefined } });
    assert.equal(buildMarket(s.snap, s.ov, COSTS, "square", "index")!.spot, T1.spot);
  });
});

describe("changing the trade, strike, expiry or underlying takes a fresh snapshot", () => {
  const legsFor = (strike: number) => [long("CE", strike)];
  it("a strike change takes the latest feed, not the stale frozen one", () => {
    const s0 = run(initialFrozen, { type: "feed", feed: T1 });
    const latest = tick(7);
    // the feed moved while the user was reading; the frozen analysis did not
    const s1 = run(s0, { type: "feed", feed: latest });
    assert.equal(s1.snap, T1);
    assert.equal(feedMoved(s1.snap, latest), true);
    // now the user changes the strike
    const s2 = run(s1, { type: "tradeEdit", feed: latest });
    assert.equal(s2.snap, latest);
    const a = analysis(s2, legsFor(25350));
    const lq = quoteFromSnapshot(latest, { r: 0.065, q: 0.013, dte: a.m.dte })!("CE", 25350)!;
    assert.equal(a.P[0].entry, lq.ltp, "the new strike is priced from the fresh snapshot");
    assert.equal(a.m.spot, latest.spot);
    const old = quoteFromSnapshot(T1, { r: 0.065, q: 0.013, dte: a.m.dte })!("CE", 25350)!;
    assert.notEqual(a.P[0].entry, old.ltp, "and not from the old one");
  });
  it("a different expiry's snapshot is taken as soon as the feed delivers it", () => {
    const s0 = run(initialFrozen, { type: "feed", feed: T1 });
    const next = snapshot({ spot: 25260, feedAsOf: "2026-11-11T13:50:20+05:30", expiry: "2026-11-24" });
    const s1 = run(s0, { type: "feed", feed: next });
    assert.equal(s1.snap, next);
    assert.notEqual(snapKey(s1.snap!), snapKey(T1));
  });
  it("another underlying starts clean: nothing typed carries over", () => {
    let s = run(initialFrozen, { type: "feed", feed: T1 }, { type: "override", patch: { spot: 25000, iv: 20 } });
    s = run(s, { type: "reset" });
    assert.deepEqual(s, initialFrozen);
    const bank = snapshot({ spot: 60700, feedAsOf: "2026-11-11T13:51:00+05:30", underlying: "BANKNIFTY" });
    s = run(s, { type: "feed", feed: bank });
    assert.equal(s.snap!.underlying, "BANKNIFTY");
    assert.deepEqual(s.ov, {});
  });
});

describe("the market is built from the snapshot, not the wall clock", () => {
  it("a delayed snapshot counts days to expiry from the exchange's last update", () => {
    const shut = snapshot({ spot: 25255.05, feedAsOf: "2026-11-11T15:30:00+05:30", source: "delayed" });
    const m = buildMarket({ ...shut, asOf: "2026-11-12T02:42:00+05:30" }, {}, COSTS, "square", "index")!;
    assert.ok(Math.abs(m.dte - 6) < 1e-9, String(m.dte)); // Wed 15:30 to the next Tue 15:30
  });
  it("a live snapshot counts from when it was built", () => {
    const live = snapshot({ spot: 25255.05, feedAsOf: "2026-11-11T13:50:12+05:30" });
    const m = buildMarket(live, {}, COSTS, "square", "index")!;
    assert.ok(Math.abs(m.dte - (Date.parse("2026-11-17T15:30:00+05:30") - Date.parse("2026-11-11T13:50:12+05:30")) / 86_400_000) < 1e-9);
  });
  it("uses VIX for an index and falls back sensibly, and nothing before the first snapshot", () => {
    assert.equal(buildMarket(T1, {}, COSTS, "square", "index")!.iv, 16);
    assert.equal(buildMarket(null, {}, COSTS, "square", "index"), null);
  });
});

/* ------------------------------------------------------------------ live mode --- */

describe("live mode (the default): every feed update re-prices the whole analysis together", () => {
  it("is the default", () => assert.equal(initialFreeze.mode, "live"));
  it("takes a new snapshot on each feed update", () => {
    let s = run(initialFreeze, { type: "feed", feed: T1 });
    assert.equal(s.snap, T1);
    for (let n = 1; n <= 4; n++) {
      s = run(s, { type: "feed", feed: tick(n) });
      assert.equal(s.snap!.feedAsOf, tick(n).feedAsOf);
      assert.equal(s.snap!.spot, tick(n).spot);
    }
  });
  it("the same feed object arriving twice changes nothing", () => {
    const s0 = run(initialFreeze, { type: "feed", feed: T1 });
    assert.equal(run(s0, { type: "feed", feed: T1 }), s0);
    assert.equal(run(s0, { type: "feed", feed: null }), s0);
  });
  it("after each update the cards, plain words, grid, comparison and extremes all agree because they read one snapshot", () => {
    const legs = [long("CE", 25250)];
    let s = run(initialFreeze, { type: "feed", feed: T1 });
    for (let n = 1; n <= 4; n++) {
      s = run(s, { type: "feed", feed: tick(n) });
      const a = analysis(s, legs);
      const snapNow = s.snap!;
      // everything is priced at THIS snapshot's spot and option price
      assert.equal(a.m.spot, snapNow.spot);
      const want = quoteFromSnapshot(snapNow, { r: 0.065, q: 0.013, dte: a.m.dte })!("CE", 25250)!;
      assert.equal(a.P[0].entry, want.ltp);
      // the result at the current spot today is the grid's 0% / Today cell, and the comparison column uses the same entry price
      assert.equal(a.grid.cells[a.grid.moves.indexOf(0)][0], a.sc.pre);
      assert.equal(a.cmp.cols.find((c) => c.K === 25250)!.entry, a.P[0].entry);
      // the headline best/worst case and the plain-words lines are built from the same legs and market
      assert.equal(a.ex.best.stress[0].spot, snapNow.spot * 1.2); // a long call: the stress case is 20% higher, from THIS spot
      assert.ok(a.lines.some((l) => l.includes("Nifty 25,250 call")));
    }
  });
  it("the numbers do move with the feed (that is the point of Live)", () => {
    const legs = [long("CE", 25250)];
    const s0 = run(initialFreeze, { type: "feed", feed: T1 });
    const s1 = run(s0, { type: "feed", feed: tick(5) });
    assert.notEqual(analysis(s1, legs).P[0].entry, analysis(s0, legs).P[0].entry);
    assert.notEqual(analysis(s1, legs).m.spot, analysis(s0, legs).m.spot);
  });
  it("feedMoved is only about Frozen mode: in Live the analysis already is the latest feed", () => {
    const s = run(initialFreeze, { type: "feed", feed: T1 }, { type: "feed", feed: tick(3) });
    assert.equal(feedMoved(s.snap, tick(3)), false);
  });
});

describe("switching between Live and Frozen", () => {
  it("going Frozen holds the current snapshot while the feed moves on", () => {
    let s = run(initialFreeze, { type: "feed", feed: T1 });
    s = run(s, { type: "setMode", mode: "frozen", feed: T1 });
    assert.equal(s.mode, "frozen");
    const held = s.snap;
    s = run(s, { type: "feed", feed: tick(2) }, { type: "feed", feed: tick(3) });
    assert.equal(s.snap, held);
    assert.equal(feedMoved(s.snap, tick(3)), true, "the Update button would show");
  });
  it("going Live takes the latest feed at once", () => {
    let s = run(initialFrozen, { type: "feed", feed: T1 }, { type: "feed", feed: tick(4) });
    assert.equal(s.snap, T1);
    s = run(s, { type: "setMode", mode: "live", feed: tick(4) });
    assert.equal(s.mode, "live");
    assert.equal(s.snap!.spot, tick(4).spot);
    s = run(s, { type: "feed", feed: tick(5) });
    assert.equal(s.snap!.spot, tick(5).spot, "and follows it from then on");
  });
  it("choosing the mode you are already in changes nothing", () => {
    const s = run(initialFreeze, { type: "feed", feed: T1 });
    assert.equal(run(s, { type: "setMode", mode: "live", feed: tick(2) }), s);
  });
  it("the chosen mode is kept through a trade edit, an expiry switch and another underlying", () => {
    for (const mode of ["live", "frozen"] as const) {
      let s = run(initialFreeze, { type: "setMode", mode, feed: T1 }, { type: "feed", feed: T1 });
      s = run(s, { type: "tradeEdit", feed: tick(1) });
      assert.equal(s.mode, mode, "trade edit");
      s = run(s, { type: "feed", feed: snapshot({ spot: 25300, feedAsOf: "2026-11-11T13:55:00+05:30", expiry: "2026-11-24" }) });
      assert.equal(s.mode, mode, "expiry switch");
      s = run(s, { type: "reset" });
      assert.equal(s.mode, mode, "underlying change");
      assert.equal(s.snap, null);
    }
  });
  it("Frozen mode still takes a fresh snapshot for a trade edit; Live already has the latest", () => {
    let f = run(initialFrozen, { type: "feed", feed: T1 }, { type: "feed", feed: tick(3) });
    f = run(f, { type: "tradeEdit", feed: tick(3) });
    assert.equal(f.snap!.spot, tick(3).spot);
    let l = run(initialFreeze, { type: "feed", feed: T1 }, { type: "feed", feed: tick(3) });
    l = run(l, { type: "tradeEdit", feed: tick(3) });
    assert.equal(l.snap!.spot, tick(3).spot);
  });
});

describe("a typed value survives in both modes", () => {
  for (const mode of ["live", "frozen"] as const) {
    it(`${mode}: through feed updates, an update, a trade edit and a mode switch`, () => {
      let s = run({ ...initialFreeze, mode }, { type: "feed", feed: T1 }, { type: "override", patch: { spot: 25000, iv: 20 } });
      const check = (why: string) => {
        const m = buildMarket(s.snap, s.ov, COSTS, "square", "index")!;
        assert.equal(m.spot, 25000, `spot after ${why}`);
        assert.equal(m.iv, 20, `volatility after ${why}`);
      };
      for (let n = 1; n <= 3; n++) {
        s = run(s, { type: "feed", feed: tick(n) });
        check(`feed ${n}`);
      }
      s = run(s, { type: "update", feed: tick(4) });
      check("update");
      s = run(s, { type: "tradeEdit", feed: tick(5) });
      check("trade edit");
      s = run(s, { type: "setMode", mode: mode === "live" ? "frozen" : "live", feed: tick(6) });
      check("mode switch");
      s = run(s, { type: "feed", feed: tick(7) });
      check("a later feed in the other mode");
      assert.equal(s.snap!.lot, 65, "values nobody typed still come from the snapshot");
    });
  }
});
