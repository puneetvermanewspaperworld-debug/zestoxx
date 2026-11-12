import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RETRY_DELAYS_MS } from "../nse/http";
import { backfillIndexClose, indexCloseUrl, ingestIndexLatest, targetDay, type Fetcher, type IndexIngestDeps, type IndexIngestStore } from "./ingest";
import type { IndexDayRow } from "./types";

/* ---------------------------------------------------------------- test doubles --- */

/** Keyed by (index, date), as the table is, so saving a day twice replaces rather than duplicates. */
class MemoryStore implements IndexIngestStore {
  rows = new Map<string, IndexDayRow>();
  saves: string[] = [];
  async hasDate(date: string) {
    return [...this.rows.values()].some((r) => r.date === date);
  }
  async saveDay(date: string, rows: IndexDayRow[], fetchedAt?: Date) {
    void fetchedAt;
    this.saves.push(date);
    for (const r of rows) this.rows.set(`${r.indexName}|${date}`, { ...r, date });
  }
}

const HEADER = "Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value,Points Change,Change(%),Volume,Turnover (Rs. Cr.),P/E,P/B,Div Yield";
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const csv = (iso: string, nifty = 25299.35, pe = 20.62) =>
  [HEADER, `Nifty 50,${ddmmyyyy(iso)},1,2,3,${nifty},4,.5,6,7,${pe},3.1,1.39`, `Nifty Bank,${ddmmyyyy(iso)},1,2,3,61518.5,4,.5,6,7,13.6,1.85,1.02`, `India VIX,${ddmmyyyy(iso)},1,2,3,17.56,4,.5,0,0,-,-,-`].join("\n") + "\n";

type Reply = { status: number; body: string } | Error;
/** A scripted NSE: each URL replays its replies in order and repeats the last one. Anything unscripted answers 404. */
function nse(script: Record<string, Reply[]>) {
  const calls: string[] = [];
  const left = new Map(Object.entries(script).map(([u, r]) => [u, [...r]]));
  const fn: Fetcher = async (url) => {
    calls.push(url);
    const q = left.get(url);
    if (!q) return { status: 404, body: "<html>Not Found</html>" };
    const r = q.length > 1 ? (q.shift() as Reply) : q[0];
    if (r instanceof Error) throw r;
    return r;
  };
  return { fn, calls };
}

function deps(store: MemoryStore, fetcher: Fetcher, now: string) {
  const sleeps: number[] = [];
  const logs: { level: string; message: string; data?: Record<string, unknown> }[] = [];
  const d: IndexIngestDeps = { fetcher, store, now: new Date(now), sleep: async (ms) => void sleeps.push(ms), log: (level, message, data) => void logs.push({ level, message, data }) };
  return { d, sleeps, logs };
}

const ok = (body: string): Reply => ({ status: 200, body });
// Thu 12 Nov 2026, 19:30 IST: the cron's first run of the day, after the 18:00 publication
const EVENING = "2026-11-12T19:30:00+05:30";

describe("which day's file", () => {
  it("after 18:00 IST on a trading day: that day", () => assert.equal(targetDay(new Date("2026-11-12T18:00:00+05:30")), "2026-11-12"));
  it("before 18:00: the day before", () => assert.equal(targetDay(new Date("2026-11-12T17:59:00+05:30")), "2026-11-11"));
  it("a Saturday evening: Friday", () => assert.equal(targetDay(new Date("2026-11-14T20:00:00+05:30")), "2026-11-13"));
  it("the url is the dated file", () => assert.equal(indexCloseUrl("2026-11-12"), "https://nsearchives.nseindia.com/content/indices/ind_close_all_12112026.csv"));
});

