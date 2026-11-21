/**
 * Runs the mobile-shell flows (GTT orders, next-visit simulated fills, symbol notes, several lists and their order) against a REAL Postgres,
 * through the real route handlers and the real Prisma client. A check to run by hand against a throwaway database, not part of `npm test`:
 *
 *   DATABASE_URL=postgresql://user:pw@localhost:5432/scratch DIRECT_URL=<same> npx prisma migrate deploy
 *   DATABASE_URL=... npx tsx --tsconfig tsconfig.json scripts/mobile-shell-db-check.ts
 *
 * Expects a database that had the migrations up to guest_accounts, was seeded with a guest whose cookie is PRE_TOKEN (see PRE_TOKEN below),
 * and then had 20261122000000_gtt_and_notes applied. It refuses to run against any host but localhost, because it writes rows.
 */
import assert from "node:assert/strict";

const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Refusing to run: DATABASE_URL must point at localhost (this script writes rows).");
  process.exit(2);
}
process.env.GUEST_IP_SECRET = "a-server-side-secret-for-hashing-addresses";
/** the cookie of a guest that existed BEFORE the migration (seeded by hand with the old schema) */
const PRE_TOKEN = process.env.PRE_TOKEN ?? "pre-existing-guest-token-0123456789abcdefghijklmnop";

let passed = 0;
const ok = (name: string) => {
  passed++;
  console.log(`  ok  ${name}`);
};

