import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bsm, impliedVol } from "./pricing";
import { computeCharges, RATES } from "./charges";
import { computeStatic, evaluate, prepareLegs, presetLegs, type Market } from "./engine";
import { compareStrikes } from "./strikes";

const near = (actual: number, expected: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? "value"}: got ${actual}, want ${expected} ± ${tol}`);

const NIFTY: Market = { spot: 23000, dte: 4, iv: 16.6, r: 6.5, q: 1.3, lot: 65, step: 50, brokerage: 20, slab: 30, exitStyle: "expire" };

describe("Black-Scholes reference (S=100, K=100, T=1, vol 20%, r 5%, q 0)", () => {
  const call = bsm("CE", 100, 100, 1, 0.2, 0.05, 0);
  const put = bsm("PE", 100, 100, 1, 0.2, 0.05, 0);
  it("call price 10.4506", () => near(call.price, 10.4506, 5e-4));
  it("put price 5.5735", () => near(put.price, 5.5735, 5e-4));
  it("call delta 0.6368", () => near(call.delta, 0.6368, 5e-4));
  it("put-call parity holds", () => near(call.price - put.price, 100 - 100 * Math.exp(-0.05), 1e-6));
});

describe("implied volatility", () => {
  it("round-trips the input volatility", () => {
    for (const type of ["CE", "PE"] as const) {
      for (const [spot, strike, years, vol] of [[23000, 23000, 4 / 365, 0.166], [23000, 23500, 30 / 365, 0.22], [23000, 22500, 1 / 365, 0.12], [100, 80, 1, 0.45]]) {
        const price = bsm(type, spot, strike, years, vol, 0.065, 0.013).price;
        const iv = impliedVol(type, spot, strike, years, price, 0.065, 0.013);
        assert.ok(iv != null, `${type} ${strike} found no implied vol`);
        near(iv as number, vol, 1e-4, `${type} K=${strike} T=${years}`);
      }
    }
  });
  it("returns null for a price below intrinsic value", () => {
    assert.equal(impliedVol("CE", 23000, 22000, 4 / 365, 100, 0.065, 0.013), null);
  });
});

describe("charge stack: one Nifty lot (65), buy at 210, exit at 260", () => {
  // Worked by hand with the published rates, not by calling the code under test.
  const qty = 65;
  const buy = 210 * qty; //  13,650
  const sell = 260 * qty; // 16,900
  const brokerage = 20 * 2;
  const stt = 0.0015 * sell;
  const txn = 0.0003553 * (buy + sell);
  const sebi = 0.000001 * (buy + sell);
  const stamp = 0.00003 * buy;
  const gst = 0.18 * (brokerage + txn + sebi);
  const total = brokerage + stt + txn + sebi + stamp + gst;

  it("matches the hand calculation line by line", () => {
    const c = computeCharges({ optBuy: buy, optSell: sell, futBuy: 0, futSell: 0, orders: 2, sttExBase: 0 }, 20);
    near(c.brokerage, 40, 1e-9);
    near(c.stt, 25.35, 1e-9);
    near(c.txn, 10.854415, 1e-6);
    near(c.sebi, 0.03055, 1e-9);
    near(c.stamp, 0.4095, 1e-9);
    near(c.gst, 9.1592937, 1e-6);
    near(c.total, 85.8037587, 1e-6);
    near(c.total, total, 1e-9);
  });
  it("uses the rates the handoff lists", () => {
    assert.equal(RATES.sttOptSell, 0.0015);
    assert.equal(RATES.sttFutSell, 0.0005);
    assert.equal(RATES.txnOpt, 0.0003553);
    assert.equal(RATES.txnFut, 0.0000183);
    assert.equal(RATES.stampOpt, 0.00003);
    assert.equal(RATES.stampFut, 0.00002);
    assert.equal(RATES.gst, 0.18);
    assert.match(RATES.verifiedOn, /^\d{4}-\d{2}-\d{2}$/);
  });
  it("evaluate() applies the same stack to a round trip", () => {
    // A future priced to give a 260 exit from a 210 entry is awkward; use an option whose exit
    // price is pinned by a typed entry at expiry intrinsic: strike 23000 CE, spot 23260 -> exit 260.
    const m: Market = { ...NIFTY, exitStyle: "expire" };
    const P = prepareLegs([{ id: 1, side: "B", type: "CE", strike: 23000, lots: 1, price: 210 }], m);
    const o = evaluate(P, m, 23260, m.dte, 0, "expire");
    near(o.gross, 50 * qty, 1e-6, "gross P&L");
    // held to expiry: no closing order, so no STT on the sell side, but exercise STT on intrinsic
    const hand =
      20 + 0.0003553 * buy + 0.000001 * buy + 0.00003 * buy + 0.18 * (20 + 0.0003553 * buy + 0.000001 * buy) + 0.0015 * 260 * qty;
    near(o.total, hand, 1e-6, "charges held to expiry");
    // squared off instead: the full stack above
    const sq = evaluate(P, { ...m, exitStyle: "square" }, 23260, m.dte, 0, "square");
    near(sq.total, total, 1e-6, "charges when squared off");
  });
});

describe("long ATM call", () => {
  const premium = 210;
  const strike = 23000;
  for (const exitStyle of ["expire", "square"] as const) {
    const m: Market = { ...NIFTY, exitStyle };
    const P = prepareLegs([{ id: 1, side: "B", type: "CE", strike, lots: 1, price: premium }], m);
    const st = computeStatic(P, m);
    it(`(${exitStyle}) gross breakeven is strike plus premium`, () => {
      assert.equal(st.beGross.length, 1);
      near(st.beGross[0], strike + premium, 0.5);
    });
    it(`(${exitStyle}) net breakeven is above the gross one (charges push it out)`, () => {
      assert.ok(st.beNet[0] > st.beGross[0]);
    });
    it(`(${exitStyle}) worst case is the premium plus entry charges only`, () => {
      const turnover = premium * 65;
      const entryCharges =
        20 + 0.0003553 * turnover + 0.000001 * turnover + 0.00003 * turnover + 0.18 * (20 + 0.0003553 * turnover + 0.000001 * turnover);
      near(st.minV, -(turnover + entryCharges), 1e-6);
      assert.equal(st.unlimLoss, false);
      assert.equal(st.unlimProfit, true);
    });
  }
});

describe("strike comparison across the table", () => {
  for (const dir of ["CE", "PE"] as const) {
    const { cols } = compareStrikes(NIFTY, dir, 15000, "expiry");
    const strictlyFalling = (xs: number[]) => xs.every((x, i) => i === 0 || x < xs[i - 1]);
    const strictlyRising = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]);

    it(`${dir}: has most of the eight strikes and runs from ITM to OTM`, () => {
      assert.ok(cols.length >= 6, `only ${cols.length} columns`);
      assert.equal(cols[0].kind, "ITM");
      assert.equal(cols[cols.length - 1].kind, "OTM");
    });
    it(`${dir}: cost falls as the strike moves out of the money`, () => assert.ok(strictlyFalling(cols.map((c) => c.cost))));
    it(`${dir}: |delta| falls as the strike moves out of the money`, () => assert.ok(strictlyFalling(cols.map((c) => Math.abs(c.delta)))));
    it(`${dir}: chance of profit falls as the strike moves out of the money`, () => assert.ok(strictlyFalling(cols.map((c) => c.pop))));
    it(`${dir}: chance of losing 90% rises as the strike moves out of the money`, () => assert.ok(strictlyRising(cols.map((c) => c.ruin))));
  }
  it("puts mirror calls: the same offset costs about the same, within a few percent", () => {
    const calls = compareStrikes(NIFTY, "CE", 15000, "expiry").cols;
    const puts = compareStrikes(NIFTY, "PE", 15000, "expiry").cols;
    const call0 = calls.find((c) => c.kind === "ATM");
    const put0 = puts.find((c) => c.kind === "ATM");
    assert.ok(call0 && put0);
    near((call0.cost - put0.cost) / call0.cost, 0, 0.12);
    near(call0.pop, put0.pop, 0.1);
  });
  it("uses a chain price and its own implied volatility when a lookup is given", () => {
    const quote = (_t: "CE" | "PE", K: number) => ({ ltp: bsm("CE", 23000, K, 4 / 365, 0.2, 0.065, 0.013).price, iv: 20 });
    const { cols } = compareStrikes(NIFTY, "CE", 15000, "expiry", quote);
    assert.ok(cols.every((c) => c.priceSource === "chain"));
    const atm = cols.find((c) => c.kind === "ATM");
    const model = compareStrikes(NIFTY, "CE", 15000, "expiry").cols.find((c) => c.kind === "ATM");
    assert.ok(atm && model);
    assert.ok(atm.cost > model.cost, "20% chain vol should price above the 16.6% VIX model");
  });
});

describe("presets and leg preparation", () => {
  it("builds an iron condor four strike-gaps and eight away from the ATM strike (23000 for a 23010 spot)", () => {
    const legs = presetLegs("ic", { spot: 23010, step: 50 }, 1);
    assert.deepEqual(legs.map((l) => [l.side, l.type, l.strike]), [["S", "CE", 23200], ["B", "CE", 23400], ["S", "PE", 22800], ["B", "PE", 22600]]);
  });
  it("a typed price beats the chain price, which beats the model", () => {
    const quote = () => ({ ltp: 150, iv: 18 });
    const base = { id: 1, side: "B" as const, type: "CE" as const, strike: 23000, lots: 1 };
    assert.equal(prepareLegs([{ ...base, price: 175 }], NIFTY, quote)[0].priceSource, "typed");
    assert.equal(prepareLegs([{ ...base, price: null }], NIFTY, quote)[0].priceSource, "chain");
    assert.equal(prepareLegs([{ ...base, price: null }], NIFTY)[0].priceSource, "model");
  });
});