describe("the daily run", () => {
  it("stores every index in the file for the day", async () => {
    const store = new MemoryStore();
    const s = nse({ [indexCloseUrl("2026-11-12")]: [ok(csv("2026-11-12"))] });
    const { d, logs } = deps(store, s.fn, EVENING);
    const r = await ingestIndexLatest(d);
    assert.deepEqual(r, { status: "stored", date: "2026-11-12", indices: 3 });
    assert.equal(store.rows.get("Nifty 50|2026-11-12")!.pe, 20.62);
    assert.equal(store.rows.get("Nifty 50|2026-11-12")!.close, 25299.35);
    assert.equal(store.rows.get("India VIX|2026-11-12")!.pe, null, 'a "-" is stored as no value');
    assert.equal(logs.filter((l) => l.level === "error").length, 0);
  });

  it("fetches the file at most once a day: the second run does nothing", async () => {
    const store = new MemoryStore();
    const s = nse({ [indexCloseUrl("2026-11-12")]: [ok(csv("2026-11-12"))] });
    await ingestIndexLatest(deps(store, s.fn, EVENING).d);
    const again = await ingestIndexLatest(deps(store, s.fn, "2026-11-12T21:00:00+05:30").d);
    assert.equal(s.calls.length, 1, "one request in total");
    assert.equal(again.status, "already-stored");
    assert.equal(store.saves.length, 1);
  });

  it("a 404 is normal: no retry, no error; the next run tries again", async () => {
    const store = new MemoryStore();
    const s = nse({});
    const a = deps(store, s.fn, EVENING);
    const r = await ingestIndexLatest(a.d);
    assert.equal(r.status, "not-published");
    assert.equal(s.calls.length, 1);
    assert.equal(a.sleeps.length, 0);
    assert.equal(a.logs.filter((l) => l.level === "warn" || l.level === "error").length, 0);
    const s2 = nse({ [indexCloseUrl("2026-11-12")]: [ok(csv("2026-11-12"))] });
    assert.equal((await ingestIndexLatest(deps(store, s2.fn, "2026-11-12T21:00:00+05:30").d)).status, "stored");
  });

  it("retries a failure with a delay and then succeeds, logging each failed attempt", async () => {
    const store = new MemoryStore();
    const s = nse({ [indexCloseUrl("2026-11-12")]: [new Error("socket hang up"), { status: 503, body: "busy" }, ok(csv("2026-11-12"))] });
    const { d, sleeps, logs } = deps(store, s.fn, EVENING);
    const r = await ingestIndexLatest(d);
    assert.equal(r.status, "stored");
    assert.deepEqual(sleeps, RETRY_DELAYS_MS);
    assert.equal(s.calls.length, 3);
    assert.equal(logs.filter((l) => l.level === "warn").length, 2);
  });

  it("gives up after the last attempt, logs an error, and stores nothing", async () => {
    const store = new MemoryStore();
    const s = nse({ [indexCloseUrl("2026-11-12")]: [{ status: 403, body: "Access Denied" }] });
    const { d, logs } = deps(store, s.fn, EVENING);
    const r = await ingestIndexLatest(d);
    assert.equal(r.status, "failed");
    assert.equal(s.calls.length, RETRY_DELAYS_MS.length + 1);
    assert.ok(logs.some((l) => l.level === "error" && /index closing file/.test(l.message)));
    assert.equal(store.rows.size, 0);
  });

  it("a block page is retried as unexpected content and never stored", async () => {
    const store = new MemoryStore();
    const s = nse({ [indexCloseUrl("2026-11-12")]: [ok("<html>Please enable JavaScript</html>")] });
    const { d, logs } = deps(store, s.fn, EVENING);
    assert.equal((await ingestIndexLatest(d)).status, "failed");
    assert.ok(logs.some((l) => /unexpected content/.test(String(l.data?.reason))));
    assert.equal(store.rows.size, 0);
  });

  it("a file for a different day than asked is rejected", async () => {
    const store = new MemoryStore();
    const s = nse({ [indexCloseUrl("2026-11-12")]: [ok(csv("2026-11-11"))] });
    assert.equal((await ingestIndexLatest(deps(store, s.fn, EVENING).d)).status, "failed");
    assert.equal(store.rows.size, 0);
  });

  it("saving a day twice keeps one row per index per date (upsert, not duplicate)", async () => {
    const store = new MemoryStore();
    await store.saveDay("2026-11-12", [{ indexName: "Nifty 50", date: "2026-11-12", close: 1, pe: 1, pb: 1, divYield: 1 }], new Date());
    await store.saveDay("2026-11-12", [{ indexName: "Nifty 50", date: "2026-11-12", close: 2, pe: 2, pb: 2, divYield: 2 }], new Date());
    assert.equal(store.rows.size, 1);
    assert.equal(store.rows.get("Nifty 50|2026-11-12")!.pe, 2);
  });
});

