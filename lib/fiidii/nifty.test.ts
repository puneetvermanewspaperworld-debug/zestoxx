import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildFiiDiiPayload, type PayloadDeps } from "./payload";
import { closesFrom, fmtNiftyPct, niftyChangePct, niftyChanges, type IndexClose, NIFTY_INDEX_NAME } from "./nifty";
import type { FiiDiiDayRow } from "./types";

const closes = (pairs: [string, number][]): IndexClose[] => pairs.map(([date, close]) => ({ date, close }));
const map = (pairs: [string, number][]) => new Map(pairs);

describe("Nifty day-over-day change", () => {
  it("is the close against the previous trading day's close", () => {
    const m = map([["2026-11-12", 25000], ["2026-11-13", 25125]]); // Thursday, Friday
    const v = niftyChangePct("2026-11-13", m);
    assert.ok(v !== null && Math.abs(v - 0.5) < 1e-9, String(v));
    assert.ok((niftyChangePct("2026-11-13", map([["2026-11-12", 25000], ["2026-11-13", 24750]])) as number) < 0);
  });
  it("Monday is measured against Friday, over the weekend", () => {
    const v = niftyChangePct("2026-11-16", map([["2026-11-13", 25000], ["2026-11-16", 25250]]));
    assert.ok(v !== null && Math.abs(v - 1) < 1e-9);
  });
  it("a day after a holiday is measured against the last trading day before it (10 Nov 2026 was a holiday)", () => {
    const v = niftyChangePct("2026-11-11", map([["2026-11-09", 25000], ["2026-11-11", 24900]]));
    assert.ok(v !== null && Math.abs(v - -0.4) < 1e-9);
  });
  it("no close for the day: null", () => {
    assert.equal(niftyChangePct("2026-11-13", map([["2026-11-12", 25000]])), null);
  });
  it("no close for the previous trading day: null, never a change carried across the gap", () => {
    // the 11th is missing; the 10th was a holiday and the 9th is stored, but the previous trading day of the 12th is the 11th
    assert.equal(niftyChangePct("2026-11-12", map([["2026-11-09", 25000], ["2026-11-12", 25100]])), null);
  });
  it("closes that are zero, negative or not numbers are not closes", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(niftyChangePct("2026-11-13", map([["2026-11-12", 25000], ["2026-11-13", bad]])), null);
      assert.equal(niftyChangePct("2026-11-13", map([["2026-11-12", bad], ["2026-11-13", 25000]])), null);
    }
  });
  it("works for every date asked, in any order of closes, ignoring junk rows", () => {
    const m = niftyChanges(
      ["2026-11-12", "2026-11-13", "2026-11-16"],
      [...closes([["2026-11-16", 25250], ["2026-11-12", 25000], ["2026-11-13", 25125]]), { date: "2026-11-11", close: Number.NaN }]
    );
    assert.equal(m.get("2026-11-12"), null); // 11 Nov close is junk
    assert.ok(Math.abs((m.get("2026-11-13") as number) - 0.5) < 1e-9);
    assert.ok(Math.abs((m.get("2026-11-16") as number) - (25250 / 25125 - 1) * 100) < 1e-9);
    assert.equal(m.size, 3);
  });
  it("no closes at all: every day is null", () => {
    assert.deepEqual([...niftyChanges(["2026-11-13"], []).values()], [null]);
  });
});

describe("how it is shown", () => {
  it("signed, two decimals, and -- when there is no figure; never +-", () => {
    assert.equal(fmtNiftyPct(0.52), "+0.52%");
    assert.equal(fmtNiftyPct(-1.1), "-1.10%");
    assert.equal(fmtNiftyPct(0), "0.00%");
    assert.equal(fmtNiftyPct(-0.001), "0.00%");
    assert.equal(fmtNiftyPct(null), "--");
    assert.equal(fmtNiftyPct(undefined), "--");
    for (const v of [-9.99, -0.01, 0.01, 9.99]) assert.ok(!fmtNiftyPct(v).includes("+-"));
  });
  it("the table has the column for daily rows only, and the note", () => {
    const src = fs.readFileSync("components/views/FiiDiiView.tsx", "utf8");
    assert.match(src, /Nifty %/);
    assert.match(src, /showNifty = period === "daily"/);
    assert.match(src, /NIFTY_NOTE/);
    assert.doesNotMatch(src, /Math\.random|seededRandom/);
  });
});

describe("what /api/fiidii answers", () => {
  const day = (date: string): FiiDiiDayRow => ({ date, cash: { fii: { buy: 1, sell: 1, net: 0 }, dii: { buy: 1, sell: 1, net: 0 } }, idxFut: null, provisional: false });
  const rows = [day("2026-11-11"), day("2026-11-12"), day("2026-11-13")];

  it("returns the days with Nifty 50's closes, asking for the range that covers them and the day before the first", async () => {
    const asked: [string, string, string][] = [];
    const deps: PayloadDeps = {
      listDays: async () => rows,
      listCloses: async (i, f, t) => (asked.push([i, f, t]), closes([["2026-11-09", 25000], ["2026-11-11", 25100]])),
    };
    const p = await buildFiiDiiPayload(deps);
    assert.equal(p.status, "ok");
    assert.equal(p.rows.length, 3);
    assert.deepEqual(p.nifty, closes([["2026-11-09", 25000], ["2026-11-11", 25100]]));
    assert.deepEqual(asked, [[NIFTY_INDEX_NAME, closesFrom("2026-11-11"), "2026-11-13"]]);
    assert.equal(NIFTY_INDEX_NAME, "Nifty 50");
    assert.ok(closesFrom("2026-11-11") <= "2026-11-01");
  });
  it("if the closes cannot be read the days are still returned, with no closes", async () => {
    const p = await buildFiiDiiPayload({ listDays: async () => rows, listCloses: async () => Promise.reject(new Error("db")) });
    assert.equal(p.status, "ok");
    assert.equal(p.rows.length, 3);
    assert.deepEqual(p.nifty, []);
  });
  it("if the days cannot be read it is unavailable, as before; with none stored it is empty", async () => {
    assert.deepEqual(await buildFiiDiiPayload({ listDays: async () => Promise.reject(new Error("db")), listCloses: async () => [] }), { status: "unavailable", rows: [], nifty: [] });
    assert.deepEqual(await buildFiiDiiPayload({ listDays: async () => [], listCloses: async () => [] }), { status: "empty", rows: [], nifty: [] });
  });
  it("the route is wired to the stored index closes", () => {
    const src = fs.readFileSync("app/api/fiidii/route.ts", "utf8");
    assert.match(src, /prismaIndexStore\.closes/);
    assert.match(src, /buildFiiDiiPayload/);
  });
});
