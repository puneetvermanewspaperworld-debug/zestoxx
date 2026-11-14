import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_AMOUNT, MIN_AMOUNT, amountFromSlider, calculate, clampAmount, sliderFromAmount } from "./sip";

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

describe("lump sum", () => {
  it("grows at the yearly return", () => {
    const r = calculate({ mode: "lump", amount: 100_000, years: 5, yearlyReturnPct: 10 });
    near(r.futureValue, 100_000 * Math.pow(1.1, 5));
    assert.equal(r.invested, 100_000);
    near(r.gain, r.futureValue - 100_000);
  });
  it("zero return gives back what was put in; a negative return loses", () => {
    near(calculate({ mode: "lump", amount: 5000, years: 3, yearlyReturnPct: 0 }).futureValue, 5000);
    assert.ok(calculate({ mode: "lump", amount: 5000, years: 3, yearlyReturnPct: -10 }).futureValue < 5000);
  });
});

describe("monthly SIP", () => {
  it("the standard annuity-due formula: 12% a year compounded monthly-equivalent, 5000 a month for 10 years", () => {
    const r = calculate({ mode: "sip", amount: 5000, years: 10, yearlyReturnPct: 12 });
    const m = Math.pow(1.12, 1 / 12) - 1;
    near(r.futureValue, 5000 * ((Math.pow(1 + m, 120) - 1) / m) * (1 + m));
    assert.equal(r.invested, 600_000);
    assert.ok(r.futureValue > 1_100_000 && r.futureValue < 1_200_000, String(r.futureValue)); // about 11.5 lakh
  });
  it("zero return is just the sum of the payments", () => {
    const r = calculate({ mode: "sip", amount: 1000, years: 2, yearlyReturnPct: 0 });
    assert.equal(r.futureValue, 24_000);
    assert.equal(r.gain, 0);
  });
  it("one year at the yearly return pays out more than the payments when the return is positive", () => {
    const r = calculate({ mode: "sip", amount: 1000, years: 1, yearlyReturnPct: 12 });
    assert.ok(r.futureValue > 12_000 && r.futureValue < 12_800);
  });
  it("zero years gives nothing for a SIP and the amount back for a lump sum", () => {
    assert.equal(calculate({ mode: "sip", amount: 1000, years: 0, yearlyReturnPct: 12 }).futureValue, 0);
    assert.equal(calculate({ mode: "lump", amount: 1000, years: 0, yearlyReturnPct: 12 }).futureValue, 1000);
  });
});

describe("amount bounds and the slider", () => {
  it("amounts are held between 100 and 10,00,000, and junk becomes the minimum", () => {
    assert.equal(MIN_AMOUNT, 100);
    assert.equal(MAX_AMOUNT, 1_000_000);
    assert.equal(clampAmount(5), 100);
    assert.equal(clampAmount(5_000_000), 1_000_000);
    assert.equal(clampAmount(Number.NaN), 100);
    assert.equal(calculate({ mode: "lump", amount: 50, years: 1, yearlyReturnPct: 0 }).invested, 100);
  });
  it("the slider runs from 100 to 10,00,000 on a log scale and round-trips close to the amount", () => {
    assert.equal(amountFromSlider(0), 100);
    assert.equal(amountFromSlider(1), 1_000_000);
    for (const a of [100, 500, 5000, 25_000, 100_000, 1_000_000]) {
      const back = amountFromSlider(sliderFromAmount(a));
      assert.ok(Math.abs(back - a) / a < 0.2, `${a} -> ${back}`);
    }
    let prev = 0;
    for (let p = 0; p <= 1; p += 0.05) {
      const v = amountFromSlider(p);
      assert.ok(v >= prev);
      prev = v;
    }
  });
});
