import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, cashDayCount, flowRows, futuresRows, latestCash, latestFutures, longPct, weekStart } from "./rollup";
import type { FiiDiiDayRow } from "./types";

/** A stored day with cash figures (and optionally futures positions). FII net = buy − sell; DII is a made-up mirror for the test. */
const cash = (date: string, fiiNet: number, diiNet = -fiiNet / 2, extra: Partial<FiiDiiDayRow> = {}): FiiDiiDayRow => ({
  date,
  cash: { fii: { buy: 20000 + Math.max(fiiNet, 0), sell: 20000 + Math.max(-fiiNet, 0), net: fiiNet }, dii: { buy: 15000 + Math.max(diiNet, 0), sell: 15000 + Math.max(-diiNet, 0), net: diiNet } },
  idxFut: null,
  provisional: true,
  ...extra,
});
const oi = (date: string, long: number, short: number): FiiDiiDayRow => ({ date, cash: null, idxFut: { long, short }, provisional: false });

// Mon 9 Nov 2026 is a normal day, Tue 10 Nov is an exchange holiday, 11–13 Nov are normal days, 14–15 Nov a weekend.
describe("daily rows", () => {
  it("one row per stored day, oldest first, with the right entity", () => {
    const r = flowRows([cash("2026-11-11", 12563.33, -8434.53), cash("2026-11-09", -500)], "daily", "FII");
    assert.deepEqual(r.map((x) => [x.key, x.net, x.missing]), [["2026-11-09", -500, false], ["2026-11-11", 12563.33, false]]);
    const d = flowRows([cash("2026-11-11", 12563.33, -8434.53)], "daily", "DII");
    assert.equal(d[0].net, -8434.53);
  });
  it("an exchange holiday between two stored days is not a missing day", () => {
    const r = flowRows([cash("2026-11-09", 100), cash("2026-11-11", 200)], "daily", "FII");
    assert.deepEqual(r.map((x) => x.key), ["2026-11-09", "2026-11-11"]);
  });
  it("a trading day with nothing stored between two stored days is a gap, never a zero", () => {
    const r = flowRows([cash("2026-11-11", 100), cash("2026-11-13", 300)], "daily", "FII");
    assert.deepEqual(r.map((x) => [x.key, x.missing]), [["2026-11-11", false], ["2026-11-12", true], ["2026-11-13", false]]);
    const gap = r[1];
    assert.equal(gap.days, 0);
    assert.equal(gap.provisional, false);
    assert.equal(gap.label, "12 Nov");
  });
  it("weekends are not gaps (Friday to Monday)", () => {
    const r = flowRows([cash("2026-11-13", 1), cash("2026-11-16", 2)], "daily", "FII");
    assert.deepEqual(r.map((x) => x.key), ["2026-11-13", "2026-11-16"]);
  });
  it("days that only have futures positions are not cash days", () => {
    const r = flowRows([oi("2026-11-09", 5, 6), cash("2026-11-11", 100)], "daily", "FII");
    assert.deepEqual(r.map((x) => x.key), ["2026-11-11"]);
  });
  it("no stored cash figures at all gives no rows (the page says Data not available yet)", () => {
    assert.deepEqual(flowRows([], "daily", "FII"), []);
    assert.deepEqual(flowRows([oi("2026-11-09", 5, 6)], "weekly", "FII"), []);
  });
  it("keeps the newest 60", () => {
    const days: FiiDiiDayRow[] = [];
    for (let i = 0; i < 90; i++) {
      const d = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (wd !== 0 && wd !== 6) days.push(cash(d, i));
    }
    const r = flowRows(days, "daily", "FII");
    assert.ok(r.length <= LIMITS.daily);
    assert.equal(r[r.length - 1].key, days[days.length - 1].date);
  });
});

