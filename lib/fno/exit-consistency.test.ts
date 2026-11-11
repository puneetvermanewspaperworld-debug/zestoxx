import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bsm } from "./pricing";
import { computeStatic, evaluate, greeksNow, prepareLegs, presetLegs, profitGrid, roundDays, type LegInput, type Market } from "./engine";
import { CMP_MOVES, compareStrikes } from "./strikes";
import { daysToExpiry, quoteFromSnapshot, type FnoLeg, type FnoSnapshot } from "./snapshot";
import { explain } from "./explain";
import { rs } from "./format";

/**
 * One exit, one number. The profit grid, "What you keep", the plain-words result and the strike comparison all
 * price an exit with the same functions, so they must agree, and an exit at the entry spot, on the entry day,
 * with no volatility change must cost exactly the charges — live or delayed, option, future or spread.
 */

const near = (actual: number, expected: number, tol: number, msg: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: got ${actual}, want ${expected} ± ${tol}`);

const R = 0.065, Q = 0.013;
const SPOT = 25255.05;
const EXPIRY = "2026-11-17"; // 6.0 days after the last close below
const FEED_AS_OF = "2026-11-11T15:30:00+05:30"; // the market is shut; this is the exchange's last update
const base = (dte: number): Market => ({ spot: SPOT, dte, iv: 15.2, r: 6.5, q: 1.3, lot: 65, step: 50, brokerage: 20, slab: 30, exitStyle: "square" });

const tick = (x: number) => Math.round(x * 20) / 20; // prices trade in 5-paisa ticks
const blank = (): Omit<FnoLeg, "ltp" | "iv"> => ({ bid: null, ask: null, oi: 1000, delta: null, gamma: null, theta: null, vega: null });

/** A chain of strikes priced at 15.2%, the user's case (Nifty 25,250 call at ₹209.95) pinned exactly. */
function snapshot(source: "live" | "delayed", staleCall25000 = false): FnoSnapshot {
  const T = 6 / 365;
  const chain = [];
  for (let K = 24500; K <= 26000; K += 50) {
    const ce = tick(bsm("CE", SPOT, K, T, 0.152, R, Q).price);
    const pe = tick(bsm("PE", SPOT, K, T, 0.152, R, Q).price);
    chain.push({
      strike: K,
      ce: { ...blank(), ltp: K === 25250 ? 209.95 : K === 25000 && staleCall25000 ? 150 : ce, iv: 15.2 },
      pe: { ...blank(), ltp: pe, iv: 15.2 },
    });
  }
  return { asOf: "2026-11-12T02:37:00+05:30", feedAsOf: FEED_AS_OF, source, underlying: "NIFTY", expiry: EXPIRY, expiries: [EXPIRY], spot: SPOT, vix: 15.2, vixPrevClose: 15, vixPercentile: 50, atmIv: 15.2, lot: 65, step: 50, pcr: 1, chain };
}

interface Case { name: string; legs: LegInput[]; single?: "CE" | "PE"; strike?: number }
const call: LegInput = { id: 1, side: "B", type: "CE", strike: 25250, lots: 1, price: null };
const CASES: Case[] = [
  { name: "long call 25,250", legs: [call], single: "CE", strike: 25250 },
  { name: "long put 25,250", legs: [{ ...call, type: "PE" }], single: "PE", strike: 25250 },
  { name: "long future", legs: [{ id: 1, side: "B", type: "FUT", strike: 0, lots: 1, price: null }] },
  { name: "bull call spread (two legs)", legs: presetLegs("bcs", { spot: SPOT, step: 50 }, 1) },
  { name: "call whose last trade is below intrinsic value (stale)", legs: [{ ...call, strike: 25000 }] },
  { name: "call with a price typed by the user", legs: [{ ...call, price: 215 }] },
];

const MARKETS: { name: string; m: Market; snap: FnoSnapshot }[] = [
  { name: "live", m: base(6), snap: snapshot("live") },
  // Delayed: time to expiry is counted from the exchange's last update, not from now (02:37 am).
  { name: "delayed (market shut)", m: base(daysToExpiry(EXPIRY, new Date(FEED_AS_OF))), snap: snapshot("delayed", true) },
];

describe("the delayed market counts days from the feed's last update", () => {
  it("is 6.0 days", () => near(daysToExpiry(EXPIRY, new Date(FEED_AS_OF)), 6, 1e-6, "days to expiry"));
});

for (const { name: mname, m: m0, snap } of MARKETS) {
  for (const exitStyle of ["square", "expire"] as const) {
    const m: Market = { ...m0, exitStyle };
    const quote = quoteFromSnapshot(snap);
    describe(`${mname}, exit style ${exitStyle}`, () => {
      for (const c of CASES) {
        const P = prepareLegs(c.legs, m, quote);

        it(`(a) ${c.name}: same spot, 0 days, no volatility change costs only the charges`, () => {
          assert.ok(P.length > 0);
          const o = evaluate(P, m, m.spot, 0, 0, "square");
          near(o.gross, 0, 0.01, "gross");
          near(o.pre, -o.total, 0.01, "after charges");
          assert.ok(o.total > 0);
        });

        it(`(b) ${c.name}: grid, "What you keep" and the plain-words result give the same number`, () => {
          const st = computeStatic(P, m);
          const gk = greeksNow(P, m);
          for (const dIV of [0, 3]) {
            const g = profitGrid(P, m, dIV);
            g.moves.forEach((mv, i) => {
              g.cols.forEach((d, j) => {
                const style = d >= m.dte - 1e-9 && m.exitStyle === "expire" ? "expire" : "square";
                const sc = evaluate(P, m, m.spot * (1 + mv / 100), d, dIV, style); // = "What you keep"
                assert.equal(g.cells[i][j], sc.pre, `grid ${mv}% day ${d} dIV ${dIV}`);
                // the plain-words result quotes the same figure
                const words = explain(P, m, st, sc, gk, "Nifty", d).map((l) => l.html).join(" ");
                if (Math.abs(sc.pre) > 0.5) assert.ok(words.includes(rs(sc.pre)), `words for ${mv}% day ${d} say ${rs(sc.pre)}`);
              });
            });
          }
        });

        if (c.single) {
          for (const hold of ["same", "half", "expiry"] as const) {
            it(`(b) ${c.name}: strike comparison (exit ${hold}) matches the grid`, () => {
              const cmp = compareStrikes(m, c.single!, 15000, hold, quote);
              const col = cmp.cols.find((x) => x.K === c.strike);
              if (!col) return; // strike outside the comparison's offsets
              const g = profitGrid(P, m, 0);
              const j = g.cols.indexOf(cmp.d);
              if (j < 0) return; // an exit day the grid has no column for (kept equal by roundDays below)
              CMP_MOVES.forEach((mv, i) => {
                assert.equal(g.moves[i], mv);
                near(col.cells[i], g.cells[i][j], 1e-9, `${mv}% day ${cmp.d}`);
              });
            });
          }
        }
      }
    });
  }
}

describe("the strike comparison and the grid use the same hold-day rounding", () => {
  it("half of 5.98 days is 2.99 in both", () => {
    const m = base(5.98);
    const g = profitGrid(prepareLegs([call], m), m, 0);
    assert.ok(g.cols.includes(roundDays(5.98 / 2)));
    assert.equal(compareStrikes(m, "CE", 15000, "half").d, roundDays(5.98 / 2));
  });
});

describe("the reported trade: long Nifty 25,250 call at ₹209.95, 6.0 days, 15.2% (independent figures)", () => {
  const m = base(6);
  const P = prepareLegs([call], m, quoteFromSnapshot(snapshot("delayed")));
  const at = (mv: number, d: number, style: "square" | "expire" = "square") => evaluate(P, m, m.spot * (1 + mv / 100), d, 0, style).pre;
  it("0% today loses only charges (about −₹70 to −₹90)", () => { const v = at(0, 0); assert.ok(v <= -70 && v >= -90, `${v}`); });
  it("0% at day 3 is about −₹4,165", () => near(at(0, 3), -4165, 30, "0%, day 3"));
  it("+0.5% at day 3 is about +₹692", () => near(at(0.5, 3), 692, 30, "+0.5%, day 3"));
  it("+1% at day 3 is about +₹6,623", () => near(at(1, 3), 6623, 60, "+1%, day 3"));
  it("0% at expiry is about −₹13,389", () => near(at(0, 6, "expire"), -13389, 60, "0%, expiry"));
});
