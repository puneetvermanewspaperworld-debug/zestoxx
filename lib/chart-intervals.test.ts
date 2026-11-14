import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_INTERVAL, DEFAULT_RANGE, INTERVALS, MAX_REQUESTS, RANGES, VALID_INTERVALS, addDays, applyTick, barStart, intervalInfo, isIntraday, istDate, mergeBars, parseUpstoxRows,
  pickInterval, pickRange, planRequests, rangeWindow, requestCount, rowsToCandles, selectionFrom, toChartSeconds, trimToSessions, type RangeId,
} from "./chart/intervals";
import { DAY, timeToLogical, logicalToTime, makeViewport, pixelToAnchor, anchorToPixel } from "./chart/coords";
import type { Candle } from "./types";

/** IST wall-clock moment -> epoch ms */
const ist = (iso: string, hhmm = "00:00") => Date.parse(`${iso}T${hhmm}:00+05:30`);

describe("intervals and ranges: only what has real data", () => {
  it("the intervals are 1m, 5m, 15m, 30m, 1h, 1D, 1W, 1M, with the limits that were measured", () => {
    assert.deepEqual(INTERVALS.map((i) => i.id), ["1m", "5m", "15m", "30m", "1h", "1D", "1W", "1M"]);
    assert.deepEqual(INTERVALS.map((i) => i.maxSpanDays), [30, 30, 30, 90, 90, 3600, null, null]); // measured: 32, 32, 32, 93, 93, 3650 days ok
    assert.deepEqual(INTERVALS.map((i) => i.intraday), [true, true, true, true, true, false, false, false]);
    assert.ok(INTERVALS.filter((i) => i.intraday).every((i) => i.earliest === "2022-01-03"));
    assert.ok(INTERVALS.filter((i) => !i.intraday).every((i) => i.earliest === "2000-01-01"));
  });
  it("every range has valid intervals, a default among them, and every interval a default range that allows it", () => {
    for (const r of RANGES) {
      assert.ok(VALID_INTERVALS[r.id].length > 0, r.id);
      assert.ok(VALID_INTERVALS[r.id].includes(DEFAULT_INTERVAL[r.id]), r.id);
    }
    for (const i of INTERVALS) assert.ok(VALID_INTERVALS[DEFAULT_RANGE[i.id]].includes(i.id), i.id);
  });
  it("no offered pairing needs more requests than the cap, and none reaches back before the data starts", () => {
    const today = "2026-11-13";
    for (const r of RANGES) {
      for (const i of VALID_INTERVALS[r.id]) {
        assert.ok(requestCount(i, r.id, today) <= MAX_REQUESTS, `${r.id}/${i}: ${requestCount(i, r.id, today)}`);
        assert.ok(rangeWindow(r.id, i, today).from >= intervalInfo(i).earliest, `${r.id}/${i}`);
      }
    }
  });
  it("intraday intervals are not offered for long ranges that the data cannot fill", () => {
    for (const r of ["5Y", "All"] as RangeId[]) assert.ok(VALID_INTERVALS[r].every((i) => !isIntraday(i)), r);
    assert.ok(!VALID_INTERVALS["1Y"].some((i) => ["1m", "5m", "15m", "30m"].includes(i)));
  });
  it("picking an interval keeps the range when it suits, otherwise uses that interval's usual range", () => {
    assert.deepEqual(pickInterval({ interval: "1D", range: "1Y" }, "1W"), { interval: "1W", range: "1Y" });
    assert.deepEqual(pickInterval({ interval: "1D", range: "1Y" }, "5m"), { interval: "5m", range: "1D" });
    assert.deepEqual(pickInterval({ interval: "5m", range: "1D" }, "1M"), { interval: "1M", range: "All" });
  });
  it("picking a range keeps the interval when it suits, otherwise uses that range's usual interval", () => {
    assert.deepEqual(pickRange({ interval: "1D", range: "1Y" }, "5Y"), { interval: "1D", range: "5Y" });
    assert.deepEqual(pickRange({ interval: "1D", range: "1Y" }, "1D"), { interval: "5m", range: "1D" });
    assert.deepEqual(pickRange({ interval: "1h", range: "1M" }, "All"), { interval: "1M", range: "All" });
  });
  it("a stored selection that is unknown or does not go together is made valid, never kept", () => {
    assert.deepEqual(selectionFrom(null, null), { interval: "1D", range: "1Y" });
    assert.deepEqual(selectionFrom("1D", "1D"), { interval: "1D", range: "1Y" });
    assert.deepEqual(selectionFrom("2m", "zz"), { interval: "1D", range: "1Y" });
    assert.deepEqual(selectionFrom("15m", null), { interval: "15m", range: "5D" });
    assert.deepEqual(selectionFrom(null, "3M"), { interval: "1D", range: "3M" });
    assert.deepEqual(selectionFrom("1m", "All"), { interval: "1m", range: "1D" });
  });
});

