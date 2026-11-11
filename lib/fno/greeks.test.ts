import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bsm, normCdf, type OptType } from "./pricing";
import { evaluate, greeksNow, prepareLegs, presetLegs, type LegInput, type Market, type QuoteLookup } from "./engine";
import { compareStrikes } from "./strikes";

/**
 * The Greeks shown in the strike comparison (implied volatility, gamma, vega per lot) and in the per-leg table are
 * checked against the full pricing formula itself: finite differences of the Black-Scholes price, and of the
 * engine's own exit pricing (evaluate), never against the closed-form Greek they are being tested against.
 */

const R = 0.065, Q = 0.013;
const M: Market = { spot: 25255.05, dte: 6, iv: 15.2, r: 6.5, q: 1.3, lot: 65, step: 50, brokerage: 20, slab: 30, exitStyle: "square" };
const T = M.dte / 365;

const near = (actual: number, expected: number, relTol: number, msg: string, absTol = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= Math.max(absTol, Math.abs(expected) * relTol), `${msg}: got ${actual}, want ${expected} (±${relTol * 100}%)`);

/** A chain with a volatility smile: each strike trades at its own implied volatility (not one number). */
const smile = (K: number) => {
  const x = (K - M.spot) / M.spot;
  return 0.152 + 8 * x * x - 0.6 * x; // about 14% to 17% across the strikes shown
};
const quote: QuoteLookup = (type, K) => {
  const px = bsm(type, M.spot, K, T, smile(K), R, Q).price;
  return px > 0.05 ? { ltp: Math.round(px * 20) / 20, iv: smile(K) * 100 } : null;
};

// the independent references: finite differences of the price formula
const price = (type: OptType, S: number, K: number, sig: number) => bsm(type, S, K, T, sig, R, Q).price;
const fdGamma = (type: OptType, K: number, sig: number) => {
  const h = M.spot * 1e-4;
  return (price(type, M.spot + h, K, sig) - 2 * price(type, M.spot, K, sig) + price(type, M.spot - h, K, sig)) / (h * h);
};
const fdVegaPerPoint = (type: OptType, K: number, sig: number) => {
  const h = 5e-4;
  return (price(type, M.spot, K, sig + h) - price(type, M.spot, K, sig - h)) / (2 * h) / 100;
};

for (const dir of ["CE", "PE"] as const) {
  describe(`strike comparison, ${dir}: implied volatility, gamma and vega match the pricing formula`, () => {
    const cmp = compareStrikes(M, dir, 15000, "half", quote);
    it("has several strikes", () => assert.ok(cmp.cols.length >= 5));
    it("strikes have different volatilities (each its own, not one shared value)", () => {
      const ivs = cmp.cols.map((c) => c.iv);
      assert.ok(Math.max(...ivs) - Math.min(...ivs) > 0.5, ivs.join(", "));
    });
    for (const [i, c] of cmp.cols.entries()) {
      it(`${c.K}: volatility reproduces the strike's price, gamma and vega match (column ${i})`, () => {
        const qty = M.lot; // 1 lot
        // the volatility is the one that prices this strike at its market price
        near(price(dir, M.spot, c.K, c.iv / 100), c.entry, 1e-6, "price at the shown volatility", 1e-5);
        // and it is that strike's own smile volatility (the price is tick-rounded, so allow a hair)
        near(c.iv, smile(c.K) * 100, 0.01, "volatility is the strike's own", 0.1);
        near(c.gamma, fdGamma(dir, c.K, c.iv / 100) * qty, 1e-3, "gamma per lot", 1e-7);
        near(c.vega, fdVegaPerPoint(dir, c.K, c.iv / 100) * qty, 1e-4, "vega per lot (₹ per vol point)", 1e-6);
      });
    }
  });
}

describe("strike comparison with no chain: every strike uses the market volatility", () => {
  const cmp = compareStrikes(M, "CE", 15000, "half");
  for (const c of cmp.cols) {
    it(`${c.K}`, () => {
      near(c.iv, M.iv, 1e-9, "volatility");
      near(c.vega, fdVegaPerPoint("CE", c.K, M.iv / 100) * M.lot, 1e-4, "vega", 1e-6);
      near(c.gamma, fdGamma("CE", c.K, M.iv / 100) * M.lot, 1e-3, "gamma", 1e-7);
    });
  }
});

