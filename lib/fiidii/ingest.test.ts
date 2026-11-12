import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CASH_URL, RETRY_DELAYS_MS, backfillOi, ingestLatest, oiUrl, targetDay, type DayPatch, type Fetcher, type FiiDiiStore, type IngestDeps, type StoredDay } from "./ingest";
import type { FiiDiiDayRow } from "./types";

/* ---------------------------------------------------------------- test doubles --- */

class MemoryStore implements FiiDiiStore {
  rows = new Map<string, StoredDay>();
  writes: string[] = [];
  async get(date: string) {
    return this.rows.get(date) ?? null;
  }
  async upsert(date: string, p: DayPatch) {
    this.writes.push(date);
    const r = this.rows.get(date) ?? { date, cash: null, idxFut: null, provisional: true, cashFetched: false, oiFetched: false };
    if (p.cash) r.cash = p.cash;
    if (p.idxFut) r.idxFut = p.idxFut;
    if (p.provisional !== undefined) r.provisional = p.provisional;
    if (p.cashFetchedAt) r.cashFetched = true;
    if (p.oiFetchedAt) r.oiFetched = true;
    this.rows.set(date, r);
  }
  async list(limit: number): Promise<FiiDiiDayRow[]> {
    return [...this.rows.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-limit);
  }
}

const NSE_DATE = (iso: string) => `${iso.slice(8, 10)}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(iso.slice(5, 7)) - 1]}-${iso.slice(0, 4)}`;
const cashJson = (iso: string, fiiNet = 1200.5) =>
  JSON.stringify([
    { category: "DII", date: NSE_DATE(iso), buyValue: "10000.00", sellValue: "9000.00", netValue: "1000.00" },
    { category: "FII/FPI", date: NSE_DATE(iso), buyValue: String(20000 + fiiNet), sellValue: "20000", netValue: String(fiiNet) },
  ]);
const oiCsv = (iso: string, long = 57226, short = 127639) =>
  [`""Participant wise Open Interest (no. of contracts) in Equity Derivatives as on ${new Date(iso + "T00:00:00Z").toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" })}"",,,,`, "Client Type,Future Index Long,Future Index Short,Future Stock Long", "Client,1,2,3", `FII,${long},${short},9`, "TOTAL,1,1,1"].join("\r\n") + "\r\n";

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
  const d: IngestDeps = {
    fetcher,
    store,
    now: new Date(now),
    sleep: async (ms) => void sleeps.push(ms),
    log: (level, message, data) => void logs.push({ level, message, data }),
  };
  return { d, sleeps, logs };
}

// Thu 12 Nov 2026, 20:00 IST: a trading day after both files should be out
const EVENING = "2026-11-12T20:00:00+05:30";
const ok = (body: string): Reply => ({ status: 200, body });

/* ------------------------------------------------------------------ the day --- */

describe("which day's files to fetch", () => {
  it("a trading day after 19:30 IST: that day", () => assert.equal(targetDay(new Date("2026-11-12T19:30:00+05:30")), "2026-11-12"));
  it("a trading day before 19:30 IST: the day before (today's files are not out yet)", () => assert.equal(targetDay(new Date("2026-11-12T19:29:00+05:30")), "2026-11-11"));
  it("the morning after: yesterday", () => assert.equal(targetDay(new Date("2026-11-12T02:42:00+05:30")), "2026-11-11"));
  it("a Saturday: Friday", () => assert.equal(targetDay(new Date("2026-11-14T21:00:00+05:30")), "2026-11-13"));
  it("an exchange holiday evening (10 Nov): the last trading day before it (9 Nov)", () => assert.equal(targetDay(new Date("2026-11-10T20:00:00+05:30")), "2026-11-09"));
});

