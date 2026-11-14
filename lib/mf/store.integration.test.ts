import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { makeMfStore } from "./store";
import { ingestNavLatest } from "./ingest";

/**
 * Runs the real SQL against a real Postgres. Skipped unless MF_TEST_DATABASE_URL points at a THROWAWAY database that already has the
 * migrations applied (the test empties the two mutual fund tables). Never point it at a database with data you want to keep.
 */
const url = process.env.MF_TEST_DATABASE_URL;
const skip = url ? false : "set MF_TEST_DATABASE_URL to a throwaway Postgres with the migrations applied to run this";

describe("mutual fund store against Postgres", { skip }, () => {
  let db: PrismaClient;
  let store: ReturnType<typeof makeMfStore>;
  before(async () => {
    db = new PrismaClient({ datasourceUrl: url });
    store = makeMfStore(db);
    await db.$executeRawUnsafe(`TRUNCATE "MfScheme", "MfNav"`);
  });
  after(async () => {
    await db?.$disconnect();
  });

  const scheme = (code: number, navDate: string, nav: number) => ({ code, name: `Fund ${code} - Direct Plan - Growth`, isin: code === 2 ? null : `INF000${code}`, amc: "Test Mutual Fund", category: "Equity Scheme - Large Cap Fund", nav, navDate });

  it("upserts schemes: inserts, updates to a newer NAV, ignores an older one, keeps a missing ISIN as null", async () => {
    await store.upsertSchemes([scheme(1, "2026-11-12", 100), scheme(2, "2026-11-12", 50)]);
    await store.upsertSchemes([scheme(1, "2026-11-13", 101)]);
    await store.upsertSchemes([scheme(1, "2026-11-10", 90)]); // older: must not overwrite
    const rows = await db.mfScheme.findMany({ orderBy: { code: "asc" } });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].nav, 101);
    assert.equal(rows[0].navDate.toISOString().slice(0, 10), "2026-11-13");
    assert.equal(rows[1].isin, null);
    assert.equal(rows[0].isin, "INF0001");
  });

  it("inserts NAV rows once: a repeat adds nothing", async () => {
    const rows = [
      { code: 1, date: "2026-11-13", nav: 101 },
      { code: 1, date: "2026-11-12", nav: 100 },
      { code: 2, date: "2026-11-12", nav: 50 },
    ];
    assert.equal(await store.insertNavs(rows), 3);
    assert.equal(await store.insertNavs(rows), 0);
    assert.equal(await db.mfNav.count(), 3);
  });

  it("finds the newest stored NAV in a date window, per scheme", async () => {
    await store.insertNavs([{ code: 1, date: "2026-10-09", nav: 90 }, { code: 1, date: "2026-10-12", nav: 92 }, { code: 2, date: "2026-10-01", nav: 40 }]);
    const m = await store.anchorNavs([1, 2], "2026-10-06", "2026-10-13");
    assert.deepEqual(m.get(1), { date: "2026-10-12", nav: 92 });
    assert.equal(m.has(2), false);
  });

  it("updates returns, including nulls", async () => {
    await store.updateReturns([{ code: 1, "1m": 5.5, "6m": null, "1y": 12.25, "3y": null, "5y": null }]);
    const r = await db.mfScheme.findUniqueOrThrow({ where: { code: 1 } });
    assert.equal(r.ret1m, 5.5);
    assert.equal(r.ret6m, null);
    assert.equal(r.ret1y, 12.25);
  });

  it("the whole nightly job: stores tracked schemes, the day's NAV, and returns from stored anchors", async () => {
    await db.$executeRawUnsafe(`TRUNCATE "MfScheme", "MfNav"`);
    // an NAV a year before the file's date, so 1y can be worked out
    await store.insertNavs([{ code: 111, date: "2025-11-12", nav: 100 }]);
    const file = [
      "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date",
      "Open Ended Schemes(Equity Scheme - Large Cap Fund)",
      "Test Mutual Fund",
      "111;INF111;-;Test Large Cap - Direct Plan - Growth;Direct Plan;Growth;120;12-Nov-2026",
      "112;INF112;-;Test Large Cap - Regular Plan - Growth;Regular Plan;Growth;118;12-Nov-2026",
      "113;INF113;-;Test Large Cap - Direct Plan - IDCW;Direct Plan;IDCW;99;12-Nov-2026",
      "114;INF114;-;Test Old - Direct Plan - Growth;Direct Plan;Growth;50;01-Jun-2026",
    ].join("\r\n");
    const out = await ingestNavLatest({ fetchText: async () => file, store, now: new Date("2026-11-13T18:00:00Z"), log: () => {}, minTracked: 1 });
    assert.equal(out.status, "stored");
    assert.deepEqual(await db.mfScheme.findMany({ select: { code: true }, orderBy: { code: "asc" } }), [{ code: 111 }]);
    const s = await db.mfScheme.findUniqueOrThrow({ where: { code: 111 } });
    assert.equal(s.nav, 120);
    assert.ok(Math.abs((s.ret1y as number) - 20) < 1e-9, String(s.ret1y));
    assert.equal(s.ret1m, null);
    assert.equal(await db.mfNav.count({ where: { code: 111 } }), 2);
    // running it again changes nothing
    const again = await ingestNavLatest({ fetchText: async () => file, store, now: new Date("2026-11-13T18:00:00Z"), log: () => {}, minTracked: 1 });
    assert.equal(again.status === "stored" && again.navsInserted, 0);
    assert.equal(await db.mfNav.count({ where: { code: 111 } }), 2);
  });
});
