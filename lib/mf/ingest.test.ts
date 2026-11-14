import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NAV_ALL_URL, ingestNavLatest, navHistoryUrl, refreshReturns, type MfDeps, type MfStore, type NavRow, type ReturnRow, type SchemeRow } from "./ingest";
import type { NavPoint } from "./returns";

/** A store held in memory with the same rules as the SQL: NAV rows are unique by (code, date); a scheme row is not overwritten by an older NAV. */
function fakeStore() {
  const schemes = new Map<number, SchemeRow>();
  const navs = new Map<string, NavRow>();
  const returns = new Map<number, ReturnRow>();
  const calls = { upsert: 0, insert: 0, update: 0 };
  const store: MfStore = {
    async upsertSchemes(rows) {
      calls.upsert++;
      for (const r of rows) {
        const prev = schemes.get(r.code);
        if (!prev || prev.navDate <= r.navDate) schemes.set(r.code, r);
      }
    },
    async insertNavs(rows) {
      calls.insert++;
      let n = 0;
      for (const r of rows) {
        const k = `${r.code}|${r.date}`;
        if (!navs.has(k)) {
          navs.set(k, r);
          n++;
        }
      }
      return n;
    },
    async anchorNavs(codes, from, to) {
      const out = new Map<number, NavPoint>();
      for (const r of navs.values()) {
        if (!codes.includes(r.code) || r.date < from || r.date > to) continue;
        const cur = out.get(r.code);
        if (!cur || cur.date < r.date) out.set(r.code, { date: r.date, nav: r.nav });
      }
      return out;
    },
    async updateReturns(rows) {
      calls.update++;
      for (const r of rows) returns.set(r.code, r);
    },
  };
  return { store, schemes, navs, returns, calls };
}

const HEADER = "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date";
const file = (...rows: string[]) => ["", HEADER, "", "Open Ended Schemes(Equity Scheme - Large Cap Fund)", "", "Test Mutual Fund", "", ...rows].join("\r\n");
const NOW = new Date("2026-11-13T18:00:00Z"); // 23:30 IST on Friday 13 Nov 2026

const deps = (text: string | ((url: string) => Promise<string>), store: MfStore, over: Partial<MfDeps> = {}): MfDeps & { logs: string[] } => {
  const logs: string[] = [];
  return { fetchText: typeof text === "string" ? async () => text : text, store, now: NOW, log: (l, m) => logs.push(`${l}: ${m}`), minTracked: 1, ...over, logs };
};