describe("the daily run", () => {
  it("stores both sources for the day: cash provisional, futures from the open interest file", async () => {
    const store = new MemoryStore();
    const s = nse({ [CASH_URL]: [ok(cashJson("2026-11-12"))], [oiUrl("2026-11-12")]: [ok(oiCsv("2026-11-12"))] });
    const { d, logs } = deps(store, s.fn, EVENING);
    const r = await ingestLatest(d);
    assert.equal(r.target, "2026-11-12");
    assert.equal(r.cash.status, "stored");
    assert.equal(r.oi.status, "stored");
    const row = store.rows.get("2026-11-12")!;
    assert.equal(row.cash!.fii.net, 1200.5);
    assert.deepEqual(row.cash!.dii, { buy: 10000, sell: 9000, net: 1000 });
    assert.deepEqual(row.idxFut, { long: 57226, short: 127639 });
    assert.equal(row.provisional, true);
    assert.ok(row.cashFetched && row.oiFetched);
    assert.equal(logs.filter((l) => l.level === "error").length, 0);
  });

  it("fetches each source at most once a day: a second run changes and fetches nothing", async () => {
    const store = new MemoryStore();
    const s = nse({ [CASH_URL]: [ok(cashJson("2026-11-12"))], [oiUrl("2026-11-12")]: [ok(oiCsv("2026-11-12"))] });
    await ingestLatest(deps(store, s.fn, EVENING).d);
    const before = s.calls.length;
    const writes = store.writes.length;
    const again = await ingestLatest(deps(store, s.fn, "2026-11-12T21:00:00+05:30").d);
    assert.equal(s.calls.length, before, "no request at all on the second run");
    assert.equal(store.writes.length, writes);
    assert.equal(again.cash.status, "already-stored");
    assert.equal(again.oi.status, "already-stored");
  });

  it("a 404 on the open interest file is normal: no retry, no error, and the next run fetches only that file", async () => {
    const store = new MemoryStore();
    const first = nse({ [CASH_URL]: [ok(cashJson("2026-11-12"))] }); // the OI file is not published yet
    const a = deps(store, first.fn, EVENING);
    const r1 = await ingestLatest(a.d);
    assert.equal(r1.cash.status, "stored");
    assert.equal(r1.oi.status, "not-published");
    assert.equal(first.calls.filter((u) => u === oiUrl("2026-11-12")).length, 1, "asked once, not retried");
    assert.equal(a.sleeps.length, 0);
    assert.equal(a.logs.filter((l) => l.level === "error" || l.level === "warn").length, 0);
    assert.equal(store.rows.get("2026-11-12")!.idxFut, null, "nothing is filled in");

    const second = nse({ [CASH_URL]: [ok(cashJson("2026-11-12"))], [oiUrl("2026-11-12")]: [ok(oiCsv("2026-11-12"))] });
    const r2 = await ingestLatest(deps(store, second.fn, "2026-11-12T21:00:00+05:30").d);
    assert.deepEqual(second.calls, [oiUrl("2026-11-12")], "the cash figures are not fetched again");
    assert.equal(r2.oi.status, "stored");
  });

  it("retries a failure with a delay and then succeeds", async () => {
    const store = new MemoryStore();
    const s = nse({ [CASH_URL]: [new Error("socket hang up"), { status: 503, body: "busy" }, ok(cashJson("2026-11-12"))] });
    const { d, sleeps, logs } = deps(store, s.fn, EVENING);
    const r = await ingestLatest(d);
    assert.equal(r.cash.status, "stored");
    assert.deepEqual(sleeps, RETRY_DELAYS_MS, "waited between attempts");
    assert.equal(s.calls.filter((u) => u === CASH_URL).length, 3);
    const warns = logs.filter((l) => l.level === "warn");
    assert.equal(warns.length, 2, "each failed attempt is logged");
    assert.match(String(warns[0].data?.reason), /socket hang up/);
    assert.match(String(warns[1].data?.reason), /HTTP 503/);
  });

  it("gives up after the last attempt, logs the failure as an error and stores nothing", async () => {
    const store = new MemoryStore();
    const s = nse({ [CASH_URL]: [{ status: 403, body: "Access Denied" }], [oiUrl("2026-11-12")]: [ok(oiCsv("2026-11-12"))] });
    const { d, sleeps, logs } = deps(store, s.fn, EVENING);
    const r = await ingestLatest(d);
    assert.equal(r.cash.status, "failed");
    assert.equal(s.calls.filter((u) => u === CASH_URL).length, RETRY_DELAYS_MS.length + 1);
    assert.deepEqual(sleeps, RETRY_DELAYS_MS);
    assert.ok(logs.some((l) => l.level === "error" && /FII\/DII cash/.test(l.message)));
    assert.ok(logs.some((l) => l.level === "error" && /ingest: cash failed/.test(l.message)));
    assert.equal(store.rows.get("2026-11-12")?.cash ?? null, null, "no cash figures were stored");
    assert.equal(r.oi.status, "stored", "one source failing does not stop the other");
    assert.equal(store.rows.get("2026-11-12")!.cashFetched, false, "so the next run tries the cash source again");
  });

  it("an unexpected body (a block page) is retried, logged as unexpected content, and never stored", async () => {
    const store = new MemoryStore();
    const s = nse({ [CASH_URL]: [{ status: 200, body: "<html>Please enable JavaScript</html>" }] });
    const { d, logs } = deps(store, s.fn, EVENING);
    const r = await ingestLatest(d);
    assert.equal(r.cash.status, "failed");
    assert.ok(logs.some((l) => /unexpected content/.test(String(l.data?.reason))));
    assert.equal(store.rows.size, 0);
  });

  it("an open interest file for a different day than asked is rejected, not stored", async () => {
    const store = new MemoryStore();
    const s = nse({ [CASH_URL]: [ok(cashJson("2026-11-12"))], [oiUrl("2026-11-12")]: [ok(oiCsv("2026-11-09"))] });
    const r = await ingestLatest(deps(store, s.fn, EVENING).d);
    assert.equal(r.oi.status, "failed");
    assert.equal(store.rows.get("2026-11-12")!.idxFut, null);
  });

  it("the cash source still showing yesterday: nothing is stored for today and the next run tries again", async () => {
    const store = new MemoryStore();
    await store.upsert("2026-11-11", { cash: { fii: { buy: 2, sell: 1, net: 1 }, dii: { buy: 2, sell: 1, net: 1 } }, provisional: true, cashFetchedAt: new Date() });
    const s = nse({ [CASH_URL]: [ok(cashJson("2026-11-11"))] });
    const r = await ingestLatest(deps(store, s.fn, EVENING).d);
    assert.deepEqual(r.cash, { status: "source-behind", date: "2026-11-12", shows: "2026-11-11" });
    assert.equal(store.rows.get("2026-11-12")?.cashFetched ?? false, false);
    assert.equal(store.rows.get("2026-11-11")!.cash!.fii.net, 1, "yesterday's stored figures are not overwritten");
    // later NSE publishes today's day
    const s2 = nse({ [CASH_URL]: [ok(cashJson("2026-11-12", 777))] });
    const r2 = await ingestLatest(deps(store, s2.fn, "2026-11-12T21:30:00+05:30").d);
    assert.equal(r2.cash.status, "stored");
    assert.equal(store.rows.get("2026-11-12")!.cash!.fii.net, 777);
  });

  it("a missed day: if the source shows an older day we do not hold, it is stored under its own date (real data, correctly dated)", async () => {
    const store = new MemoryStore();
    const s = nse({ [CASH_URL]: [ok(cashJson("2026-11-11", 55))] });
    const r = await ingestLatest(deps(store, s.fn, EVENING).d);
    assert.equal(r.cash.status, "source-behind");
    assert.equal(store.rows.get("2026-11-11")!.cash!.fii.net, 55);
    assert.equal(store.rows.get("2026-11-12")?.cash ?? null, null, "today's cash stays empty: a gap, not a copy");
  });

  it("a run on a holiday evening has nothing to do once the previous trading day is stored", async () => {
    const store = new MemoryStore();
    const s0 = nse({ [CASH_URL]: [ok(cashJson("2026-11-09"))], [oiUrl("2026-11-09")]: [ok(oiCsv("2026-11-09"))] });
    await ingestLatest(deps(store, s0.fn, "2026-11-09T20:00:00+05:30").d);
    const s = nse({});
    const r = await ingestLatest(deps(store, s.fn, "2026-11-10T20:00:00+05:30").d); // 10 Nov is a holiday
    assert.equal(r.target, "2026-11-09");
    assert.equal(s.calls.length, 0);
  });
});

