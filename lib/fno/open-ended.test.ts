import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STRESS_MOVE, computeExtremes, computeStatic, evaluate, greeksNow, prepareLegs, presetLegs, type LegInput, type Market, type PreparedLeg } from "./engine";
import { explain, slopeText } from "./explain";
import { rs } from "./format";

/**
 * Best and worst case for open-ended trades: a slope, the value inside the expected range and at 3 standard deviations, and one
 * stress case at a 20% move — never the index-at-zero number. A capped side keeps its real cap exactly as before.
 */

const SPOT = 25200;
const M: Market = { spot: SPOT, dte: 6, iv: 15.2, r: 6.5, q: 1.3, lot: 65, step: 50, brokerage: 20, slab: 30, exitStyle: "expire" };
const QTY = M.lot;
const sigT = (M.iv / 100) * Math.sqrt(M.dte / 365);

const near = (actual: number, expected: number, tol: number, msg: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: got ${actual}, want ${expected} ± ${tol}`);
const leg = (side: "B" | "S", type: "CE" | "PE" | "FUT", strike: number, id = 1): LegInput => ({ id, side, type, strike, lots: 1, price: null });

const setup = (legs: LegInput[]) => {
  const P = prepareLegs(legs, M);
  const st = computeStatic(P, M);
  return { P, st, ex: computeExtremes(P, M, st) };
};
const pre = (P: PreparedLeg[], x: number) => evaluate(P, M, x, M.dte, 0, M.exitStyle).pre;
const gross = (P: PreparedLeg[], x: number) => evaluate(P, M, x, M.dte, 0, M.exitStyle).gross;
const text = (P: PreparedLeg[], st: ReturnType<typeof computeStatic>) =>
  explain(P, M, st, evaluate(P, M, SPOT, 0, 0, "square"), greeksNow(P, M), "Nifty", 0).map((l) => l.html).join("\n");
/** the value the old single number showed: the best or worst over every index level, including zero */
const theoretical = (P: PreparedLeg[], st: ReturnType<typeof computeStatic>) => ({ best: st.maxV, worst: st.minV, atZero: pre(P, 0.01) });

describe("long put: profit grows as the index falls; the loss is capped", () => {
  const { P, st, ex } = setup([leg("B", "PE", 25200)]);
  it("best case is open-ended downwards, at the position's slope", () => {
    assert.equal(ex.best.open.length, 1);
    assert.equal(ex.best.open[0].dir, "down");
    // slope measured independently from the exit pricing, far below the strike
    near(ex.best.open[0].perPoint, (gross(P, 2000) - gross(P, 2100)) / 100, 1e-6, "slope");
    near(ex.best.open[0].perPoint, QTY, 1e-9, "one lot");
    assert.match(slopeText(ex.best.open, "best"), /^Grows about ₹6,500 for every 100 points the index falls$/);
  });
  it("the worst case is the real cap: the premium and charges", () => {
    assert.equal(ex.worst.open.length, 0);
    assert.equal(ex.worst.cap, st.minV);
    assert.ok(ex.worst.cap < 0 && ex.worst.cap > -(P[0].entry * QTY + 300));
  });
  it("best case inside the expected range and at 3 standard deviations", () => {
    near(ex.best.inRange.value, pre(P, SPOT * Math.exp(-sigT)), 1e-6, "inside 1 sd");
    near(ex.best.at3.value, pre(P, SPOT * Math.exp(-3 * sigT)), 1e-6, "inside 3 sd");
    near(ex.best.inRange.lo, SPOT * Math.exp(-sigT), 1e-9, "range low");
    near(ex.best.inRange.hi, SPOT * Math.exp(sigT), 1e-9, "range high");
    assert.ok(ex.best.at3.value > ex.best.inRange.value);
  });
  it("one stress case: the index 20% lower", () => {
    assert.equal(ex.best.stress.length, 1);
    assert.equal(ex.best.stress[0].dir, "down");
    near(ex.best.stress[0].spot, SPOT * (1 - STRESS_MOVE), 1e-9, "stress level");
    near(ex.best.stress[0].value, pre(P, SPOT * 0.8), 1e-6, "stress value");
    assert.equal(ex.worst.stress.length, 0);
  });
  it("never shows the index-at-zero number", () => {
    const t = theoretical(P, st);
    assert.ok(t.best > 10 * ex.best.at3.value, "the old number was far larger");
    for (const v of [ex.best.inRange.value, ex.best.at3.value, ...ex.best.stress.map((s) => s.value)]) assert.notEqual(Math.round(v), Math.round(t.best));
    const words = text(P, st);
    assert.ok(!words.includes(rs(t.best)), "plain words must not quote the index-at-zero figure");
    assert.ok(!/unlimited/i.test(words));
    assert.ok(words.includes("Grows about ₹6,500 for every 100 points"));
    assert.ok(words.includes("Stress case"));
    assert.ok(!words.includes("The loss is open-ended"), "the open side here is profit");
  });
});

describe("long call: profit grows as the index rises; the loss is capped", () => {
  const { P, st, ex } = setup([leg("B", "CE", 25200)]);
  it("best case open upwards at the slope", () => {
    assert.deepEqual(ex.best.open.map((o) => o.dir), ["up"]);
    near(ex.best.open[0].perPoint, (gross(P, 60100) - gross(P, 60000)) / 100, 1e-6, "slope");
    near(ex.best.open[0].perPoint, QTY, 1e-9, "one lot");
  });
  it("the loss keeps its real cap", () => {
    assert.equal(ex.worst.open.length, 0);
    assert.equal(ex.worst.cap, st.minV);
    near(ex.worst.cap, pre(P, SPOT * 0.5), 1e-6, "loss with the call worthless");
  });
  it("stress is a 20% rise and the values are real evaluations", () => {
    assert.equal(ex.best.stress[0].dir, "up");
    near(ex.best.stress[0].value, pre(P, SPOT * 1.2), 1e-6, "stress");
    near(ex.best.inRange.value, pre(P, SPOT * Math.exp(sigT)), 1e-6, "1 sd");
    near(ex.best.at3.value, pre(P, SPOT * Math.exp(3 * sigT)), 1e-6, "3 sd");
  });
  it("the words say so, and nothing says unlimited", () => {
    const words = text(P, st);
    assert.ok(words.includes("Grows about ₹6,500 for every 100 points the index rises"));
    assert.ok(!/unlimited/i.test(words));
  });
});

describe("short call: the loss grows as the index rises; the profit is capped", () => {
  const { P, st, ex } = setup([leg("S", "CE", 25400)]);
  it("worst case open upwards", () => {
    assert.deepEqual(ex.worst.open.map((o) => o.dir), ["up"]);
    near(ex.worst.open[0].perPoint, QTY, 1e-9, "one lot");
    assert.match(slopeText(ex.worst.open, "worst"), /^Loses about ₹6,500 for every 100 points the index rises$/);
  });
  it("the profit keeps its real cap: the premium less charges", () => {
    assert.equal(ex.best.open.length, 0);
    assert.equal(ex.best.cap, st.maxV);
    assert.ok(ex.best.cap > 0 && ex.best.cap < P[0].entry * QTY);
  });
  it("worst case inside the range, at 3 sd, and the stress loss at a 20% rise", () => {
    near(ex.worst.inRange.value, pre(P, SPOT * Math.exp(sigT)), 1e-6, "1 sd");
    near(ex.worst.at3.value, pre(P, SPOT * Math.exp(3 * sigT)), 1e-6, "3 sd");
    assert.equal(ex.worst.stress[0].dir, "up");
    near(ex.worst.stress[0].value, pre(P, SPOT * 1.2), 1e-6, "stress");
    assert.ok(ex.worst.stress[0].value < ex.worst.at3.value && ex.worst.stress[0].value < 0);
  });
  it("the words carry the open-ended note and never say unlimited", () => {
    const words = text(P, st);
    assert.ok(words.includes("Loses about ₹6,500 for every 100 points"));
    assert.ok(words.includes("Stress case"));
    assert.ok(words.includes("The loss is open-ended."));
    assert.ok(!/unlimited/i.test(words));
  });
});

describe("short put: the loss grows as the index falls; the profit is capped", () => {
  const { P, st, ex } = setup([leg("S", "PE", 25000)]);
  it("worst case open downwards", () => {
    assert.deepEqual(ex.worst.open.map((o) => o.dir), ["down"]);
    near(ex.worst.open[0].perPoint, (gross(P, 2100) - gross(P, 2000)) / 100, 1e-6, "slope");
    near(ex.worst.open[0].perPoint, QTY, 1e-9, "one lot");
  });
  it("profit capped and real; the stress is a 20% fall, with the note", () => {
    assert.equal(ex.best.open.length, 0);
    assert.equal(ex.best.cap, st.maxV);
    assert.equal(ex.worst.stress[0].dir, "down");
    near(ex.worst.stress[0].value, pre(P, SPOT * 0.8), 1e-6, "stress");
    assert.ok(text(P, st).includes("The loss is open-ended."));
    const t = theoretical(P, st);
    assert.ok(!text(P, st).includes(rs(t.worst)), "the index-at-zero loss is not quoted");
  });
});

describe("long future: both sides are open-ended", () => {
  const { P, st, ex } = setup([leg("B", "FUT", 0)]);
  it("profit grows as the index rises; the loss grows as it falls", () => {
    assert.deepEqual(ex.best.open.map((o) => o.dir), ["up"]);
    assert.deepEqual(ex.worst.open.map((o) => o.dir), ["down"]);
    near(ex.best.open[0].perPoint, QTY, 1e-9, "profit slope");
    near(ex.worst.open[0].perPoint, QTY, 1e-9, "loss slope");
  });
  it("each side has its own stress case", () => {
    assert.equal(ex.best.stress[0].dir, "up");
    assert.equal(ex.worst.stress[0].dir, "down");
    near(ex.best.stress[0].value, pre(P, SPOT * 1.2), 1e-6, "up");
    near(ex.worst.stress[0].value, pre(P, SPOT * 0.8), 1e-6, "down");
  });
  it("the words never quote the zero-index figure", () => {
    const t = theoretical(P, st);
    const words = text(P, st);
    assert.ok(!words.includes(rs(t.worst)) && !words.includes(rs(t.best)));
    assert.ok(!/unlimited/i.test(words));
  });
});

describe("bull call spread: both sides are capped, nothing changes", () => {
  const legs = presetLegs("bcs", M, 1);
  const { P, st, ex } = setup(legs);
  it("no open end on either side, no stress case", () => {
    assert.equal(ex.best.open.length, 0);
    assert.equal(ex.worst.open.length, 0);
    assert.equal(ex.best.stress.length + ex.worst.stress.length, 0);
  });
  it("the caps are exactly the numbers the page always showed", () => {
    assert.equal(ex.best.cap, st.maxV);
    assert.equal(ex.worst.cap, st.minV);
    // and they are the real payoff at each end, worked independently
    // held to expiry the best result is at the short strike (beyond it the exercised long call adds STT)
    const shortStrike = P.find((l) => l.sign < 0)!.strike;
    near(ex.best.cap, pre(P, shortStrike), 1e-6, "capped profit at the short strike");
    assert.ok(ex.best.cap >= pre(P, SPOT * 1.5));
    near(ex.worst.cap, pre(P, SPOT * 0.5), 1e-6, "capped loss below both strikes");
  });
  it("the words quote the two numbers and add no slope or stress line", () => {
    const words = text(P, st);
    assert.ok(words.includes(rs(st.maxV)) && words.includes(rs(st.minV)));
    assert.ok(!words.includes("for every 100 points") && !words.includes("Stress case") && !/unlimited/i.test(words));
  });
});

describe("the other shapes", () => {
  const shape = (id: string) => setup(presetLegs(id, M, 1)).ex;
  it("bear put spread and iron condor are capped on both sides", () => {
    for (const id of ["bps", "ic"]) {
      const ex = shape(id);
      assert.equal(ex.best.open.length + ex.worst.open.length, 0, id);
    }
  });
  it("long straddle: profit open both ways, loss capped", () => {
    const ex = shape("ls");
    assert.deepEqual(ex.best.open.map((o) => o.dir).sort(), ["down", "up"]);
    assert.equal(ex.worst.open.length, 0);
    assert.match(slopeText(ex.best.open, "best"), /for every 100 points the index moves either way$/);
    assert.equal(ex.best.stress.length, 2);
  });
  it("short straddle and short strangle: loss open both ways, profit capped", () => {
    for (const id of ["ss", "sst"]) {
      const ex = shape(id);
      assert.deepEqual(ex.worst.open.map((o) => o.dir).sort(), ["down", "up"], id);
      assert.equal(ex.best.open.length, 0, id);
      assert.equal(ex.worst.stress.length, 2, id);
    }
  });
  it("short future: profit open downwards, loss open upwards", () => {
    const ex = shape("sf");
    assert.deepEqual(ex.best.open.map((o) => o.dir), ["down"]);
    assert.deepEqual(ex.worst.open.map((o) => o.dir), ["up"]);
  });
  it("a ratio spread (buy 1, sell 2 calls) has an open-ended loss upwards and a different slope", () => {
    const { ex } = setup([leg("B", "CE", 25200), { ...leg("S", "CE", 25400, 2), lots: 2 }]);
    assert.deepEqual(ex.worst.open.map((o) => o.dir), ["up"]);
    near(ex.worst.open[0].perPoint, QTY, 1e-9, "net one lot short");
  });
});