async function main() {
  const { prisma } = await import("../lib/db");
  const portfolio = await import("../app/api/portfolio/route");

  const HOST = "zestoxx.test";
  const req = (method: string, cookie: string | undefined, body?: unknown, ip = "198.51.100.1") =>
    new Request(`https://${HOST}/api/portfolio`, {
      method,
      headers: { host: HOST, "x-forwarded-for": ip, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const read = async (cookie: string) => (await portfolio.GET(req("GET", cookie))).json();
  const write = (cookie: string | undefined, body: unknown, ip?: string) => portfolio.PUT(req("PUT", cookie, body, ip));

  console.log("the migration, on a database that already had data");
  const cols = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>(
    `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
     WHERE (table_name='User' AND column_name='notes') OR (table_name='Order' AND column_name IN ('triggerSide','placedAtMs','simulated')) ORDER BY 1,2`,
  );
  console.log(cols.map((c) => `       ${c.table_name}.${c.column_name} ${c.data_type} null=${c.is_nullable} default=${c.column_default}`).join("\n"));
  assert.equal(cols.length, 4);
  const demo = await prisma.user.findUnique({ where: { email: "demo@zestoxx.local" } });
  assert.equal(demo?.cash, 654321);
  assert.equal(demo?.notes, null);
  assert.equal(await prisma.order.count({ where: { userId: "demo1" } }), 1);
  assert.equal(await prisma.holding.count({ where: { userId: "demo1" } }), 1);
  const olds = await prisma.order.findMany({ where: { userId: "g1" }, orderBy: { id: "asc" } });
  assert.equal(olds.length, 2);
  assert.ok(olds.every((o) => o.triggerSide === null && o.placedAtMs === null && o.simulated === false));
  ok("rows from before are all there; the new columns are null / false on them");

  console.log("a guest from before the migration (the cookie it already has)");
  const COOKIE0 = "zx_guest=" + PRE_TOKEN;
  const b0 = await read(COOKIE0);
  assert.equal(b0.cash, 777777);
  assert.deepEqual(Object.keys(b0.holdings), ["TCS"]);
  assert.equal(b0.openOrders.length, 1);
  assert.equal(b0.openOrders[0].orderType, "LIMIT");
  assert.equal(b0.orderLog.length, 1);
  assert.deepEqual(b0.notes ?? {}, {});
  const resave = await write(COOKIE0, b0);
  assert.equal(resave.status, 200);
  const b0b = await read(COOKIE0);
  assert.deepEqual(b0b.holdings, b0.holdings);
  assert.equal(b0b.openOrders.length, 1);
  assert.equal(b0b.orderLog.length, 1);
  ok("it still loads and saves exactly what it had (cash, holding, an open LIMIT, a filled order)");

  console.log("GTT, notes and lists, written and read back");
  const guestRes = await write(undefined, { watchlist: [], cash: 1_000_000, holdings: {}, orderLog: [], alerts: [] }, "198.51.100.50");
  const A = guestRes.headers.getSetCookie().find((c) => c.startsWith("zx_guest="))!.split(";")[0];
  const B = (await write(undefined, { watchlist: [], cash: 1_000_000, holdings: {}, orderLog: [], alerts: [] }, "198.51.100.51")).headers.getSetCookie().find((c) => c.startsWith("zx_guest="))!.split(";")[0];
  const placedAtMs = Date.UTC(2026, 10, 18, 5, 0, 0);
  const aBlob = {
    watchlist: ["RELIANCE"],
    lists: [
      { name: "Swing", symbols: ["INFY", "TCS", "RELIANCE", "IDX NIFTY IT"] },
      { name: "Long term", symbols: ["HDFCBANK"] },
    ],
    cash: 900_000,
    holdings: { RELIANCE: { qty: 10, avgPrice: 1400 } },
    orderLog: [],
    openOrders: [
      { symbol: "RELIANCE", side: "sell" as const, qty: 10, limitPrice: 1350, time: "10:00:00 AM", orderType: "GTT" as const, placedDate: "2026-11-18", trigger: "below" as const, placedAtMs },
      { symbol: "INFY", side: "buy" as const, qty: 5, limitPrice: 1700, time: "10:05:00 AM", orderType: "GTT" as const, placedDate: "2026-11-18", trigger: "above" as const, placedAtMs },
    ],
    notes: { RELIANCE: "Watch the 1350 level", "IDX NIFTY IT": "sector view", NOPE: "   " },
    alerts: [],
  };
  assert.equal((await write(A, aBlob, "198.51.100.50")).status, 200);
  const ra = await read(A);
  assert.equal(ra.openOrders.length, 2);
  const g = ra.openOrders.find((o: { symbol: string }) => o.symbol === "RELIANCE");
  assert.deepEqual([g.orderType, g.trigger, g.limitPrice, g.placedAtMs, g.side, g.qty], ["GTT", "below", 1350, placedAtMs, "sell", 10]);
  assert.deepEqual(ra.notes, { RELIANCE: "Watch the 1350 level", "IDX NIFTY IT": "sector view" });
  assert.deepEqual(ra.lists.map((l: { name: string }) => l.name), ["Swing", "Long term"]);
  assert.deepEqual(ra.lists[0].symbols, ["INFY", "TCS", "RELIANCE", "IDX NIFTY IT"]);
  ok("a GTT keeps its trigger direction, trigger price and placement time; notes round-trip (a blank one is dropped); lists keep their order and symbols");

  // reorder a list's symbols and the lists themselves
  const moved = { ...ra, lists: [ra.lists[1], { ...ra.lists[0], symbols: ["TCS", "INFY", "RELIANCE", "IDX NIFTY IT"] }] };
  assert.equal((await write(A, moved, "198.51.100.50")).status, 200);
  const rm = await read(A);
  assert.deepEqual(rm.lists.map((l: { name: string }) => l.name), ["Long term", "Swing"]);
  assert.deepEqual(rm.lists[1].symbols, ["TCS", "INFY", "RELIANCE", "IDX NIFTY IT"]);
  ok("moving a symbol within a list and moving a list are both kept across a save and a load");

  console.log("a simulated next-visit fill");
  const filled = {
    ...rm,
    cash: rm.cash + 1350 * 10,
    holdings: {},
    openOrders: rm.openOrders.filter((o: { symbol: string }) => o.symbol !== "RELIANCE"),
    orderLog: [{ id: "f1", symbol: "RELIANCE", side: "sell", qty: 10, price: 1350, mode: "market", time: "11:30:00 AM", orderType: "GTT", status: "filled", date: "2026-11-19", simulated: true }],
  };
  assert.equal((await write(A, filled, "198.51.100.50")).status, 200);
  const rf = await read(A);
  assert.equal(rf.openOrders.length, 1);
  assert.equal(rf.openOrders[0].symbol, "INFY");
  assert.equal(rf.orderLog.length, 1);
  assert.deepEqual([rf.orderLog[0].orderType, rf.orderLog[0].simulated, rf.orderLog[0].date, rf.orderLog[0].price], ["GTT", true, "2026-11-19", 1350]);
  assert.equal(await prisma.order.count({ where: { symbol: "RELIANCE", status: "filled", simulated: true } }), 1);
  assert.equal(Object.keys(rf.holdings).length, 0);
  ok("a catch-up fill is stored as ONE filled, simulated order dated the day it crossed; the open order is gone; the holding is gone");

  // the same fill saved a second time (a second tab, a reload that re-sends the same state) does not create a second order
  assert.equal((await write(A, filled, "198.51.100.50")).status, 200);
  assert.equal((await write(A, filled, "198.51.100.50")).status, 200);
  assert.equal(await prisma.order.count({ where: { user: { tokenHash: { not: null } }, symbol: "RELIANCE", status: "filled", simulated: true } }), 1);
  assert.equal((await read(A)).orderLog.length, 1);
  ok("saving that same state again (a second tab, a reload) leaves exactly one filled order");

  console.log("the caps");
  const many = Array.from({ length: 30 }, (_, i) => ({ symbol: "RELIANCE", side: "buy" as const, qty: 1, limitPrice: 1000 + i, time: "10:00:00 AM", orderType: "GTT" as const, placedDate: "2026-11-18", trigger: "below" as const, placedAtMs }));
  assert.equal((await write(A, { ...rf, openOrders: many }, "198.51.100.50")).status, 200);
  const capped = await read(A);
  assert.ok(capped.openOrders.length <= 20, "open GTT orders are capped at 20: " + capped.openOrders.length);
  ok(`30 open GTT orders sent in one save: ${capped.openOrders.length} kept (cap 20)`);
  const longNote = { ...rf, notes: { TCS: "x".repeat(900) } };
  assert.equal((await write(A, longNote, "198.51.100.50")).status, 200);
  assert.equal((await read(A)).notes.TCS.length, 500);
  ok("a 900-character note is kept to 500");

  console.log("two guests");
  assert.equal((await write(B, { watchlist: [], cash: 5, holdings: {}, orderLog: [], alerts: [], notes: { SBIN: "mine" } }, "198.51.100.51")).status, 200);
  const rb = await read(B);
  const ra2 = await read(A);
  assert.deepEqual(rb.notes, { SBIN: "mine" });
  assert.equal(rb.openOrders?.length ?? 0, 0);
  assert.ok(!JSON.stringify(rb).includes("RELIANCE") && !JSON.stringify(rb).includes("Watch the 1350"));
  assert.ok(!JSON.stringify(ra2).includes("SBIN") && !JSON.stringify(ra2).includes("mine"));
  assert.ok(!JSON.stringify(await read(COOKIE0)).includes("SBIN"));
  assert.equal(await read("zx_guest=" + "A".repeat(43)), null);
  ok("each cookie sees only its own GTT orders, notes and lists; a cookie that matches nobody sees nothing");

  console.log("deleting a guest takes the new columns' rows with it");
  const gone = await prisma.user.findFirst({ where: { tokenHash: { not: null }, email: { startsWith: "guest-" }, cash: 5 } });
  assert.ok(gone);
  await prisma.user.delete({ where: { id: gone.id } });
  assert.equal(await prisma.order.count({ where: { userId: gone.id } }), 0);
  ok("cascade still works");

  console.log(`\n${passed} checks passed against ${url.replace(/:[^:@]*@/, ":***@")}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