describe("planning the requests", () => {
  const covers = (reqs: { from: string; to: string }[], from: string, to: string) => {
    assert.equal(reqs[0].from, from);
    assert.equal(reqs[reqs.length - 1].to, to);
    for (let i = 1; i < reqs.length; i++) assert.equal(reqs[i].from, addDays(reqs[i - 1].to, 1), "no gap and no overlap");
  };
  it("a minute interval is cut into windows of at most 30 days, oldest first, with no gap and no overlap", () => {
    const r = planRequests("15m", "2026-08-15", "2026-11-13");
    covers(r, "2026-08-15", "2026-11-13");
    assert.equal(r.length, 4);
    for (const w of r) assert.ok((Date.parse(w.to) - Date.parse(w.from)) / 86_400_000 + 1 <= 30);
  });
  it("30 minute and hourly use quarter-sized windows, daily ten-year ones", () => {
    assert.equal(planRequests("1h", "2025-11-13", "2026-11-13").length, 5);
    assert.equal(planRequests("30m", "2026-05-13", "2026-11-13").length, 3);
    assert.equal(planRequests("1D", "2000-01-01", "2026-11-13").length, 3);
  });
  it("weekly and monthly are one request however far back", () => {
    assert.deepEqual(planRequests("1W", "2000-01-01", "2026-11-13"), [{ from: "2000-01-01", to: "2026-11-13" }]);
    assert.equal(planRequests("1M", "2000-01-01", "2026-11-13").length, 1);
  });
  it("a short range is one request; an empty or backwards range is none", () => {
    assert.deepEqual(planRequests("5m", "2026-11-07", "2026-11-13"), [{ from: "2026-11-07", to: "2026-11-13" }]);
    assert.deepEqual(planRequests("5m", "2026-11-13", "2026-11-13"), [{ from: "2026-11-13", to: "2026-11-13" }]);
    assert.deepEqual(planRequests("5m", "2026-11-14", "2026-11-13"), []);
  });
  it("the window of a range ends today and never starts before the interval's first data", () => {
    assert.deepEqual(rangeWindow("1M", "1D", "2026-11-13"), { from: addDays("2026-11-13", -31), to: "2026-11-13" });
    assert.equal(rangeWindow("All", "1D", "2026-11-13").from, "2000-01-01");
    assert.equal(rangeWindow("5Y", "1D", "2026-11-13").from, addDays("2026-11-13", -1827));
    assert.equal(rangeWindow("1D", "5m", "2026-11-13").from, "2026-11-07"); // looks back far enough to find the last session over a weekend
  });
  it("addDays handles month and year ends", () => {
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  });
  it("trimming to sessions keeps the bars of the latest N trading days", () => {
    const bar = (iso: string, hh: string): { t: number } => ({ t: toChartSeconds(ist(iso, hh)) });
    const bars = [bar("2026-11-09", "09:15"), bar("2026-11-09", "09:20"), bar("2026-11-10", "09:15"), bar("2026-11-12", "09:15"), bar("2026-11-12", "09:20"), bar("2026-11-13", "09:15")];
    assert.equal(trimToSessions(bars, 1).length, 1);
    assert.equal(trimToSessions(bars, 2).length, 3); // 12 Nov and 13 Nov
    assert.equal(trimToSessions(bars, 9).length, 6);
    assert.deepEqual(trimToSessions([], 3), []);
  });
});

