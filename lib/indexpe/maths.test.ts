import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_AGE_TRADING_DAYS, MIN_HISTORY_DAYS, UNDERLYING_INDEX, buildIndexPE, isStale, latestExpectedDate, livePE, median, tradingDaysOld } from "./maths";
import type { IndexDayRow } from "./types";

const near = (a: number | null, b: number, tol = 1e-9) => assert.ok(a !== null && Math.abs(a - b) <= tol, `got ${a}, want ${b}`);
const ist = (s: string) => new Date(s + "+05:30");

describe("live P/E = close P/E × live spot ÷ last close", () => {
  it("the index up 1% since the close lifts the P/E 1%", () => near(livePE(20, 25000 * 1.01, 25000), 20.2));
  it("the index down 2% lowers it 2%", () => near(livePE(20, 25000 * 0.98, 25000), 19.6));
  it("an unchanged index leaves it as it was", () => near(livePE(20.62, 25299.35, 25299.35), 20.62));
  it("a worked example: close P/E 20.62 at 25,299.35; the index at 25,552.34 is +1.0000%", () => near(livePE(20.62, 25552.3435, 25299.35), 20.8262, 1e-4));
  it("scales in proportion for any index (Bank Nifty 13.6 at 61,518.5, now 60,903.3)", () => near(livePE(13.6, 60903.315, 61518.5), 13.6 * (60903.315 / 61518.5)));
  it("nothing to work from means nothing, never a made-up number", () => {
    assert.equal(livePE(null, 25000, 25000), null);
    assert.equal(livePE(undefined, 25000, 25000), null);
    assert.equal(livePE(0, 25000, 25000), null);
    assert.equal(livePE(-3, 25000, 25000), null);
    assert.equal(livePE(20, 0, 25000), null);
    assert.equal(livePE(20, 25000, 0), null);
    assert.equal(livePE(20, NaN, 25000), null);
    assert.equal(livePE(20, 25000, Infinity), null);
  });
});

describe("median", () => {
  it("odd count: the middle value", () => assert.equal(median([30, 10, 20]), 20));
  it("even count: the mean of the middle two", () => assert.equal(median([40, 10, 30, 20]), 25));
  it("is not pulled by a single extreme day", () => assert.equal(median([20, 21, 22, 23, 500]), 22));
  it("nothing in, nothing out; non-numbers are ignored", () => {
    assert.equal(median([]), null);
    assert.equal(median([NaN, 10, 30]), 20);
  });
  it("does not change the order of the caller's array", () => {
    const a = [3, 1, 2];
    median(a);
    assert.deepEqual(a, [3, 1, 2]);
  });
});

// Mon 9 Nov 2026 normal; Tue 10 Nov holiday; Wed 11 to Fri 13 Nov normal; 14–15 Nov a weekend; Sun 8 Nov is a Muhurat session
describe("which close should exist by now", () => {
  it("a trading day after 18:00 IST: today's", () => assert.equal(latestExpectedDate(ist("2026-11-12T18:00:00")), "2026-11-12"));
  it("a trading day before 18:00 IST: yesterday's", () => assert.equal(latestExpectedDate(ist("2026-11-12T17:59:00")), "2026-11-11"));
  it("the small hours: the previous trading day", () => assert.equal(latestExpectedDate(ist("2026-11-12T02:42:00")), "2026-11-11"));
  it("the weekend: Friday", () => assert.equal(latestExpectedDate(ist("2026-11-14T20:00:00")), "2026-11-13"));
  it("the day after a holiday, before 18:00: skips the holiday (10 Nov → 9 Nov)", () => assert.equal(latestExpectedDate(ist("2026-11-11T10:00:00")), "2026-11-09"));
});

