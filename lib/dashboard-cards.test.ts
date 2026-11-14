import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FII_DII_EMPTY, FUTURES_EMPTY, FUTURES_UNAVAILABLE, MOVERS_UNAVAILABLE, NO_GAINERS, NO_LOSERS, equityMoversCard, fiiDiiSummary, futuresGainers } from "./dashboard-cards";
import type { FiiDiiDayRow } from "./fiidii/types";
import type { FutureMover, FutureMovers, MoversResponse, StockMover, StockMovers } from "./movers";

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

const stock = (symbol: string, changePct: number): StockMover => ({ symbol, name: symbol, ltp: 100, change: changePct, changePct, volume: 1000, value: 1e8 });
const equity = (gainers: StockMover[], losers: StockMover[]): MoversResponse<StockMovers> => ({
  source: "live",
  asOf: "2026-11-13T10:00:00Z",
  data: { gainers, losers, active: [], ranked: gainers.length + losers.length, scanned: 2000 },
});

describe("dashboard: Market Movers from the all-NSE feed", () => {
  const gainers = [stock("ANUP", 20), stock("BBB", 12.5), stock("CCC", 9), stock("DDD", 7.1), stock("EEE", 5)];
  const losers = [stock("ZZZ", -9.5), stock("YYY", -6), stock("XXX", -4.2), stock("WWW", -3)];
  it("the top three gainers and the top three losers, best and worst first", () => {
    const v = equityMoversCard(equity(gainers, losers));
    assert.equal(v.kind, "ok");
    if (v.kind !== "ok") return;
    assert.deepEqual(v.gainers.map((g) => g.symbol), ["ANUP", "BBB", "CCC"]);
    assert.deepEqual(v.losers.map((g) => g.symbol), ["ZZZ", "YYY", "XXX"]);
    assert.equal(v.gainers[0].changePct, 20);
  });
  it("a gainer is only a stock that is up and a loser only one that is down, whatever the feed's lists hold", () => {
    const v = equityMoversCard(equity([stock("UP", 3), stock("FLAT", 0), stock("DOWN", -1)], [stock("LOW", -2), stock("ALSOUP", 4)]));
    assert.ok(v.kind === "ok");
    if (v.kind !== "ok") return;
    assert.deepEqual(v.gainers.map((g) => g.symbol), ["ALSOUP", "UP"]);
    assert.deepEqual(v.losers.map((g) => g.symbol), ["LOW", "DOWN"]);
  });
  it("fewer than three real gainers or losers is not padded", () => {
    const v = equityMoversCard(equity([stock("ONLY", 2)], []));
    assert.ok(v.kind === "ok" && v.gainers.length === 1 && v.losers.length === 0);
  });
  it("with none, the lists are empty and the card says so", () => {
    const v = equityMoversCard(equity([], []));
    assert.ok(v.kind === "ok" && v.gainers.length === 0 && v.losers.length === 0);
    assert.equal(NO_GAINERS, "No gainers right now");
    assert.equal(NO_LOSERS, "No losers right now");
    const src = fs.readFileSync("components/DashboardCards.tsx", "utf8");
    assert.match(src, /NO_GAINERS/);
    assert.match(src, /NO_LOSERS/);
  });
  it("an unavailable feed says so; no answer yet is loading; nothing is ever invented", () => {
    assert.deepEqual(equityMoversCard({ source: "unavailable" }), { kind: "unavailable", text: MOVERS_UNAVAILABLE });
    assert.deepEqual(equityMoversCard(null), { kind: "loading" });
    assert.deepEqual(equityMoversCard(undefined), { kind: "loading" });
  });
  it("uses the very same feed and query as the Movers page, so the two always agree", () => {
    const card = fs.readFileSync("components/DashboardCards.tsx", "utf8");
    const page = fs.readFileSync("components/views/MoversView.tsx", "utf8");
    assert.match(card, /useMovers<StockMovers>\("view=equity"\)/);
    assert.match(page, /"view=equity"/);
  });
  it("links to the Movers page, shows the shared badge and the closed-market note", () => {
    const src = fs.readFileSync("components/DashboardCards.tsx", "utf8");
    assert.match(src, /href="\/app\/movers"/);
    assert.match(src, /<DataBadge source="live" \/>/);
    assert.match(src, /moversNote\(open,/);
  });
});