describe("times on the Indian clock", () => {
  it("a bar's time is its IST wall-clock time as if UTC: 09:15 IST is 09:15 on the chart", () => {
    const t = toChartSeconds(ist("2026-11-13", "09:15"));
    assert.equal(new Date(t * 1000).toISOString(), "2026-11-13T09:15:00.000Z");
  });
  it("a daily bar (00:00 IST) is at midnight of its own date, the same time the app has always given daily bars", () => {
    const t = toChartSeconds(ist("2026-11-13"));
    assert.equal(t % 86_400, 0);
    assert.equal(new Date(t * 1000).toISOString().slice(0, 10), "2026-11-13");
  });
  it("today's date is the Indian date, even when it is still yesterday in UTC", () => {
    assert.equal(istDate(ist("2026-11-13", "02:00")), "2026-11-13"); // 20:30 on the 12th in UTC
    assert.equal(istDate(ist("2026-11-13", "23:59")), "2026-11-13");
  });
});

describe("reading the feed's rows", () => {
  const row = (iso: string, o: number, h: number, l: number, c: number, v: number | null = 100, oi = 0) => [iso, o, h, l, c, v, oi];
  it("turns newest-first rows into oldest-first bars with the time in milliseconds", () => {
    const r = parseUpstoxRows([row("2026-11-13T09:20:00+05:30", 2, 3, 1, 2.5), row("2026-11-13T09:15:00+05:30", 1, 2, 0.5, 1.5)]);
    assert.deepEqual(r.map((x) => x[0]), [ist("2026-11-13", "09:15"), ist("2026-11-13", "09:20")]);
    assert.deepEqual(r[0].slice(1), [1, 2, 0.5, 1.5, 100]);
  });
  it("drops anything that is not a real bar: it is never repaired", () => {
    const r = parseUpstoxRows([
      row("2026-11-13T09:15:00+05:30", 1, 2, 0.5, 1.5),
      row("garbage", 1, 2, 0.5, 1.5),
      row("2026-11-13T09:20:00+05:30", 0, 2, 0.5, 1.5), // a zero price
      row("2026-11-13T09:25:00+05:30", 1, 0.4, 0.5, 1.5), // high below low
      ["2026-11-13T09:30:00+05:30", "x", 2, 1, 1],
      [1, 2, 3],
      null,
    ]);
    assert.equal(r.length, 1);
    assert.deepEqual(parseUpstoxRows("nope"), []);
  });
  it("volume that is missing or zero stays zero: never made up", () => {
    assert.equal(parseUpstoxRows([row("2026-11-13T09:15:00+05:30", 1, 2, 0.5, 1.5, null)])[0][5], 0);
    assert.equal(parseUpstoxRows([row("2026-11-13T09:15:00+05:30", 1, 2, 0.5, 1.5, 0)])[0][5], 0);
  });
  it("a repeated time keeps one bar", () => {
    assert.equal(parseUpstoxRows([row("2026-11-13T09:15:00+05:30", 1, 2, 0.5, 1.5), row("2026-11-13T09:15:00+05:30", 1, 2, 0.5, 1.6)]).length, 1);
  });
  it("rows become candles on the chart's clock", () => {
    const c = rowsToCandles(parseUpstoxRows([row("2026-11-13T09:15:00+05:30", 1, 2, 0.5, 1.5, 7)]));
    assert.deepEqual(c, [{ t: toChartSeconds(ist("2026-11-13", "09:15")), open: 1, high: 2, low: 0.5, close: 1.5, volume: 7 }]);
  });
  it("merging puts two sets of bars in time order, the second winning where they overlap", () => {
    const a = [{ t: 1, v: "a1" }, { t: 2, v: "a2" }];
    const b = [{ t: 2, v: "b2" }, { t: 3, v: "b3" }];
    assert.deepEqual(mergeBars(a, b), [{ t: 1, v: "a1" }, { t: 2, v: "b2" }, { t: 3, v: "b3" }]);
  });
});