/* -------------------------------------------------------------------- backfill --- */

describe("backfill from the participant open interest files", () => {
  it("fills weekdays that have a file, treats 404s (holiday, not published) as normal, and skips weekends", async () => {
    const store = new MemoryStore();
    // today is Thu 12 Nov; files exist for 12, 11 and 9 Nov (10 Nov is a holiday: 404); 6 Nov has none either
    const s = nse({ [oiUrl("2026-11-12")]: [ok(oiCsv("2026-11-12"))], [oiUrl("2026-11-11")]: [ok(oiCsv("2026-11-11", 10, 20))], [oiUrl("2026-11-09")]: [ok(oiCsv("2026-11-09", 30, 40))] });
    const { d, logs } = deps(store, s.fn, EVENING);
    const r = await backfillOi(d, { days: 7, gapMs: 0 });
    assert.deepEqual(r.stored.sort(), ["2026-11-09", "2026-11-11", "2026-11-12"]);
    assert.deepEqual(r.none.sort(), ["2026-11-06", "2026-11-10"], "404s are reported as 'none', not as failures");
    assert.deepEqual(r.failed, []);
    assert.equal(logs.filter((l) => l.level === "error").length, 0);
    assert.ok(!s.calls.some((u) => /fao_participant_oi_(07|08|14|15)112026/.test(u)), "no request for a Saturday or Sunday");
    assert.deepEqual(store.rows.get("2026-11-11")!.idxFut, { long: 10, short: 20 });
  });

  it("a backfilled day has futures positions only: no cash figures, and it is not marked provisional", async () => {
    const store = new MemoryStore();
    const s = nse({ [oiUrl("2026-11-11")]: [ok(oiCsv("2026-11-11"))] });
    await backfillOi(deps(store, s.fn, EVENING).d, { days: 2, gapMs: 0 });
    const row = store.rows.get("2026-11-11")!;
    assert.equal(row.cash, null);
    assert.equal(row.provisional, false);
  });

  it("leaves a day that already has cash figures provisional", async () => {
    const store = new MemoryStore();
    await store.upsert("2026-11-11", { cash: { fii: { buy: 2, sell: 1, net: 1 }, dii: { buy: 2, sell: 1, net: 1 } }, provisional: true, cashFetchedAt: new Date() });
    const s = nse({ [oiUrl("2026-11-11")]: [ok(oiCsv("2026-11-11"))] });
    await backfillOi(deps(store, s.fn, EVENING).d, { days: 2, gapMs: 0 });
    const row = store.rows.get("2026-11-11")!;
    assert.equal(row.provisional, true);
    assert.equal(row.cash!.fii.net, 1);
    assert.ok(row.idxFut);
  });

  it("skips days already stored (each file is fetched once), and is bounded and spaced out", async () => {
    const store = new MemoryStore();
    await store.upsert("2026-11-12", { idxFut: { long: 1, short: 1 }, oiFetchedAt: new Date() });
    const files: Record<string, Reply[]> = {};
    for (const day of ["2026-11-11", "2026-11-09", "2026-11-06", "2026-11-05", "2026-11-04", "2026-11-03", "2026-11-02"]) files[oiUrl(day)] = [ok(oiCsv(day))];
    const s = nse(files);
    const { d, sleeps } = deps(store, s.fn, EVENING);
    const r = await backfillOi(d, { days: 14, maxFetches: 3, gapMs: 500 });
    assert.equal(r.skipped, 1, "12 Nov was already stored");
    assert.ok(!s.calls.includes(oiUrl("2026-11-12")));
    assert.equal(s.calls.length, 3, "stopped at its fetch limit");
    assert.equal(r.more, true);
    assert.deepEqual(sleeps, [500, 500], "a pause between requests, none before the first");
    // a repeat call carries on without refetching what is stored
    const s2 = nse(files);
    await backfillOi(deps(store, s2.fn, EVENING).d, { days: 14, maxFetches: 30, gapMs: 0 });
    assert.ok(![...store.rows.keys()].slice(0, 3).some((k) => s2.calls.includes(oiUrl(k))), "stored days are not fetched again");
  });

  it("a failing file is reported and retried with the usual delays, and does not stop the rest", async () => {
    const store = new MemoryStore();
    const s = nse({ [oiUrl("2026-11-12")]: [{ status: 500, body: "oops" }], [oiUrl("2026-11-11")]: [ok(oiCsv("2026-11-11"))] });
    const { d, sleeps, logs } = deps(store, s.fn, EVENING);
    const r = await backfillOi(d, { days: 2, gapMs: 0 });
    assert.equal(r.failed.length, 1);
    assert.equal(r.failed[0].date, "2026-11-12");
    assert.deepEqual(r.stored, ["2026-11-11"]);
    assert.ok(sleeps.length >= RETRY_DELAYS_MS.length);
    assert.ok(logs.some((l) => l.level === "error"));
  });
});