describe("the nightly NAV job", () => {
  const good = file(
    "1;INF1;-;Alpha Large Cap - Direct Plan - Growth;Direct Plan;Growth;120.5;13-Nov-2026",
    "2;INF2;-;Alpha Large Cap - Regular Plan - Growth;Regular Plan;Growth;110;13-Nov-2026",
    "3;INF3;-;Alpha Large Cap - Direct Plan - IDCW;Direct Plan;IDCW;99;13-Nov-2026",
    "4;INF4;-;Beta Old Fund - Direct Plan - Growth;Direct Plan;Growth;50;20-Oct-2026",
    "5;INF5;-;Gamma Matured Plan (Matured) - Direct Plan - Growth;Direct Plan;Growth;40;13-Nov-2026",
    "6;INF6;-;Delta - Direct Plan - Growth;Direct Plan;Growth;N.A.;13-Nov-2026"
  );

  it("stores only Direct plans in the Growth option that are fresh and not matured", async () => {
    const f = fakeStore();
    const out = await ingestNavLatest(deps(good, f.store));
    assert.equal(out.status, "stored");
    assert.deepEqual([...f.schemes.keys()], [1]);
    assert.deepEqual([...f.navs.keys()], ["1|2026-11-13"]);
    assert.equal(f.schemes.get(1)?.nav, 120.5);
    assert.equal(f.schemes.get(1)?.amc, "Test Mutual Fund");
    assert.equal(f.schemes.get(1)?.category, "Equity Scheme - Large Cap Fund");
  });

  it("reads the NAV file from AMFI", async () => {
    const urls: string[] = [];
    await ingestNavLatest(deps(async (u) => (urls.push(u), good), fakeStore().store));
    assert.deepEqual(urls, [NAV_ALL_URL]);
    assert.equal(NAV_ALL_URL, "https://www.amfiindia.com/spages/NAVAll.txt");
  });

  it("running it twice stores nothing new the second time", async () => {
    const f = fakeStore();
    const first = await ingestNavLatest(deps(good, f.store));
    const second = await ingestNavLatest(deps(good, f.store));
    assert.equal(first.status === "stored" && first.navsInserted, 1);
    assert.equal(second.status === "stored" && second.navsInserted, 0);
    assert.equal(f.navs.size, 1);
  });

  it("a fund house that publishes late is stored the next night under its true date", async () => {
    const f = fakeStore();
    await ingestNavLatest(deps(file("1;INF1;-;A - Direct Plan - Growth;Direct Plan;Growth;100;12-Nov-2026"), f.store, { now: new Date("2026-11-12T18:00:00Z") }));
    await ingestNavLatest(deps(file("1;INF1;-;A - Direct Plan - Growth;Direct Plan;Growth;101;13-Nov-2026"), f.store));
    assert.deepEqual([...f.navs.keys()].sort(), ["1|2026-11-12", "1|2026-11-13"]);
    assert.equal(f.schemes.get(1)?.nav, 101);
  });

  it("works out returns from the stored NAV a year earlier", async () => {
    const f = fakeStore();
    f.navs.set("1|2025-11-13", { code: 1, date: "2025-11-13", nav: 100.25 });
    const out = await ingestNavLatest(deps(good, f.store));
    assert.equal(out.status === "stored" && out.returnsUpdated, 1);
    const r = f.returns.get(1)!;
    assert.ok(Math.abs((r["1y"] as number) - (120.5 / 100.25 - 1) * 100) < 1e-9);
    assert.equal(r["1m"], null);
    assert.equal(r["5y"], null);
  });

  it("writes nothing when the file cannot be fetched", async () => {
    const f = fakeStore();
    const out = await ingestNavLatest(deps(async () => Promise.reject(new Error("boom")), f.store));
    assert.deepEqual(out, { status: "failed", reason: "fetch failed" });
    assert.deepEqual(f.calls, { upsert: 0, insert: 0, update: 0 });
  });

  it("writes nothing when the text is not a NAV file (an error page)", async () => {
    const f = fakeStore();
    const out = await ingestNavLatest(deps("<html><body>Object Moved</body></html>", f.store));
    assert.equal(out.status, "failed");
    assert.deepEqual(f.calls, { upsert: 0, insert: 0, update: 0 });
  });

  it("writes nothing when the file looks truncated (too few tracked schemes)", async () => {
    const f = fakeStore();
    const out = await ingestNavLatest(deps(good, f.store, { minTracked: 1000 }));
    assert.equal(out.status, "failed");
    assert.match(out.status === "failed" ? out.reason : "", /nothing written/);
    assert.deepEqual(f.calls, { upsert: 0, insert: 0, update: 0 });
  });
});

describe("returns refresh", () => {
  it("groups schemes by their NAV date and gives each its own anchors", async () => {
    const f = fakeStore();
    f.navs.set("1|2026-10-13", { code: 1, date: "2026-10-13", nav: 100 });
    f.navs.set("2|2026-10-12", { code: 2, date: "2026-10-12", nav: 200 });
    const n = await refreshReturns(f.store, [
      { code: 1, nav: 110, navDate: "2026-11-13" },
      { code: 2, nav: 210, navDate: "2026-11-12" },
    ]);
    assert.equal(n, 2);
    assert.ok(Math.abs((f.returns.get(1)!["1m"] as number) - 10) < 1e-9);
    assert.ok(Math.abs((f.returns.get(2)!["1m"] as number) - 5) < 1e-9);
  });
});

describe("history file URL", () => {
  it("asks for one day, all fund houses, in AMFI's date format", () => {
    assert.equal(navHistoryUrl("2026-11-13"), "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?tp=1&frmdt=13-Nov-2026&todt=13-Nov-2026");
    assert.equal(navHistoryUrl("2021-01-05"), "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?tp=1&frmdt=05-Jan-2021&todt=05-Jan-2021");
  });
});