const TRADES: { name: string; legs: LegInput[] }[] = [
  { name: "bull call spread", legs: presetLegs("bcs", M, 1) },
  { name: "short strangle (two short legs)", legs: presetLegs("sst", M, 1) },
  { name: "iron condor (four legs)", legs: presetLegs("ic", M, 1) },
  { name: "long future + short call (a future and an option)", legs: [{ id: 1, side: "B", type: "FUT", strike: 0, lots: 1, price: null }, { id: 2, side: "S", type: "CE", strike: 25400, lots: 2, price: null }] },
];

for (const t of TRADES) {
  describe(`per-leg Greeks, ${t.name}`, () => {
    const P = prepareLegs(t.legs, M, quote);
    const { rows, net } = greeksNow(P, M);
    const day0 = (spot: number, dIV: number) => evaluate(P, M, spot, 0, dIV, "square");

    it("one row per leg", () => assert.equal(rows.length, P.length));
    it("the legs add up to the total", () => {
      for (const k of ["delta", "gamma", "theta", "vega"] as const) near(rows.reduce((a, r) => a + r[k], 0), net[k], 1e-12, k, 1e-9);
    });
    it("each leg's volatility reproduces its entry price", () => {
      for (const L of P) if (L.isOpt) near(price(L.type as OptType, M.spot, L.strike, L.iv as number), L.entry, 1e-6, `leg ${L.strike} ${L.type}`, 1e-5);
    });
    P.forEach((L, i) => {
      it(`leg ${i + 1} (${L.sign > 0 ? "buy" : "sell"} ${L.type} ${L.strike || ""} x${L.lots}): signed for its lots, matches the pricing formula`, () => {
        const one = [L];
        const e = (spot: number, dIV: number) => evaluate(one, M, spot, 0, dIV, "square").gross; // sign * qty * (exit - entry)
        const h = M.spot * 1e-4;
        const delta = (e(M.spot + h, 0) - e(M.spot - h, 0)) / (2 * h);
        const gamma = (e(M.spot + h, 0) - 2 * e(M.spot, 0) + e(M.spot - h, 0)) / (h * h);
        const vega = (e(M.spot, 0.05) - e(M.spot, -0.05)) / 0.1; // per 1 vol point
        // A future's delta is shown as 1 per unit (the usual convention); the price formula's slope also carries the
        // cost-of-carry factor e^((r-q)T), about 1.0009 here. Options have no such difference.
        const carry = L.isOpt ? 1 : Math.exp((R - Q) * T);
        near(rows[i].delta * carry, delta, 1e-5, "delta", 1e-4);
        near(rows[i].gamma, gamma, 1e-3, "gamma", 1e-7);
        near(rows[i].vega, vega, 1e-4, "vega", 1e-6);
        if (!L.isOpt) {
          assert.equal(rows[i].gamma, 0);
          assert.equal(rows[i].vega, 0);
          assert.equal(rows[i].delta, L.sign * L.qty);
        }
      });
    });
    it("the total matches the whole trade priced at once", () => {
      const h = M.spot * 1e-4;
      const delta = (day0(M.spot + h, 0).gross - day0(M.spot - h, 0).gross) / (2 * h);
      const vega = (day0(M.spot, 0.05).gross - day0(M.spot, -0.05).gross) / 0.1;
      const carryExtra = P.reduce((a, L) => a + (L.isOpt ? 0 : L.sign * L.qty * (Math.exp((R - Q) * T) - 1)), 0);
      near(net.delta + carryExtra, delta, 1e-5, "net delta", 2e-4);
      near(net.vega, vega, 1e-4, "net vega", 1e-6);
    });
  });
}

describe("the normal CDF behind every price is accurate to double precision", () => {
  const known: [number, number][] = [[0, 0.5], [1.959963984540054, 0.975], [-3, 0.0013498980316301], [1, 0.8413447460685429], [-6, 9.865876450376946e-10]];
  for (const [x, p] of known) it(`N(${x})`, () => near(normCdf(x), p, 1e-9, `N(${x})`, 1e-14));
});