describe("backfill of earlier days", () => {
  it("fills weekdays that have a file; a 404 (holiday) is normal; weekends are skipped", async () => {
    const store = new MemoryStore();
    // today Thu 12 Nov: files for 12, 11 and 9 Nov; 10 Nov is a holiday and 6 Nov has none
    const s = nse({ [indexCloseUrl("2026-11-12")]: [ok(csv("2026-11-12"))], [indexCloseUrl("2026-11-11")]: [ok(csv("2026-11-11", 25255))], [indexCloseUrl("2026-11-09")]: [ok(csv("2026-11-09", 25100))] });
    const { d, logs } = deps(store, s.fn, EVENING);
    const r = await backfillIndexClose(d, { days: 7, gapMs: 0 });
    assert.deepEqual(r.stored.sort(), ["2026-11-09", "2026-11-11", "2026-11-12"]);
    assert.deepEqual(r.none.sort(), ["2026-11-06", "2026-11-10"]);
    assert.deepEqual(r.failed, []);
    assert.equal(logs.filter((l) => l.level === "error").length, 0);
    assert.ok(!s.calls.some((u) => /ind_close_all_(07|08|14|15)112026/.test(u)), "no request for a Saturday or Sunday");
  });

  it("skips days already stored, is bounded, and pauses between requests", async () => {
    const store = new MemoryStore();
    await store.saveDay("2026-11-12", [{ indexName: "Nifty 50", date: "2026-11-12", close: 1, pe: 1, pb: 1, divYield: 1 }], new Date());
    const files: Record<string, Reply[]> = {};
    for (const day of ["2026-11-11", "2026-11-09", "2026-11-06", "2026-11-05", "2026-11-04", "2026-11-03", "2026-11-02"]) files[indexCloseUrl(day)] = [ok(csv(day))];
    const s = nse(files);
    const { d, sleeps } = deps(store, s.fn, EVENING);
    const r = await backfillIndexClose(d, { days: 14, maxFetches: 3, gapMs: 500 });
    assert.equal(r.skipped, 1);
    assert.equal(s.calls.length, 3);
    assert.equal(r.more, true);
    assert.deepEqual(sleeps, [500, 500]);
    const s2 = nse(files);
    await backfillIndexClose(deps(store, s2.fn, EVENING).d, { days: 14, maxFetches: 40, gapMs: 0 });
    assert.ok(!s2.calls.includes(indexCloseUrl("2026-11-11")), "a stored day is not fetched again");
  });

  it("goes back about a year when asked: 400 days is a bounded number of weekday requests", async () => {
    const store = new MemoryStore();
    const s = nse({});
    const r = await backfillIndexClose(deps(store, s.fn, EVENING).d, { days: 400, maxFetches: 1000, gapMs: 0 });
    assert.ok(r.none.length > 250 && r.none.length < 300, `weekdays in 400 days: ${r.none.length}`);
    assert.equal(r.more, false);
  });

  it("a failing file is reported and does not stop the rest", async () => {
    const store = new MemoryStore();
    const s = nse({ [indexCloseUrl("2026-11-12")]: [{ status: 500, body: "oops" }], [indexCloseUrl("2026-11-11")]: [ok(csv("2026-11-11"))] });
    const r = await backfillIndexClose(deps(store, s.fn, EVENING).d, { days: 2, gapMs: 0 });
    assert.equal(r.failed.length, 1);
    assert.deepEqual(r.stored, ["2026-11-11"]);
  });
});