describe("stale data: older than 3 trading days", () => {
  it("yesterday's close in the small hours is current (0 days old)", () => {
    assert.equal(tradingDaysOld("2026-11-11", ist("2026-11-12T02:42:00")), 0);
    assert.equal(isStale("2026-11-11", ist("2026-11-12T02:42:00")), false);
  });
  it("today's close is not due until 18:00, so yesterday's is still current at noon", () => assert.equal(tradingDaysOld("2026-11-11", ist("2026-11-12T12:00:00")), 0));
  it("after 18:00 with today's file missing, the data is 1 trading day behind: still usable", () => {
    assert.equal(tradingDaysOld("2026-11-11", ist("2026-11-12T19:00:00")), 1);
    assert.equal(isStale("2026-11-11", ist("2026-11-12T19:00:00")), false);
  });
  it("exactly 3 trading days behind is not stale", () => {
    // latest expected Fri 13 Nov; stored close Tue 10 Nov is a holiday, so use Mon 9: trading days after it are 11, 12, 13
    assert.equal(tradingDaysOld("2026-11-09", ist("2026-11-13T20:00:00")), 3);
    assert.equal(isStale("2026-11-09", ist("2026-11-13T20:00:00")), false);
  });
  it("4 trading days behind is stale", () => {
    // the 8 Nov Muhurat session counts as a trading day: after Fri 6 Nov come 8, 9, 11 and 12 Nov
    assert.equal(tradingDaysOld("2026-11-06", ist("2026-11-12T20:00:00")), 4);
    assert.equal(isStale("2026-11-06", ist("2026-11-12T20:00:00")), true);
    assert.equal(tradingDaysOld("2026-11-05", ist("2026-11-12T20:00:00")), 5);
  });
  it("a long weekend does not make fresh data look stale (Friday's close on Monday morning)", () => {
    assert.equal(tradingDaysOld("2026-11-13", ist("2026-11-16T09:00:00")), 0);
    assert.equal(tradingDaysOld("2026-11-13", ist("2026-11-16T19:00:00")), 1);
  });
  it("a holiday is not a missing day (data from 9 Nov on the morning of 11 Nov)", () => assert.equal(tradingDaysOld("2026-11-09", ist("2026-11-11T10:00:00")), 0));
  it("months old is stale", () => assert.equal(isStale("2026-08-01", ist("2026-11-12T20:00:00")), true));
  it("the limit is 3", () => assert.equal(MAX_AGE_TRADING_DAYS, 3));
});

const row = (date: string, pe: number | null, close = 25000): IndexDayRow => ({ indexName: "Nifty 50", date, close, pe, pb: 3, divYield: 1.3 });
const history = (n: number, base = 20) => Array.from({ length: n }, (_, i) => base + (i % 5) * 0.5); // 20, 20.5, 21, 21.5, 22, ...

describe("what the snapshot returns as indexPE", () => {
  const now = ist("2026-11-12T11:00:00"); // the close of 11 Nov is the latest that exists
  it("close P/E, its date, the source, and the live P/E at the snapshot's spot", () => {
    const p = buildIndexPE(row("2026-11-11", 20.62, 25000), history(30), 25250, now)!;
    assert.equal(p.value, 20.62);
    assert.equal(p.asOfDate, "2026-11-11");
    assert.equal(p.source, "NSE close");
    near(p.livePE, 20.62 * 1.01, 1e-9);
    assert.equal(p.stale, false);
    assert.equal(p.tradingDaysOld, 0);
  });
  it("the long-run P/E is the median of the stored history, once there are enough days", () => {
    const h = history(40);
    assert.equal(buildIndexPE(row("2026-11-11", 20.62), h, 25000, now)!.medianPE, median(h));
    assert.equal(buildIndexPE(row("2026-11-11", 20.62), h, 25000, now)!.historyDays, 40);
  });
  it(`fewer than ${MIN_HISTORY_DAYS} stored days: no median (history is still building)`, () => {
    const p = buildIndexPE(row("2026-11-11", 20.62), history(MIN_HISTORY_DAYS - 1), 25000, now)!;
    assert.equal(p.medianPE, null);
    assert.equal(p.historyDays, MIN_HISTORY_DAYS - 1);
    assert.notEqual(buildIndexPE(row("2026-11-11", 20.62), history(MIN_HISTORY_DAYS), 25000, now)!.medianPE, null);
  });
  it("a stale close is still returned, marked stale, so the page can say why it shows Manual", () => {
    const p = buildIndexPE(row("2026-10-01", 20.62), history(30), 25000, now)!;
    assert.equal(p.stale, true);
    assert.ok(p.tradingDaysOld > MAX_AGE_TRADING_DAYS);
    assert.equal(p.asOfDate, "2026-10-01");
  });
  it("nothing stored, or an index with no P/E: null", () => {
    assert.equal(buildIndexPE(null, [], 25000, now), null);
    assert.equal(buildIndexPE(row("2026-11-11", null), [], 25000, now), null);
    assert.equal(buildIndexPE(row("2026-11-11", 0), [], 25000, now), null);
  });
  it("a spot that cannot be used leaves the live P/E null but keeps the close P/E", () => {
    const p = buildIndexPE(row("2026-11-11", 20.62, 25000), history(30), 0, now)!;
    assert.equal(p.livePE, null);
    assert.equal(p.value, 20.62);
  });
});

describe("which index goes with which underlying", () => {
  it("the four indices NSE's file has, and nothing for a stock", () => {
    assert.equal(UNDERLYING_INDEX.NIFTY, "Nifty 50");
    assert.equal(UNDERLYING_INDEX.BANKNIFTY, "Nifty Bank");
    assert.equal(UNDERLYING_INDEX.FINNIFTY, "Nifty Financial Services");
    assert.equal(UNDERLYING_INDEX.MIDCPNIFTY, "Nifty Midcap Select");
    assert.equal(UNDERLYING_INDEX.RELIANCE, undefined);
  });
});
