import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MANUAL_PE, MANUAL_PE_AVG, resolveValuation, whyManual } from "./valuation";
import type { IndexPE } from "./types";

/** A fresh NSE reading: close P/E 20.62 on 11 Nov, the index 1% up since (live 20.83), 40 days of history with a median of 21.4. */
const fresh = (over: Partial<IndexPE> = {}): IndexPE => ({
  value: 20.62,
  asOfDate: "2026-11-11",
  source: "NSE close",
  livePE: 20.8262,
  medianPE: 21.4,
  historyDays: 40,
  tradingDaysOld: 0,
  stale: false,
  ...over,
});

describe("fresh NSE data replaces the typed P/E", () => {
  const v = resolveValuation(fresh(), {});
  it('the P/E is the live estimate and is labelled "NSE close, estimated live"', () => {
    assert.equal(v.pe.value, 20.8262);
    assert.equal(v.pe.source, "nse");
    assert.equal(v.pe.label, "NSE close, estimated live");
  });
  it("the detail says what it is made of: the close, its date and the scaling", () => {
    assert.match(v.pe.detail, /NSE close of 11 Nov 2026: P\/E 20\.62, scaled to the live index level: 20\.83/);
  });
  it("the long-run P/E is the median of the stored history", () => {
    assert.equal(v.peAvg.value, 21.4);
    assert.equal(v.peAvg.source, "nse");
    assert.match(v.peAvg.label, /Median of 40 stored days/);
  });
  it("if only the close P/E can be used (no live scaling), it is labelled as the close", () => {
    const w = resolveValuation(fresh({ livePE: null }), {});
    assert.equal(w.pe.value, 20.62);
    assert.equal(w.pe.label, "NSE close");
    assert.equal(w.pe.source, "nse");
  });
});

describe("missing data: Manual, and the field stays editable", () => {
  const v = resolveValuation(null, {});
  it("falls back to the manual defaults, labelled Manual", () => {
    assert.deepEqual([v.pe.value, v.pe.source, v.pe.label], [MANUAL_PE, "manual", "Manual"]);
    assert.deepEqual([v.peAvg.value, v.peAvg.source, v.peAvg.label], [MANUAL_PE_AVG, "manual", "Manual"]);
  });
  it("says why", () => {
    assert.match(v.pe.detail, /not stored for this index yet/);
    assert.match(v.pe.detail, /Enter the figure yourself/);
    assert.equal(whyManual(undefined), "NSE's P/E is not stored for this index yet.");
  });
});

describe("stale data (older than 3 trading days): Manual, with the reason", () => {
  const stale = fresh({ asOfDate: "2026-11-05", tradingDaysOld: 5, stale: true });
  const v = resolveValuation(stale, {});
  it("both figures are Manual even though NSE's numbers exist", () => {
    assert.equal(v.pe.source, "manual");
    assert.equal(v.pe.label, "Manual");
    assert.equal(v.peAvg.source, "manual");
    assert.equal(v.pe.value, MANUAL_PE, "the stale 20.62 is not used");
  });
  it("the reason names the age and the date", () => {
    assert.match(v.pe.detail, /05 Nov 2026\) is 5 trading days old, more than 3/);
    assert.match(whyManual(stale) ?? "", /5 trading days old/);
  });
  it("exactly at the limit (3 days) is still fresh", () => assert.equal(resolveValuation(fresh({ tradingDaysOld: 3, stale: false }), {}).pe.source, "nse"));
});

describe("a typed value always wins and is labelled Manual", () => {
  it("a typed P/E over fresh NSE data; the long-run median is still NSE's", () => {
    const v = resolveValuation(fresh(), { pe: 25 });
    assert.deepEqual([v.pe.value, v.pe.source, v.pe.label], [25, "typed", "Manual"]);
    assert.equal(v.peAvg.source, "nse");
  });
  it("a typed long-run P/E over fresh NSE data", () => {
    const v = resolveValuation(fresh(), { peAvg: 19 });
    assert.deepEqual([v.peAvg.value, v.peAvg.source, v.peAvg.label], [19, "typed", "Manual"]);
    assert.equal(v.pe.source, "nse");
  });
  it("typed values survive stale or missing NSE data", () => {
    assert.equal(resolveValuation(fresh({ stale: true, tradingDaysOld: 9 }), { pe: 25 }).pe.value, 25);
    assert.equal(resolveValuation(null, { pe: 25, peAvg: 19 }).peAvg.value, 19);
  });
  it("a typed 0 is a value (not 'nothing typed')", () => assert.equal(resolveValuation(fresh(), { pe: 0 }).pe.source, "typed"));
});

describe("history still building", () => {
  it("fewer than 20 stored days: the long-run P/E is Manual and says how many days there are", () => {
    const v = resolveValuation(fresh({ medianPE: null, historyDays: 7 }), {});
    assert.equal(v.pe.source, "nse", "today's P/E is still NSE's");
    assert.equal(v.peAvg.source, "manual");
    assert.equal(v.peAvg.value, MANUAL_PE_AVG);
    assert.match(v.peAvg.detail, /Only 7 days of history are stored; a median needs 20/);
  });
});