describe("the bar a moment belongs to", () => {
  const at = (hhmm: string, iso = "2026-11-13") => ist(iso, hhmm);
  const hhmm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);
  it("5 minute bars start on 09:15, 09:20 ...", () => {
    assert.equal(hhmm(barStart("5m", at("09:15"))), "09:15");
    assert.equal(hhmm(barStart("5m", at("09:19"))), "09:15");
    assert.equal(hhmm(barStart("5m", at("10:02"))), "10:00");
    assert.equal(hhmm(barStart("1m", at("11:47"))), "11:47");
  });
  it("hourly bars start at 09:15, 10:15 ... 15:15, as the feed's do", () => {
    assert.equal(hhmm(barStart("1h", at("09:15"))), "09:15");
    assert.equal(hhmm(barStart("1h", at("10:14"))), "09:15");
    assert.equal(hhmm(barStart("1h", at("10:15"))), "10:15");
    assert.equal(hhmm(barStart("1h", at("15:29"))), "15:15");
  });
  it("30 and 15 minute bars line up on the quarter hours from 09:15", () => {
    assert.equal(hhmm(barStart("30m", at("09:44"))), "09:15");
    assert.equal(hhmm(barStart("30m", at("09:45"))), "09:45");
    assert.equal(hhmm(barStart("15m", at("12:31"))), "12:30");
  });
  it("a daily bar is its date, a weekly bar its Monday, a monthly bar the 1st", () => {
    assert.equal(new Date(barStart("1D", at("11:00")) * 1000).toISOString().slice(0, 10), "2026-11-13");
    assert.equal(new Date(barStart("1W", at("11:00")) * 1000).toISOString().slice(0, 10), "2026-11-09"); // Fri 13 Nov -> Mon 9 Nov
    assert.equal(new Date(barStart("1W", at("11:00", "2026-11-15")) * 1000).toISOString().slice(0, 10), "2026-11-09"); // a Sunday belongs to the week before
    assert.equal(new Date(barStart("1M", at("11:00")) * 1000).toISOString().slice(0, 10), "2026-11-01");
  });
});

describe("updating the last candle from the live price", () => {
  const T = (hhmm: string) => toChartSeconds(ist("2026-11-13", hhmm));
  const bar = (hhmm: string, o: number, h: number, l: number, c: number, v = 500): Candle => ({ t: T(hhmm), open: o, high: h, low: l, close: c, volume: v });
  const bars = [bar("09:15", 100, 102, 99, 101), bar("09:20", 101, 103, 100, 102)];
  it("a price inside the last bar's period moves its close and widens its high and low; the open and the volume stay", () => {
    const r = applyTick(bars, 104, ist("2026-11-13", "09:23"), "5m", true);
    assert.deepEqual(r[1], { t: T("09:20"), open: 101, high: 104, low: 100, close: 104, volume: 500 });
    const lower = applyTick(bars, 98.5, ist("2026-11-13", "09:24"), "5m", true);
    assert.deepEqual([lower[1].high, lower[1].low, lower[1].close], [103, 98.5, 98.5]);
    assert.equal(bars[1].close, 102); // the input is untouched
  });
  it("a price inside the range changes only the close", () => {
    const r = applyTick(bars, 101.5, ist("2026-11-13", "09:21"), "5m", true);
    assert.deepEqual([r[1].high, r[1].low, r[1].close], [103, 100, 101.5]);
  });
  it("a price in a later period starts a new bar that opens at that price, with no volume (none was given)", () => {
    const r = applyTick(bars, 105, ist("2026-11-13", "09:26"), "5m", true);
    assert.equal(r.length, 3);
    assert.deepEqual(r[2], { t: T("09:25"), open: 105, high: 105, low: 105, close: 105, volume: 0 });
    assert.deepEqual(r[1], bars[1]); // the finished bar is left as it was
  });
  it("does nothing when the market is closed, the price is not real, or there are no bars", () => {
    assert.equal(applyTick(bars, 105, ist("2026-11-13", "09:26"), "5m", false), bars);
    for (const p of [0, -1, NaN, Infinity]) assert.equal(applyTick(bars, p, ist("2026-11-13", "09:21"), "5m", true), bars);
    assert.deepEqual(applyTick([], 105, ist("2026-11-13", "09:21"), "5m", true), []);
  });
  it("works for daily bars: today's bar moves, a new day starts a new bar", () => {
    const d = (iso: string, c: number): Candle => ({ t: toChartSeconds(ist(iso)), open: c, high: c + 1, low: c - 1, close: c, volume: 9 });
    const daily = [d("2026-11-12", 100), d("2026-11-13", 101)];
    assert.equal(applyTick(daily, 103, ist("2026-11-13", "10:00"), "1D", true)[1].close, 103);
    const next = applyTick(daily, 103, ist("2026-11-16", "10:00"), "1D", true);
    assert.equal(next.length, 3);
    assert.equal(new Date((next[2].t as number) * 1000).toISOString().slice(0, 10), "2026-11-16");
  });
});

