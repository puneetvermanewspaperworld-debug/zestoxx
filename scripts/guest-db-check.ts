/**
 * Runs the guest-account flows against a REAL Postgres, through the real route handlers and the real Prisma client. It is a check to run by
 * hand against a throwaway database, not part of `npm test` (which uses an in-memory stand-in and needs no database):
 *
 *   DATABASE_URL=postgresql://user:pw@localhost:5432/scratch DIRECT_URL=<same> npx prisma migrate deploy
 *   DATABASE_URL=... npx tsx --tsconfig tsconfig.json scripts/guest-db-check.ts
 *
 * Expects the database to have the migrations applied and a "demo@zestoxx.local" user with some data (the shared user before guest
 * accounts), which it claims. It refuses to run against any host but localhost, because it writes and deletes rows.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Refusing to run: DATABASE_URL must point at localhost (this script writes and deletes rows).");
  process.exit(2);
}
process.env.DEMO_CLAIM_SECRET = "a-long-random-secret-for-the-claim-route-123456";
process.env.GUEST_IP_SECRET = "a-server-side-secret-for-hashing-addresses";

let passed = 0;
const ok = (name: string) => {
  passed++;
  console.log(`  ok  ${name}`);
};

async function main() {
  const { prisma } = await import("../lib/db");
  const portfolio = await import("../app/api/portfolio/route");
  const reset = await import("../app/api/account/reset/route");
  const claim = await import("../app/api/account/claim-demo/route");
  const guest = await import("../lib/guest");
  const lib = await import("../lib/portfolio");

  const HOST = "zestoxx.test";
  const req = (method: string, p: string, o: { cookie?: string; ip?: string; body?: unknown; auth?: string } = {}) =>
    new Request(`https://${HOST}${p}`, {
      method,
      headers: { host: HOST, ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.ip ? { "x-forwarded-for": o.ip } : {}), ...(o.body !== undefined ? { "content-type": "application/json" } : {}), ...(o.auth ? { authorization: `Bearer ${o.auth}` } : {}) },
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    });
  const cookieOf = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("zx_guest="));
  const blob = (n: number) => ({
    watchlist: [`SYM${n}`],
    lists: [{ name: `L${n}`, symbols: [`LST${n}`] }],
    cash: 100_000 * n,
    holdings: { [`HOLD${n}`]: { qty: n, avgPrice: 10 * n } },
    orderLog: [{ id: `o${n}`, symbol: `ORD${n}`, side: "buy" as const, qty: n, price: 5, mode: "market" as const, time: "10:00:00 AM" }],
    openOrders: [{ symbol: `OPN${n}`, side: "buy" as const, qty: n, limitPrice: 5, time: "10:00:00 AM", orderType: "LIMIT" as const, placedDate: "2026-11-11" }],
    sips: [{ symbol: `SIP${n}`, amount: 1000, frequency: "monthly" as const, nextDate: "2026-12-01", anchorDay: 1, status: "active" as const, installments: 0, createdAt: "x" }],
    alerts: [{ id: `a${n}`, symbol: `ALR${n}`, condition: "above" as const, target: 10, createdAt: "x" }],
  });
  const read = async (cookie: string) => (await portfolio.GET(req("GET", "/api/portfolio", { cookie }))).json();
  const write = (cookie: string | undefined, body: unknown, ip = "198.51.100.1") => portfolio.PUT(req("PUT", "/api/portfolio", { cookie, ip, body }));
  const EMPTY = { watchlist: [], cash: 1_000_000, holdings: {}, orderLog: [], alerts: [] };
  const newGuest = async (ip: string) => cookieOf(await write(undefined, EMPTY, ip))!.split(";")[0];

  console.log("the migration, on a database that already had data");
  const demo = await prisma.user.findUnique({ where: { email: guest.DEMO_USER_EMAIL } });
  assert.ok(demo, "the demo user is still there");
  assert.equal(demo.kind, "member");
  assert.equal(demo.tokenHash, null);
  assert.equal(demo.claimedAt, null);
  assert.ok(demo.lastSeenAt instanceof Date);
  const demoCounts = await Promise.all([prisma.watchlist.count({ where: { userId: demo.id } }), prisma.holding.count({ where: { userId: demo.id } }), prisma.order.count({ where: { userId: demo.id } }), prisma.alert.count({ where: { userId: demo.id } }), prisma.sip.count({ where: { userId: demo.id } })]);
  assert.ok(demoCounts.every((n) => n > 0), "the demo user's rows are all still there: " + demoCounts);
  ok("existing rows are intact, with kind = member and the new columns defaulted");
  const usersBefore = await prisma.user.count();

  console.log("a visitor with no cookie");
  for (let i = 0; i < 3; i++) {
    const res = await portfolio.GET(req("GET", "/api/portfolio", { ip: "198.51.100.5" }));
    assert.equal(res.status, 200);
    assert.equal(await res.json(), null);
    assert.equal(cookieOf(res), undefined);
  }
  assert.equal(await prisma.user.count(), usersBefore);
  assert.equal(await prisma.guestCreation.count({ where: { ipHash: guest.hashIp("198.51.100.5") } }), 0);
  ok("reading makes no account, sets no cookie, stores nothing");

  const first = await write(undefined, blob(1), "198.51.100.10");
  assert.equal(first.status, 200);
  const setCookie = first.headers.getSetCookie().find((c) => c.startsWith("zx_guest="))!;
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Max-Age=31536000/);
  const A = setCookie.split(";")[0];
  const B = await newGuest("198.51.100.11");
  assert.notEqual(A, B);
  ok("the first write makes a guest account and sets an httpOnly, SameSite=Lax, 1-year cookie");

  const aUser = await prisma.user.findFirst({ where: { tokenHash: createHash("sha256").update(A.slice("zx_guest=".length)).digest("hex") } });
  assert.ok(aUser && aUser.kind === "guest" && aUser.email.endsWith("@guest.zestoxx.local"));
  const cols = JSON.stringify(await prisma.user.findMany());
  assert.ok(!cols.includes(A.slice("zx_guest=".length)), "the raw token is stored nowhere");
  ok("only the token's SHA-256 is in the database");

  await write(B, blob(2), "198.51.100.11");
  const ra = await read(A);
  const rb = await read(B);
  assert.equal(ra.cash, 100_000);
  assert.equal(rb.cash, 200_000);
  assert.deepEqual(Object.keys(ra.holdings), ["HOLD1"]);
  assert.deepEqual(Object.keys(rb.holdings), ["HOLD2"]);
  for (const mark of ["SYM2", "L2", "HOLD2", "ORD2", "OPN2", "SIP2", "ALR2"]) assert.ok(!JSON.stringify(ra).includes(mark), mark);
  for (const mark of ["SYM1", "L1", "HOLD1", "ORD1", "OPN1", "SIP1", "ALR1"]) assert.ok(!JSON.stringify(rb).includes(mark), mark);
  assert.equal(await read("zx_guest=" + "A".repeat(43)), null);
  ok("two cookies never see each other's data (balance, watchlists, holdings, orders, open orders, SIPs, alerts)");
  const demoNow = await prisma.user.findUnique({ where: { email: guest.DEMO_USER_EMAIL } });
  assert.equal(demoNow?.cash, 654321);
  ok("neither can read the demo user's data");

  console.log("reset");
  assert.equal((await reset.POST(req("POST", "/api/account/reset", { cookie: B }))).status, 200);
  assert.equal(await read(B), null);
  assert.equal((await prisma.user.findFirst({ where: { tokenHash: createHash("sha256").update(B.slice("zx_guest=".length)).digest("hex") } }))?.cash, 1_000_000);
  assert.equal((await read(A)).cash, 100_000);
  ok("Reset my paper account clears the caller only and restores the starting balance");

  console.log("rate limit");
  const ip = "203.0.113.200";
  for (let i = 0; i < guest.GUEST_CREATES_PER_IP; i++) assert.equal((await write(undefined, EMPTY, ip)).status, 200);
  assert.equal((await write(undefined, EMPTY, ip)).status, 429);
  assert.equal(await prisma.guestCreation.count({ where: { ipHash: guest.hashIp(ip) } }), guest.GUEST_CREATES_PER_IP);
  assert.equal((await write(undefined, EMPTY, "203.0.113.201")).status, 200);
  const stored = JSON.stringify(await prisma.guestCreation.findMany());
  assert.ok(!stored.includes(ip) && !stored.includes(createHash("sha256").update(ip).digest("hex")));
  ok(`the ${guest.GUEST_CREATES_PER_IP + 1}th guest from one address gets 429; another address is fine; only an HMAC of the address is stored`);

  console.log("claiming the demo data from two browsers at once");
  const C = await newGuest("198.51.100.20");
  const D = await newGuest("198.51.100.21");
  const call = (cookie: string) => claim.POST(req("POST", "/api/account/claim-demo", { cookie, auth: process.env.DEMO_CLAIM_SECRET }));
  assert.equal((await claim.POST(req("POST", "/api/account/claim-demo", { cookie: C, auth: "wrong" }))).status, 401);
  const [rc, rd] = await Promise.all([call(C), call(D)]);
  assert.deepEqual([rc.status, rd.status].sort(), [200, 410]);
  const [winner, loser] = rc.status === 200 ? [C, D] : [D, C];
  const w = await read(winner);
  assert.equal(w.cash, 654321);
  assert.deepEqual(Object.keys(w.holdings), ["RELIANCE"]);
  assert.equal(w.alerts.length, 1);
  assert.equal(w.sips.length, 1);
  assert.equal(await read(loser), null);
  const demoAfter = await prisma.user.findUnique({ where: { email: guest.DEMO_USER_EMAIL } });
  assert.ok(demoAfter?.claimedAt);
  assert.equal(demoAfter?.cash, 1_000_000);
  assert.equal(await lib.loadPortfolio(demoAfter!.id), null);
  assert.equal((await call(await newGuest("198.51.100.22"))).status, 410);
  ok("exactly one browser wins the claim and gets all of it; the other gets 410 and nothing; the demo user is left empty and claimed");

  console.log("the 90-day cleanup, with real foreign keys");
  const old = await newGuest("198.51.100.30");
  await write(old, blob(3), "198.51.100.30");
  const oldUser = (await prisma.user.findFirst({ where: { tokenHash: createHash("sha256").update(old.slice("zx_guest=".length)).digest("hex") } }))!;
  await prisma.user.update({ where: { id: oldUser.id }, data: { lastSeenAt: new Date(Date.now() - 91 * 86_400_000) } });
  await prisma.guestCreation.create({ data: { ipHash: "old-ip", createdAt: new Date(Date.now() - 8 * 86_400_000) } });
  await prisma.guestCreation.create({ data: { ipHash: "new-ip", createdAt: new Date(Date.now() - 6 * 86_400_000) } });
  const member = await prisma.user.create({ data: { email: "member@example.com", kind: "member", lastSeenAt: new Date(0) } });
  const r = await guest.purgeInactiveGuests();
  assert.ok(r.guests >= 1 && r.creations >= 1);
  assert.equal(await prisma.user.findUnique({ where: { id: oldUser.id } }), null);
  for (const t of [prisma.watchlist, prisma.holding, prisma.order, prisma.alert, prisma.sip] as unknown as { count: (a: unknown) => Promise<number> }[]) assert.equal(await t.count({ where: { userId: oldUser.id } }), 0);
  assert.ok(await prisma.user.findUnique({ where: { id: member.id } }), "a member idle for years is kept");
  assert.ok(await prisma.user.findUnique({ where: { email: guest.DEMO_USER_EMAIL } }), "and so is the demo user");
  assert.equal(await prisma.guestCreation.count({ where: { ipHash: "old-ip" } }), 0);
  assert.equal(await prisma.guestCreation.count({ where: { ipHash: "new-ip" } }), 1);
  assert.equal(await read(old), null);
  ok("a guest unseen for 91 days is deleted with all its rows (cascade); members, the demo user and a 6-day-old creation record stay; an 8-day-old one goes");

  console.log("adoption by a later sign-up");
  const adopt = await newGuest("198.51.100.40");
  await write(adopt, blob(4), "198.51.100.40");
  const au = (await prisma.user.findFirst({ where: { tokenHash: createHash("sha256").update(adopt.slice("zx_guest=".length)).digest("hex") } }))!;
  const adopted = await guest.adoptGuest(au.id, { email: "adopter@example.com", name: "A" });
  assert.equal(adopted.id, au.id);
  assert.equal(adopted.kind, "member");
  assert.equal(adopted.tokenHash, null);
  assert.equal((await lib.loadPortfolio(au.id))!.cash, 400_000);
  const someGuest = (await prisma.user.findFirst({ where: { kind: "guest" } }))!;
  await assert.rejects(() => guest.adoptGuest(someGuest.id, { email: "adopter@example.com" }));
  ok("a guest account becomes a member's with its data intact; a duplicate email is refused by the database");

  console.log(`\n${passed} checks passed against ${url.replace(/:[^:@]*@/, ":***@")}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
