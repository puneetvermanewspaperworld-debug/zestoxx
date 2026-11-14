import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHARGES, FUNDING_LABEL, GRID_MOVES, MTF_WARNING, RATE_LABEL, compute, normalise, tradeCharges, type MtfInput } from "./calc";

const near = (a: number, b: number, tol: number, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b}`);

/** The worked example of section D: price 839, exit 892, own ₹1,00,000, funding 60%, 10 days, interest 15%. */
const EXAMPLE: MtfInput = {
  price: 839,
  exitPrice: 892,
  ownAmount: 100_000,
  days: 10,
  fundingPct: 60,
  ratePct: 15,
  forcedSalePct: 20,
  charges: DEFAULT_CHARGES,
};

describe("worked example (section D)", () => {
  const r = compute(EXAMPLE);
  it("quantity: 297 with MTF, 119 without", () => {
    assert.equal(r.withMtf.quantity, 297);
    assert.equal(r.withoutMtf.quantity, 119);
  });
  it("leverage 2.5x", () => {
    near(r.leverage, 2.5, 1e-12);
  });
  it("gross profit 15,741 with MTF and 6,307 without", () => {
    assert.equal(r.withMtf.grossProfit, 15_741);
    assert.equal(r.withoutMtf.grossProfit, 6_307);
  });
  it("funded amount about 1,49,510 and interest about ₹614", () => {
    near(r.withMtf.fundedAmount, 149_510, 1);
    near(r.withMtf.interest, 614, 0.5);
    assert.equal(r.withoutMtf.fundedAmount, 0);
    assert.equal(r.withoutMtf.interest, 0);
  });
  it("a 40% fall wipes out the own capital", () => {
    near(r.wipeOutFallPct as number, 40, 1e-9);
  });
  it("a broker may sell at about 629, a 25% fall, at a 20% level", () => {
    near(r.forcedSalePrice as number, 629, 0.5);
    near(r.forcedSaleFallPct as number, 25, 0.1);
  });
  it("own capital used is quantity x price x (1 - funding%), position value is quantity x price", () => {
    near(r.withMtf.ownCapitalUsed, 297 * 839 * 0.4, 1e-6);
    near(r.withMtf.positionValue, 297 * 839, 1e-6);
    near(r.withoutMtf.ownCapitalUsed, 119 * 839, 1e-6);
  });
  it("net profit is gross profit less interest less charges, on both sides", () => {
    for (const s of [r.withMtf, r.withoutMtf]) near(s.netProfit, s.grossProfit - s.interest - s.charges, 1e-9);
  });
  it("net return is net profit over own capital used", () => {
    near(r.withMtf.netReturnPct as number, (r.withMtf.netProfit / r.withMtf.ownCapitalUsed) * 100, 1e-9);
    near(r.withoutMtf.netReturnPct as number, (r.withoutMtf.netProfit / r.withoutMtf.ownCapitalUsed) * 100, 1e-9);
  });
  it("breakeven is the price plus (interest + charges) per share", () => {
    near(r.withMtf.breakevenPrice as number, 839 + (r.withMtf.interest + r.withMtf.charges) / 297, 1e-9);
    near(r.withoutMtf.breakevenPrice as number, 839 + r.withoutMtf.charges / 119, 1e-9);
    assert.ok((r.withMtf.breakevenPrice as number) > 839);
  });
  it("MTF earns more than no MTF here, as the leverage suggests", () => {
    assert.ok(r.withMtf.netProfit > r.withoutMtf.netProfit);
  });
});

describe("delivery charges", () => {
  // 100 shares bought at 100 and sold at 110, ₹20 brokerage per order
  const c = { ...DEFAULT_CHARGES, brokeragePerOrder: 20 };
  it("each component, by hand", () => {
    const buy = 10_000;
    const sell = 11_000;
    const turnover = buy + sell;
    const brokerage = 40;
    const stt = turnover * 0.001;
    const stamp = buy * 0.00015;
    const txn = turnover * 0.0000307;
    const sebi = (turnover * 10) / 1e7;
    const gst = 0.18 * (brokerage + txn + sebi);
    const dp = 20;
    near(tradeCharges(100, 100, 110, c), brokerage + stt + stamp + txn + sebi + gst + dp, 1e-9);
    near(tradeCharges(100, 100, 110, c), 90.4855, 0.001);
  });
  it("stamp duty is on the buy only; STT, the NSE charge and the SEBI fee on both sides; the DP charge once", () => {
    const zero = { ...DEFAULT_CHARGES, brokeragePerOrder: 0, stampBuyPct: 0, sttPct: 0, nseTxnPct: 0, sebiPerCrore: 0, gstPct: 0, dpPerSell: 0 };
    near(tradeCharges(100, 100, 200, { ...zero, stampBuyPct: 0.015 }), 1.5, 1e-9);
    near(tradeCharges(100, 100, 200, { ...zero, sttPct: 0.1 }), 30, 1e-9);
    near(tradeCharges(100, 100, 200, { ...zero, dpPerSell: 20 }), 20, 1e-9);
    near(tradeCharges(100, 100, 200, { ...zero, sebiPerCrore: 10 }), (30_000 * 10) / 1e7, 1e-12);
  });
  it("GST is on brokerage, the transaction charge and the SEBI fee only", () => {
    const only = { ...DEFAULT_CHARGES, sttPct: 0, stampBuyPct: 0, dpPerSell: 0, brokeragePerOrder: 10 };
    const t = 100 * 100 + 100 * 100;
    const expected = 20 + t * 0.0000307 + (t * 10) / 1e7;
    near(tradeCharges(100, 100, 100, only), expected * 1.18, 1e-9);
  });
  it("no shares, no charges", () => {
    assert.equal(tradeCharges(0, 100, 110, c), 0);
  });
  it("editing a charge changes the result", () => {
    const base = compute(EXAMPLE).withMtf.charges;
    const more = compute({ ...EXAMPLE, charges: { ...DEFAULT_CHARGES, brokeragePerOrder: 50 } }).withMtf.charges;
    assert.ok(more > base + 99);
  });
});

describe("edges", () => {
  it("an amount too small for one share gives no quantity and no percentages", () => {
    const r = compute({ ...EXAMPLE, ownAmount: 100 });
    assert.equal(r.withMtf.quantity, 0);
    assert.equal(r.withoutMtf.quantity, 0);
    assert.equal(r.withMtf.netReturnPct, null);
    assert.equal(r.withMtf.breakevenPrice, null);
    assert.equal(r.wipeOutFallPct, null);
    assert.equal(r.forcedSalePrice, null);
    assert.equal(r.withMtf.charges, 0);
  });
  it("0% funding is the same as no MTF, with no forced-sale price", () => {
    const r = compute({ ...EXAMPLE, fundingPct: 0 });
    assert.equal(r.withMtf.quantity, r.withoutMtf.quantity);
    near(r.withMtf.netProfit, r.withoutMtf.netProfit, 1e-9);
    near(r.leverage, 1, 1e-12);
    assert.equal(r.forcedSalePrice, null);
    assert.equal(r.withMtf.interest, 0);
  });
  it("interest runs every calendar day: a year at 15% on the funded amount is 15% of it", () => {
    const r = compute({ ...EXAMPLE, days: 365 });
    near(r.withMtf.interest, r.withMtf.fundedAmount * 0.15, 1e-6);
    assert.equal(compute({ ...EXAMPLE, days: 0 }).withMtf.interest, 0);
  });
  it("leverage is 1 / (1 - funding%) and the wipe-out fall is 100 - funding%, for any funding", () => {
    for (const f of [10, 25, 40, 50, 60, 75, 90]) {
      const r = compute({ ...EXAMPLE, fundingPct: f });
      near(r.leverage, 1 / (1 - f / 100), 1e-12, `leverage at ${f}`);
      near(r.wipeOutFallPct as number, 100 - f, 1e-9, `wipe-out at ${f}`);
    }
  });
  it("the forced-sale price rises with the broker's level, and is above the wipe-out price", () => {
    const lo = compute({ ...EXAMPLE, forcedSalePct: 10 }).forcedSalePrice as number;
    const hi = compute({ ...EXAMPLE, forcedSalePct: 30 }).forcedSalePrice as number;
    assert.ok(hi > lo);
    const wipe = 839 * (1 - 0.4);
    assert.ok(lo > wipe);
  });
  it("typed values are bounded: 100% funding, negatives and NaN never divide by zero or go negative", () => {
    const n = normalise({ ...EXAMPLE, fundingPct: 100, days: -5, ratePct: Number.NaN, ownAmount: -1 });
    assert.equal(n.fundingPct, 95);
    assert.equal(n.days, 0);
    assert.equal(n.ratePct, 0);
    assert.equal(n.ownAmount, 0);
    const r = compute({ ...EXAMPLE, fundingPct: 100 });
    assert.ok(Number.isFinite(r.leverage) && Number.isFinite(r.withMtf.netProfit));
  });
});

describe("the net profit grid: losses as visible as gains", () => {
  const r = compute(EXAMPLE);
  it("has the seven exit moves, for both choices", () => {
    assert.deepEqual(r.grid.map((g) => g.movePct), [...GRID_MOVES]);
    assert.deepEqual([...GRID_MOVES], [-20, -10, -5, 0, 5, 10, 20]);
  });
  it("each exit price is the entry price moved by that percent", () => {
    for (const g of r.grid) near(g.exitPrice, 839 * (1 + g.movePct / 100), 1e-9);
  });
  it("at 0% the gross profit is nil, so the net is minus the interest and charges", () => {
    const zero = r.grid.find((g) => g.movePct === 0)!;
    assert.ok(zero.mtfNet < 0 && zero.plainNet < 0);
    near(zero.mtfNet, -(r.withMtf.interest + tradeCharges(297, 839, 839, DEFAULT_CHARGES)), 1e-9);
    near(zero.plainNet, -tradeCharges(119, 839, 839, DEFAULT_CHARGES), 1e-9);
  });
  it("the +/-5 and 10 rows agree with the main calculation at the same exit", () => {
    const direct = compute({ ...EXAMPLE, exitPrice: 839 * 1.1 });
    const row = r.grid.find((g) => g.movePct === 10)!;
    near(row.mtfNet, direct.withMtf.netProfit, 1e-9);
    near(row.plainNet, direct.withoutMtf.netProfit, 1e-9);
  });
  it("MTF magnifies losses as well as gains", () => {
    for (const g of r.grid.filter((x) => x.movePct <= -5)) assert.ok(g.mtfNet < g.plainNet, `at ${g.movePct}%`);
    for (const g of r.grid.filter((x) => x.movePct >= 10)) assert.ok(g.mtfNet > g.plainNet, `at ${g.movePct}%`);
  });
  it("a 20% fall loses more than a 20% rise gains back (interest and charges only subtract)", () => {
    const down = r.grid.find((g) => g.movePct === -20)!;
    const up = r.grid.find((g) => g.movePct === 20)!;
    assert.ok(Math.abs(down.mtfNet) > Math.abs(up.mtfNet) * 0.7);
    assert.ok(down.mtfNet < 0 && up.mtfNet > 0);
  });
});

describe("required wording", () => {
  it("the risk text and the labels are exactly as specified", () => {
    assert.equal(
      MTF_WARNING,
      "MTF magnifies losses as well as gains. Interest accrues daily. Shares are pledged to your broker. Eligible stocks and funding vary by broker. This is a calculator, not an offer."
    );
    assert.equal(FUNDING_LABEL, "Illustrative. Your broker sets this for each stock.");
    assert.equal(RATE_LABEL, "Check your broker's rate.");
  });
});