describe("a drawing made on the daily chart lands on the right day on an intraday chart", () => {
  // three sessions of hourly bars: 11, 12, 13 Nov 2026 (09:15 ... 15:15), and the matching daily bars
  const sessions = ["2026-11-11", "2026-11-12", "2026-11-13"];
  const hourly = sessions.flatMap((d) => ["09:15", "10:15", "11:15", "12:15", "13:15", "14:15", "15:15"].map((h) => toChartSeconds(ist(d, h))));
  const daily = sessions.map((d) => toChartSeconds(ist(d)));
  const dayOf = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

  it("a daily bar's time becomes the first bar of that day, never a position in the day before", () => {
    for (let k = 0; k < sessions.length; k++) {
      const l = timeToLogical(hourly, daily[k]) as number;
      assert.equal(l, k * 7, sessions[k]); // the day's first hourly bar
      assert.equal(dayOf(hourly[l]), sessions[k]);
    }
  });
  it("on the daily chart it is where it was drawn (the bar itself)", () => {
    daily.forEach((t, k) => assert.equal(timeToLogical(daily, t), k));
  });
  it("drawn on the daily chart and shown on an hourly one, the same (time, price) gives the same price and the right day", () => {
    const vp = makeViewport({ times: hourly, width: 600, height: 300, logicalToX: (l) => 10 + l * 20, xToLogical: (x) => (x - 10) / 20, priceToY: (p) => 300 - p, yToPrice: (y) => 300 - y });
    const anchor = { time: daily[1], price: 120 }; // made on the daily chart, on 12 Nov
    const px = anchorToPixel(vp, anchor)!;
    assert.equal(px.y, 180);
    const back = pixelToAnchor(vp, px.x, px.y)!;
    assert.equal(back.price, 120);
    assert.equal(dayOf(back.time), "2026-11-12");
  });
  it("so does a time part way through the bar's day before the session starts, which is what clicking near a daily bar gives", () => {
    for (let k = 0; k < sessions.length; k++) {
      for (const offset of [60, 3 * 3600, 6.5 * 3600, 9 * 3600]) assert.equal(timeToLogical(hourly, daily[k] + offset), k * 7, `${sessions[k]} +${offset}s`);
    }
    // just left of the bar's centre belongs to the day before: it stays in the gap there
    const left = timeToLogical(hourly, daily[1] - 3600) as number;
    assert.ok(left > 6 && left < 7);
  });
  it("a day with no bars (a weekend) is still placed by its time, not pulled onto a trading day", () => {
    const sat = toChartSeconds(ist("2026-11-14"));
    const monBars = [toChartSeconds(ist("2026-11-13", "15:15")), toChartSeconds(ist("2026-11-16", "09:15"))];
    const l = timeToLogical(monBars, sat) as number;
    assert.ok(l > 0 && l < 1);
  });
  it("a time that is not a day boundary is placed by interpolation as before", () => {
    const l = timeToLogical(hourly, hourly[3] + 1800) as number;
    assert.ok(Math.abs(l - 3.5) < 1e-9);
    assert.equal(logicalToTime(hourly, 3.5), hourly[3] + 1800);
    assert.equal(DAY, 86_400);
  });
});

import { DAILY_ONLY, NEEDS_LIVE, intervalAvailability } from "./chart/intervals";

describe("which intervals can be chosen", () => {
  it("live data: all eight", () => assert.ok(intervalAvailability("live").every((i) => i.reason === null)));
  it("crypto is daily only, with the reason", () => {
    const a = intervalAvailability("crypto");
    assert.deepEqual(a.filter((i) => i.reason === null).map((i) => i.id), ["1D"]);
    assert.ok(a.filter((i) => i.id !== "1D").every((i) => i.reason === DAILY_ONLY));
  });
  it("simulated data has no intraday, and says it needs live data", () => {
    const a = intervalAvailability("simulated");
    assert.deepEqual(a.filter((i) => i.reason === null).map((i) => i.id), ["1D", "1W", "1M"]);
    assert.ok(a.filter((i) => i.reason).every((i) => i.reason === NEEDS_LIVE));
  });
});
