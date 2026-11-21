import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createFakePrisma } from "./testing/fake-prisma";
import type { PortfolioBlob } from "./portfolio";

/**
 * The phone shell's data, per guest, with no database (the in-memory Prisma stand-in): several watchlists with indices, notes, GTT / stop-loss orders
 * and dated, simulated fills all belong to one guest id and never reach another cookie.
 */
const fake = createFakePrisma();
(globalThis as unknown as { prisma: unknown }).prisma = fake.db;
type Route = Record<string, (req: Request) => Promise<Response>>;
let portfolio: Route;
before(async () => {
  portfolio = (await import("../app/api/portfolio/route")) as unknown as Route;
});
beforeEach(() => {
  for (const t of Object.keys(fake.tables)) fake.tables[t].length = 0;
});

const HOST = "zestoxx.test";
const req = (method: string, o: { cookie?: string; ip?: string; body?: unknown } = {}) =>
  new Request(`https://${HOST}/api/portfolio`, { method, headers: { host: HOST, ...(o.cookie ? { cookie: o.cookie } : {}), "x-forwarded-for": o.ip ?? "198.51.100.1", ...(o.body !== undefined ? { "content-type": "application/json" } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
const read = async (cookie: string): Promise<PortfolioBlob | null> => (await portfolio.GET(req("GET", { cookie }))).json();
async function save(blob: Partial<PortfolioBlob>, cookie?: string, ip?: string): Promise<string> {
  const res = await portfolio.PUT(req("PUT", { cookie, ip, body: { watchlist: [], cash: 1_000_000, holdings: {}, orderLog: [], alerts: [], ...blob } }));
  assert.equal(res.status, 200);
  const set = res.headers.getSetCookie().find((c) => c.startsWith("zx_guest="));
  return set ? set.split(";")[0] : cookie!;
}

const syms = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("two guests never see each other's lists", () => {
  it("each guest's several lists, with indices and F&O names, stay with that guest, in order", async () => {
    const a = await save({ watchlist: ["RELIANCE", "TCS"], lists: [{ name: "Banks", symbols: ["HDFCBANK", "IDX NIFTY PVT BANK", "BANKNIFTY"] }, { name: "Fno", symbols: ["ITC", "NIFTY50"] }, { name: "Mine", symbols: ["AAA", "BBB", "CCC"] }] }, undefined, "198.51.100.1");
    const b = await save({ watchlist: ["INFY"], lists: [{ name: "Theirs", symbols: ["ZZZ", "YYY"] }, { name: "Banks", symbols: ["SBIN"] }] }, undefined, "198.51.100.2");
    assert.notEqual(a, b);
    const ra = (await read(a))!;
    const rb = (await read(b))!;
    assert.deepEqual(ra.watchlist, ["RELIANCE", "TCS"]);
    assert.deepEqual(ra.lists, [{ name: "Banks", symbols: ["HDFCBANK", "IDX NIFTY PVT BANK", "BANKNIFTY"] }, { name: "Fno", symbols: ["ITC", "NIFTY50"] }, { name: "Mine", symbols: ["AAA", "BBB", "CCC"] }]);
    assert.deepEqual(rb.watchlist, ["INFY"]);
    assert.deepEqual(rb.lists, [{ name: "Theirs", symbols: ["ZZZ", "YYY"] }, { name: "Banks", symbols: ["SBIN"] }]); // a list named like the other's is a different list
    for (const mark of ["Theirs", "ZZZ", "YYY", "SBIN", "INFY"]) assert.ok(!JSON.stringify(ra).includes(mark), `A has no trace of ${mark}`);
    for (const mark of ["Mine", "AAA", "IDX NIFTY", "HDFCBANK", "RELIANCE", "TCS", "Fno"]) assert.ok(!JSON.stringify(rb).includes(mark), `B has no trace of ${mark}`);
  });

  it("reordering is kept (the order of a list is its saved order), per guest", async () => {
    const a = await save({ lists: [{ name: "L", symbols: ["C", "A", "B"] }] }, undefined, "198.51.100.1");
    const b = await save({ lists: [{ name: "L", symbols: ["A", "B", "C"] }] }, undefined, "198.51.100.2");
    assert.deepEqual((await read(a))!.lists![0].symbols, ["C", "A", "B"]);
    assert.deepEqual((await read(b))!.lists![0].symbols, ["A", "B", "C"]);
    await save({ lists: [{ name: "L", symbols: ["B", "C", "A"] }] }, a);
    assert.deepEqual((await read(a))!.lists![0].symbols, ["B", "C", "A"]);
    assert.deepEqual((await read(b))!.lists![0].symbols, ["A", "B", "C"]); // B's order did not move
  });

  it("notes, GTT orders and executed orders are the guest's own too", async () => {
    const a = await save({ notes: { RELIANCE: "A's note" }, openOrders: [{ symbol: "RELIANCE", side: "sell", qty: 5, limitPrice: 1400, time: "10:00:00 am", orderType: "GTT", placedDate: "2026-11-11", trigger: "below", placedAtMs: 1_700_000_000_000 }] }, undefined, "198.51.100.1");
    const b = await save({ notes: { TCS: "B's note" } }, undefined, "198.51.100.2");
    const ra = (await read(a))!;
    const rb = (await read(b))!;
    assert.deepEqual(ra.notes, { RELIANCE: "A's note" });
    assert.deepEqual(rb.notes, { TCS: "B's note" });
    assert.equal(ra.openOrders!.length, 1);
    assert.equal(rb.openOrders!.length, 0);
  });
});

describe("what the phone shell saves", () => {
  it("a GTT order keeps its trigger, its side of the price and when it was placed", async () => {
    const a = await save({ openOrders: [{ symbol: "RELIANCE", side: "sell", qty: 5, limitPrice: 1400, time: "10:00:00 am", orderType: "GTT", placedDate: "2026-11-11", trigger: "below", placedAtMs: 1_700_000_123_456 }] });
    const o = (await read(a))!.openOrders![0];
    assert.deepEqual(JSON.parse(JSON.stringify(o)), { symbol: "RELIANCE", side: "sell", qty: 5, limitPrice: 1400, time: "10:00:00 am", orderType: "GTT", placedDate: "2026-11-11", trigger: "below", placedAtMs: 1_700_000_123_456 });
  });
  it("a GTT without a direction or a placement time is dropped, not saved half-made", async () => {
    const base = { symbol: "RELIANCE", side: "sell" as const, qty: 5, limitPrice: 1400, time: "x", orderType: "GTT" as const, placedDate: "2026-11-11" };
    const a = await save({ openOrders: [{ ...base, placedAtMs: 1 }, { ...base, trigger: "sideways" as never, placedAtMs: 1 }, { ...base, trigger: "above" }, { ...base, trigger: "above", placedAtMs: NaN }, { ...base, trigger: "above", placedAtMs: 5 }] });
    assert.equal((await read(a))!.openOrders!.length, 1);
  });
  it("an executed order keeps its fill date and whether it was simulated; a bad date is not saved", async () => {
    const a = await save({ orderLog: [{ id: "1", symbol: "RELIANCE", side: "sell", qty: 5, price: 1400, mode: "market", time: "10:35:00 am", orderType: "GTT", status: "filled", date: "2026-11-11", simulated: true }, { id: "2", symbol: "TCS", side: "buy", qty: 1, price: 4000, mode: "market", time: "x", date: "11/11/2026" }] });
    const log = (await read(a))!.orderLog;
    const gtt = log.find((o) => o.orderType === "GTT")!;
    assert.equal(gtt.date, "2026-11-11");
    assert.equal(gtt.simulated, true);
    const other = log.find((o) => o.symbol === "TCS")!;
    assert.equal(other.date, undefined);
    assert.equal(other.simulated, undefined);
  });
  it("notes: only for a real symbol, trimmed to 500 characters, at most 100, and blank ones are dropped", async () => {
    const many = Object.fromEntries(syms(120, "S").map((s) => [s, "n"]));
    const a = await save({ notes: { RELIANCE: "x".repeat(900), "bad symbol": "no", TCS: "   ", ...many } });
    const notes = (await read(a))!.notes!;
    assert.equal(notes.RELIANCE.length, 500);
    assert.ok(!("bad symbol" in notes));
    assert.ok(!("TCS" in notes));
    assert.ok(Object.keys(notes).length <= 100);
  });
  it("a list holds up to 250 symbols; the rest are dropped; a symbol that is not a symbol is dropped", async () => {
    const a = await save({ lists: [{ name: "Big", symbols: [...syms(260, "S"), "lower", "IDX ", "<x>"] }] });
    const l = (await read(a))!.lists![0];
    assert.equal(l.symbols.length, 250);
    assert.ok(!l.symbols.includes("lower"));
  });
});
