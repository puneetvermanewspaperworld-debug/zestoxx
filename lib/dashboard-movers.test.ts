import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankMovers, type MoverInput } from "./dashboard-movers";
import { fmtSigned } from "./helpers";

const row = (id: string, chg: number | null, over: Partial<MoverInput> = {}): MoverInput => ({ id, chg, real: true, indian: true, ...over });

describe("dashboard movers", () => {
  it("a negative change is never listed as a gainer, and a positive one never as a loser", () => {
    const r = rankMovers([row("SENSEX", -0.09), row("TCS", 1.2), row("SBIN", -2.5), row("INFY", 0.4), row("RELIANCE", 0.7), row("HDFCBANK", -0.3)]);
    assert.deepEqual(r.gainers.map((x) => x.id), ["TCS", "RELIANCE", "INFY"]);
    assert.deepEqual(r.losers.map((x) => x.id), ["SBIN", "HDFCBANK", "SENSEX"]);
    assert.ok(r.gainers.every((x) => (x.chg as number) > 0));
    assert.ok(r.losers.every((x) => (x.chg as number) < 0));
  });

  it("when everything is down there are no gainers, and the list is not padded", () => {
    const r = rankMovers([row("A", -0.1), row("B", -0.2), row("C", -0.3), row("D", -0.4)]);
    assert.equal(r.gainers.length, 0);
    assert.deepEqual(r.losers.map((x) => x.id), ["D", "C", "B"]);
  });

  it("a flat symbol is neither a gainer nor a loser", () => {
    const r = rankMovers([row("A", 0), row("B", 1), row("C", -1)]);
    assert.deepEqual(r.gainers.map((x) => x.id), ["B"]);
    assert.deepEqual(r.losers.map((x) => x.id), ["C"]);
  });

  it("only symbols with real data are ranked", () => {
    const r = rankMovers([row("SIM", 9, { real: false }), row("NOCHG", null), row("NAN", Number.NaN), row("OK", 1)]);
    assert.deepEqual(r.gainers.map((x) => x.id), ["OK"]);
    assert.equal(r.losers.length, 0);
  });

  it("crypto and other non-Indian symbols are kept out of the Indian movers", () => {
    const r = rankMovers([row("BTC", 5, { indian: false }), row("ETH", -5, { indian: false }), row("TCS", 1)]);
    assert.deepEqual(r.gainers.map((x) => x.id), ["TCS"]);
    assert.equal(r.losers.length, 0);
  });
});

describe("signed numbers never print +-", () => {
  it("puts the sign on the rounded value", () => {
    assert.equal(fmtSigned(-0.09, 2, "%"), "-0.09%");
    assert.equal(fmtSigned(1.256, 2, "%"), "+1.26%");
    assert.equal(fmtSigned(0, 2, "%"), "0.00%");
    assert.equal(fmtSigned(-0.004, 2, "%"), "0.00%");
    assert.equal(fmtSigned(0.004, 2, "%"), "0.00%");
    assert.equal(fmtSigned(null), "--");
    assert.equal(fmtSigned(Number.NaN), "--");
  });

  it("no formatted value contains +- or -+", () => {
    for (const v of [-100, -1.5, -0.09, -0.001, 0, 0.001, 0.09, 1.5, 1e6]) {
      const s = fmtSigned(v, 2, "%");
      assert.ok(!s.includes("+-") && !s.includes("-+"), s);
    }
  });
});