describe("weekly roll-up", () => {
  it("weeks start on Monday", () => {
    assert.equal(weekStart("2026-11-13"), "2026-11-09");
    assert.equal(weekStart("2026-11-15"), "2026-11-09");
    assert.equal(weekStart("2026-11-16"), "2026-11-16");
  });
  it("sums only the days we hold, and says how many of the week's trading days that is", () => {
    // 9, 11 and 13 Nov stored; 12 Nov is a trading day with nothing stored; 10 Nov is a holiday
    const r = flowRows([cash("2026-11-09", 100), cash("2026-11-11", 250), cash("2026-11-13", -50)], "weekly", "FII");
    assert.equal(r.length, 1);
    assert.equal(r[0].key, "2026-11-09");
    assert.equal(r[0].net, 300, "100 + 250 − 50, not an estimate for the missing 12 Nov");
    assert.equal(r[0].days, 3);
    assert.equal(r[0].expected, 4, "9, 11, 12 and 13 Nov are the week's trading days (10 Nov is a holiday)");
    assert.equal(r[0].partial, true);
    assert.equal(r[0].buy - r[0].sell, r[0].net);
  });
  it("a week with every trading day stored is not partial", () => {
    const r = flowRows(["2026-11-09", "2026-11-11", "2026-11-12", "2026-11-13"].map((d) => cash(d, 10)), "weekly", "FII");
    assert.equal(r[0].partial, false);
    assert.equal(r[0].days, 4);
    assert.equal(r[0].net, 40);
  });
  it("a week still in progress counts only the days it has had so far", () => {
    const r = flowRows([cash("2026-11-13", 1), cash("2026-11-16", 2), cash("2026-11-17", 3)], "weekly", "FII");
    const current = r[r.length - 1];
    assert.equal(current.key, "2026-11-16");
    assert.equal(current.expected, 2, "Mon 16 and Tue 17 Nov so far");
    assert.equal(current.partial, false);
    // the first week starts mid-week (history begins on Friday 13th): shown, and flagged as covering one day
    assert.equal(r[0].days, 1);
    assert.equal(r[0].partial, true);
  });
  it("one provisional day makes the week provisional", () => {
    const r = flowRows([cash("2026-11-11", 1, 0, { provisional: false }), cash("2026-11-12", 1)], "weekly", "FII");
    assert.equal(r[0].provisional, true);
  });
});

describe("monthly roll-up", () => {
  it("one row per month with its sums and coverage", () => {
    const r = flowRows([cash("2026-10-29", 100), cash("2026-10-30", 200), cash("2026-11-09", -40), cash("2026-11-11", 10)], "monthly", "FII");
    assert.deepEqual(r.map((x) => [x.key, x.net, x.days]), [["2026-10", 300, 2], ["2026-11", -30, 2]]);
    assert.equal(r[0].label, "Oct 26");
    assert.equal(r[0].partial, true, "two days of a month with about twenty trading days");
    assert.ok(r[0].expected > 15);
    // November so far, up to the latest day held (11 Nov): 2–6, the 8 Nov Muhurat session, 9 and 11 (10 is a holiday) = 8 trading days
    assert.equal(r[1].expected, 8);
    assert.equal(r[1].partial, true, "history starts late in the month, so only 2 of those 8 days are held");
  });
});

describe("FII index futures long % against short %", () => {
  it("long share is long over long plus short", () => {
    assert.ok(Math.abs((longPct(57226, 127639) as number) - 30.95) < 0.01);
    assert.equal(longPct(50, 50), 50);
    assert.equal(longPct(0, 0), null, "no contracts: no percentage");
  });
  it("daily: one row per stored day with its own long and short %", () => {
    const r = futuresRows([oi("2026-11-09", 25, 75), oi("2026-11-11", 57226, 127639)], "daily");
    assert.deepEqual(r.map((x) => [x.date, x.long, x.short]), [["2026-11-09", 25, 75], ["2026-11-11", 57226, 127639]]);
    assert.equal(r[0].longPct, 25);
    assert.equal(r[0].shortPct, 75);
  });
  it("weekly and monthly show the position on the last day held in the period, not a sum", () => {
    const days = [oi("2026-11-09", 100, 300), oi("2026-11-11", 200, 200), oi("2026-11-13", 300, 100)];
    const w = futuresRows(days, "weekly");
    assert.equal(w.length, 1);
    assert.equal(w[0].date, "2026-11-13");
    assert.deepEqual([w[0].long, w[0].short, w[0].longPct], [300, 100, 75]);
    assert.equal(futuresRows(days, "monthly")[0].date, "2026-11-13");
  });
  it("a day with no contracts at all is skipped, and a day with only cash has no futures row", () => {
    assert.deepEqual(futuresRows([oi("2026-11-09", 0, 0), cash("2026-11-11", 5)], "daily"), []);
  });
});

describe("what the header shows", () => {
  const days = [cash("2026-11-11", 12563.33), oi("2026-11-09", 1, 2), oi("2026-11-11", 3, 4), { ...cash("2026-11-12", 7), idxFut: null }];
  it("the newest day with cash figures, and separately the newest with futures positions (they can differ)", () => {
    assert.equal(latestCash(days)!.date, "2026-11-12");
    assert.equal(latestFutures(days)!.date, "2026-11-11");
  });
  it("nothing stored: nothing to show", () => {
    assert.equal(latestCash([]), null);
    assert.equal(latestFutures([oi("2026-11-09", 1, 2)])!.date, "2026-11-09");
    assert.equal(latestCash([oi("2026-11-09", 1, 2)]), null);
  });
  it("counts days of cash figures, for the 'history is building' note", () => {
    assert.equal(cashDayCount(days), 2);
    assert.equal(cashDayCount([]), 0);
  });
});
