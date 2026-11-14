import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FII_DII_EMPTY, FUTURES_EMPTY, FUTURES_UNAVAILABLE, fiiDiiSummary, futuresGainers } from "./dashboard-cards";
import type { FiiDiiDayRow } from "./fiidii/types";
import type { FutureMover, FutureMovers, MoversResponse } from "./movers";

const fut = (symbol: string, changePct: number): FutureMover => ({ symbol, name: symbol, expiry: "2026-11-25", ltp: 1000, change: changePct * 10, changePct, volume: 1000, lot: 100, isIndex: false });
const live = (gainers: FutureMover[]): MoversResponse<FutureMovers> => ({ source: "live", asOf: "2026-11-13T05:00:00Z", data: { gainers, losers: [], scanned: gainers.length } });

describe("dashboard: futures gainers (20.1)", () => {
  it("takes the top three that are up, best first, from the Movers feed", () => {
    const v = futuresGainers(live([fut("A", 1.1), fut("B", 4.2), fut("C", 2.5), fut("D", 3.3)]));
    assert.equal(v.kind, "rows");
    assert.deepEqual(v.kind === "rows" && v.rows.map((r) => r.symbol), ["B", "D", "C"]);
  });
  it("never lists a flat or falling future as a gainer", () => {
    const v = futuresGainers(live([fut("A", -0.5), fut("B", 0), fut("C", 0.4)]));
    assert.deepEqual(v.kind === "rows" && v.rows.map((r) => r.symbol), ["C"]);
    assert.deepEqual(futuresGainers(live([fut("A", -0.5), fut("B", 0)])), { kind: "empty", text: FUTURES_EMPTY });
  });
  it("says so when the feed is unavailable, and waits while loading", () => {
    assert.deepEqual(futuresGainers({ source: "unavailable" }), { kind: "unavailable", text: FUTURES_UNAVAILABLE });
    assert.deepEqual(futuresGainers(null), { kind: "loading" });
  });
});

const day = (date: string, fiiNet: number | null, diiNet = 0, provisional = false): FiiDiiDayRow => ({
  date,
  cash: fiiNet === null ? null : { fii: { buy: 0, sell: 0, net: fiiNet }, dii: { buy: 0, sell: 0, net: diiNet } },
  idxFut: null,
  provisional,
});

describe("dashboard: FII/DII summary (20.2)", () => {
  it("is the newest stored day that has cash figures", () => {
    const s = fiiDiiSummary([day("2026-11-10", -500, 300), day("2026-11-12", 1200, -400, true), day("2026-11-11", null)]);
    assert.equal(s?.date, "2026-11-12");
    assert.equal(s?.cash.fii.net, 1200);
    assert.equal(s?.cash.dii.net, -400);
    assert.equal(s?.provisional, true);
  });
  it("skips a newer day that has no cash figures yet", () => {
    assert.equal(fiiDiiSummary([day("2026-11-10", -500), day("2026-11-12", null)])?.date, "2026-11-10");
  });
  it("is null when nothing is stored, and the card says 'Data not available yet'", () => {
    assert.equal(fiiDiiSummary([]), null);
    assert.equal(fiiDiiSummary(null), null);
    assert.equal(fiiDiiSummary([day("2026-11-12", null)]), null);
    assert.equal(FII_DII_EMPTY, "Data not available yet");
  });
});
