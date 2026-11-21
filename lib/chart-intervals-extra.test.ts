import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyTick, barStart, intervalAvailability, intervalInfo, planRequests, requestCount, toChartSeconds, trimToSessions } from "./chart/intervals";
import type { Candle } from "./types";

/** IST wall-clock moment -> epoch ms */
const ist = (iso: string, hhmm: string) => Date.parse(`${iso}T${hhmm}:00+05:30`);
const hhmm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);
const startOf = (id: Parameters<typeof barStart>[0], clock: string) => hhmm(barStart(id, ist("2026-11-13", clock)));

/**
 * The five added intervals: 2, 3 and 10 minutes, 2 and 4 hours. On 14 Nov 2026 each was checked against the real feed for a stock and for
 * indices: all accepted, every bar start on 09:15 of the session, and every bar equal to the 1 minute bars added up. These tests keep our
 * own bar boundaries (used to move the last candle with the live price) the same as the feed's.
 */
describe("the added intervals: what the feed does, and what we do the same way", () => {
  it("2 minute bars start 09:15, 09:17 ...; 3 minute bars 09:15, 09:18 ...; 10 minute bars 09:15, 09:25 ...", () => {
    assert.equal(startOf("2m", "09:15"), "09:15");
    assert.equal(startOf("2m", "09:16"), "09:15");
    assert.equal(startOf("2m", "09:17"), "09:17");
    assert.equal(startOf("2m", "15:29"), "15:29");
    assert.equal(startOf("3m", "09:17"), "09:15");
    assert.equal(startOf("3m", "09:18"), "09:18");
    assert.equal(startOf("3m", "15:29"), "15:27"); // the feed's last 3 minute bar of the day starts at 15:27
    assert.equal(startOf("10m", "09:24"), "09:15");
    assert.equal(startOf("10m", "09:25"), "09:25");
    assert.equal(startOf("10m", "15:29"), "15:25"); // and its last 10 minute bar at 15:25
  });
  it("2 hour bars start 09:15, 11:15, 13:15 and 15:15 (the last is only 15 minutes long), as the feed's do", () => {
    assert.equal(startOf("2h", "09:15"), "09:15");
    assert.equal(startOf("2h", "11:14"), "09:15");
    assert.equal(startOf("2h", "11:15"), "11:15");
    assert.equal(startOf("2h", "13:14"), "11:15");
    assert.equal(startOf("2h", "13:15"), "13:15");
    assert.equal(startOf("2h", "15:15"), "15:15");
    assert.equal(startOf("2h", "15:29"), "15:15");
  });
  it("4 hour bars start 09:15 and 13:15 (the second runs to the close), as the feed's do", () => {
    assert.equal(startOf("4h", "09:15"), "09:15");
    assert.equal(startOf("4h", "13:14"), "09:15");
    assert.equal(startOf("4h", "13:15"), "13:15");
    assert.equal(startOf("4h", "15:29"), "13:15");
  });
  it("the number of bars in a full session matches the feed: 188, 125, 38, 4 and 2", () => {
    const bars = (id: Parameters<typeof barStart>[0]) => {
      const starts = new Set<number>();
      for (let m = 9 * 60 + 15; m < 15 * 60 + 30; m++) starts.add(barStart(id, ist("2026-11-13", `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`)));
      return starts.size;
    };
    assert.deepEqual(["2m", "3m", "10m", "2h", "4h"].map((id) => bars(id as never)), [188, 125, 38, 4, 2]);
  });
  it("each is fetched with the unit and number the feed names, in windows inside its measured span", () => {
    assert.deepEqual(["2m", "3m", "10m", "2h", "4h"].map((id) => `${intervalInfo(id as never).unit}/${intervalInfo(id as never).n}`), ["minutes/2", "minutes/3", "minutes/10", "hours/2", "hours/4"]);
    // minute bars: at most 30 days a window (31 measured), 2 and 4 hour bars: at most 90 (the feed rejected 93)
    for (const w of planRequests("3m", "2026-10-15", "2026-11-13")) assert.ok((Date.parse(w.to) - Date.parse(w.from)) / 864e5 + 1 <= 30);
    assert.equal(planRequests("2h", "2025-11-13", "2026-11-13").length, 5);
    assert.equal(requestCount("4h", "1Y", "2026-11-13"), 5);
    assert.equal(requestCount("2m", "5D", "2026-11-13"), 1);
  });
  it("the live price moves the last candle of each new interval, and starts a new one in the next period", () => {
    const T = (clock: string) => toChartSeconds(ist("2026-11-13", clock));
    const bar = (clock: string, c: number): Candle => ({ t: T(clock), open: c, high: c + 1, low: c - 1, close: c, volume: 10 });
    assert.equal(applyTick([bar("11:15", 100)], 103, ist("2026-11-13", "12:40"), "2h", true)[0].close, 103);
    const next = applyTick([bar("11:15", 100)], 103, ist("2026-11-13", "13:16"), "2h", true);
    assert.deepEqual([next.length, hhmm(next[1].t as number), next[1].open, next[1].volume], [2, "13:15", 103, 0]);
    assert.equal(hhmm(applyTick([bar("09:15", 100)], 101, ist("2026-11-13", "13:20"), "4h", true)[1].t as number), "13:15");
    assert.equal(hhmm(applyTick([bar("09:15", 100)], 101, ist("2026-11-13", "09:19"), "3m", true)[1].t as number), "09:18");
  });
  it("they trim to whole sessions like the others", () => {
    const t = (iso: string, c: string) => ({ t: toChartSeconds(ist(iso, c)) });
    const bars = [t("2026-11-12", "09:15"), t("2026-11-12", "13:15"), t("2026-11-13", "09:15"), t("2026-11-13", "13:15")];
    assert.equal(trimToSessions(bars, 1).length, 2);
  });
  it("they need live data like the other intraday intervals; crypto is daily only", () => {
    for (const id of ["2m", "3m", "10m", "2h", "4h"]) {
      assert.equal(intervalAvailability("live").find((i) => i.id === id)!.reason, null);
      assert.ok(intervalAvailability("simulated").find((i) => i.id === id)!.reason);
      assert.ok(intervalAvailability("crypto").find((i) => i.id === id)!.reason);
    }
  });
});
