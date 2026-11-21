import { describe, it, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { createFakePrisma } from "./testing/fake-prisma";
import type { PortfolioBlob } from "./portfolio";

/**
 * Guest accounts, with no database: the routes run against an in-memory stand-in for Prisma (lib/testing/fake-prisma.ts) that enforces the
 * same unique keys and cascades. The point of these tests: two different cookies never see each other's data, through every route that
 * touches user data; a visitor without a cookie gets a fresh account; the old shared demo user is claimed once and then served to nobody.
 */
const fake = createFakePrisma();
(globalThis as unknown as { prisma: unknown }).prisma = fake.db;

type Route = Record<string, (req: Request) => Promise<Response>>;
let portfolio: Route;
let reset: Route;
let claim: Route;
let guest: typeof import("./guest");
let portfolioLib: typeof import("./portfolio");

before(async () => {
  portfolio = (await import("../app/api/portfolio/route")) as unknown as Route;
  reset = (await import("../app/api/account/reset/route")) as unknown as Route;
  claim = (await import("../app/api/account/claim-demo/route")) as unknown as Route;
  guest = await import("./guest");
  portfolioLib = await import("./portfolio");
});

const HOST = "zestoxx.test";
function req(method: string, url: string, o: { cookie?: string; ip?: string; body?: unknown; headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { host: HOST, ...(o.headers ?? {}) };
  if (o.cookie) headers.cookie = o.cookie;
  if (o.ip) headers["x-forwarded-for"] = o.ip;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`https://${HOST}${url}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}
/** the guest cookie a response sets: "zx_guest=<token>" (for the next request), and the whole Set-Cookie line */
function setCookie(res: Response): { header: string; pair: string; token: string } | null {
  const header = res.headers.getSetCookie().find((c) => c.startsWith("zx_guest="));
  if (!header) return null;
  const pair = header.split(";")[0];
  return { header, pair, token: pair.slice("zx_guest=".length) };
}

const blob = (n: number): PortfolioBlob => ({
  watchlist: [`SYM${n}A`, `SYM${n}B`],
  lists: [{ name: `List ${n}`, symbols: [`LST${n}`] }],
  cash: 100_000 * n,
  holdings: { [`HOLD${n}`]: { qty: n, avgPrice: 100 * n } },
  orderLog: [{ id: `o${n}`, symbol: `ORD${n}`, side: "buy", qty: n, price: 10 * n, mode: "market", time: "10:00:00 AM" }],
  openOrders: [{ symbol: `OPEN${n}`, side: "buy", qty: n, limitPrice: 5 * n, time: "10:00:00 AM", orderType: "LIMIT", placedDate: "2026-11-11" }],
  sips: [{ symbol: `SIP${n}`, amount: 1000 * n, frequency: "monthly", nextDate: "2026-12-01", anchorDay: 1, status: "active", installments: 0, createdAt: "1 Nov" }],
  alerts: [{ id: `a${n}`, symbol: `ALR${n}`, condition: "above", target: 100 * n, createdAt: "10:00 AM" }],
});
const blobOf = async (cookie: string, ip = "198.51.100.1"): Promise<PortfolioBlob | null> => (await portfolio.GET(req("GET", "/api/portfolio", { cookie, ip }))).json();
const EMPTY: PortfolioBlob = { watchlist: [], cash: 1_000_000, holdings: {}, orderLog: [], alerts: [] };
/** a new visitor's first write: it makes the guest account and sets the cookie (reading never does) */
async function visitor(ip: string): Promise<string> {
  const res = await portfolio.PUT(req("PUT", "/api/portfolio", { ip, body: EMPTY }));
  assert.equal(res.status, 200);
  const c = setCookie(res);
  assert.ok(c, "a visitor's first write gives them a cookie");
  return c.pair;
}
async function put(cookie: string, b: PortfolioBlob, ip = "198.51.100.1") {
  const res = await portfolio.PUT(req("PUT", "/api/portfolio", { cookie, ip, body: b }));
  assert.equal(res.status, 200);
}

beforeEach(() => {
  for (const t of Object.keys(fake.tables)) fake.tables[t].length = 0;
  delete process.env.DEMO_CLAIM_SECRET;
});

describe("a visitor with no account gets a guest account of their own", () => {
  it("reading never makes an account: a visitor (or a crawler) with no cookie gets the default and nothing is stored", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await portfolio.GET(req("GET", "/api/portfolio", { ip: "198.51.100.7" }));
      assert.equal(res.status, 200);
      assert.equal(await res.json(), null);
      assert.equal(setCookie(res), null);
    }
    assert.equal(fake.tables.user.length, 0);
    assert.equal(fake.tables.guestCreation.length, 0);
    // nor does a reset, which has nothing to reset
    assert.equal((await reset.POST(req("POST", "/api/account/reset", { ip: "198.51.100.7" }))).status, 200);
    assert.equal(fake.tables.user.length, 0);
  });

  it("the first write gets a random token in a secure, httpOnly, 1-year cookie, and a fresh paper account", async () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      const res = await portfolio.PUT(req("PUT", "/api/portfolio", { ip: "198.51.100.7", body: EMPTY }));
      const c = setCookie(res)!;
      assert.match(c.token, /^[A-Za-z0-9_-]{43}$/); // 32 random bytes
      assert.match(c.header, /HttpOnly/i);
      assert.match(c.header, /Secure/i);
      assert.match(c.header, /SameSite=Lax/i);
      assert.match(c.header, /Path=\//);
      assert.match(c.header, new RegExp(`Max-Age=${365 * 24 * 60 * 60}`));
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prev;
    }
    // a fresh account: the standard balance and nothing else; the answer is "nothing saved yet"
    assert.equal(fake.tables.user.length, 1);
    const u = fake.tables.user[0];
    assert.equal(u.kind, "guest");
    assert.equal(u.cash, guest.STARTING_CASH);
    assert.equal(guest.STARTING_CASH, 1_000_000);
    for (const t of ["watchlist", "holding", "order", "alert", "sip"]) assert.equal(fake.tables[t].length, 0, t);
  });

  it("two visitors get two different tokens and two different accounts", async () => {
    const a = await visitor("198.51.100.1");
    const b = await visitor("198.51.100.2");
    assert.notEqual(a, b);
    assert.equal(fake.tables.user.length, 2);
    assert.notEqual(fake.tables.user[0].id, fake.tables.user[1].id);
  });

  it("keeps only a hash of the token: no table holds the cookie's value", async () => {
    const a = await visitor("198.51.100.1");
    const token = a.slice("zx_guest=".length);
    const dump = JSON.stringify(fake.tables);
    assert.ok(!dump.includes(token));
    assert.ok(dump.includes(guest.hashToken(token)));
  });

  it("the same cookie is the same guest: no second account is made", async () => {
    const a = await visitor("198.51.100.1");
    await put(a, blob(1));
    await blobOf(a);
    await blobOf(a);
    assert.equal(fake.tables.user.length, 1);
    assert.equal(fake.tables.guestCreation.length, 1);
  });

  it("a cookie that is not one we issued (garbage, or one character changed) is a new guest, never someone else's account", async () => {
    const a = await visitor("198.51.100.1");
    await put(a, blob(1));
    const tampered = a.slice(0, -1) + (a.endsWith("A") ? "B" : "A");
    for (const cookie of [tampered, "zx_guest=not-a-token", "zx_guest=", "other=1"]) {
      const res = await portfolio.GET(req("GET", "/api/portfolio", { cookie, ip: "198.51.100.9" }));
      assert.equal(await res.json(), null, cookie);
      // a write with it makes an account of its own
      const w = await portfolio.PUT(req("PUT", "/api/portfolio", { cookie, ip: "198.51.100.9", body: blob(9) }));
      const mine = setCookie(w)!;
      assert.ok(mine && mine.pair !== a, "and it gets a cookie of its own");
      assert.equal((await blobOf(mine.pair, "198.51.100.9"))!.cash, 900_000);
    }
    assert.equal((await blobOf(a))!.cash, 100_000);
  });
});

describe("two different cookies never see each other's data", () => {
  it("every part of the account is the guest's own: balance, watchlists, holdings, orders, open orders, SIPs and alerts", async () => {
    const a = await visitor("198.51.100.1");
    const b = await visitor("198.51.100.2");
    await put(a, blob(1));
    await put(b, blob(2), "198.51.100.2");
    const ra = (await blobOf(a))!;
    const rb = (await blobOf(b))!;
    assert.equal(ra.cash, 100_000);
    assert.equal(rb.cash, 200_000);
    assert.deepEqual(ra.watchlist, ["SYM1A", "SYM1B"]);
    assert.deepEqual(rb.watchlist, ["SYM2A", "SYM2B"]);
    assert.deepEqual(ra.lists, [{ name: "List 1", symbols: ["LST1"] }]);
    assert.deepEqual(Object.keys(ra.holdings), ["HOLD1"]);
    assert.deepEqual(Object.keys(rb.holdings), ["HOLD2"]);
    assert.deepEqual(ra.orderLog.map((o) => o.symbol), ["ORD1"]);
    assert.deepEqual(rb.orderLog.map((o) => o.symbol), ["ORD2"]);
    assert.deepEqual(ra.openOrders?.map((o) => o.symbol), ["OPEN1"]);
    assert.deepEqual(rb.openOrders?.map((o) => o.symbol), ["OPEN2"]);
    assert.deepEqual(ra.sips?.map((s) => s.symbol), ["SIP1"]);
    assert.deepEqual(rb.sips?.map((s) => s.symbol), ["SIP2"]);
    assert.deepEqual(ra.alerts.map((x) => x.symbol), ["ALR1"]);
    assert.deepEqual(rb.alerts.map((x) => x.symbol), ["ALR2"]);
    // nothing of one in the other, anywhere in what it was sent
    for (const mark of ["SYM2", "LST2", "List 2", "HOLD2", "ORD2", "OPEN2", "SIP2", "ALR2"]) assert.ok(!JSON.stringify(ra).includes(mark), `A has no trace of B's ${mark}`);
    for (const mark of ["SYM1", "LST1", "List 1", "HOLD1", "ORD1", "OPEN1", "SIP1", "ALR1"]) assert.ok(!JSON.stringify(rb).includes(mark), `B has no trace of A's ${mark}`);
  });

  it("a write with one cookie changes nothing of the other's", async () => {
    const a = await visitor("198.51.100.1");
    const b = await visitor("198.51.100.2");
    await put(a, blob(1));
    await put(b, blob(2), "198.51.100.2");
    const before = JSON.stringify(await blobOf(a));
    await put(b, { ...blob(3), cash: 1 }, "198.51.100.2"); // B rewrites everything
    assert.equal(JSON.stringify(await blobOf(a)), before);
    assert.equal((await blobOf(b))!.cash, 1);
  });

  it("a new visitor sees the default account while another guest has data", async () => {
    const a = await visitor("198.51.100.1");
    await put(a, blob(1));
    assert.equal(await (await portfolio.GET(req("GET", "/api/portfolio", { ip: "198.51.100.2" }))).json(), null);
    const b = await visitor("198.51.100.2");
    assert.equal(await blobOf(b), null); // nothing saved: the browser keeps its defaults
    assert.equal(fake.tables.user[1].cash, 1_000_000);
  });

  it("a request body cannot name another account: the account comes from the cookie only", async () => {
    const a = await visitor("198.51.100.1");
    const b = await visitor("198.51.100.2");
    await put(a, blob(1));
    const [ua, ub] = fake.tables.user;
    // fields that look like ids, in the body and in the query string, are ignored
    const res = await portfolio.PUT(req("PUT", `/api/portfolio?userId=${ua.id}`, { cookie: b, ip: "198.51.100.2", body: { ...blob(2), userId: ua.id, id: ua.id } }));
    assert.equal(res.status, 200);
    assert.equal((await blobOf(a))!.cash, 100_000);
    assert.equal((await blobOf(b))!.cash, 200_000);
    assert.equal(fake.tables.holding.filter((h) => h.userId === ua.id).length, 1);
    assert.equal(fake.tables.holding.filter((h) => h.userId === ub.id).length, 1);
  });

  it("Reset my paper account clears the requesting guest only, and puts the balance back to the standard one", async () => {
    const a = await visitor("198.51.100.1");
    const b = await visitor("198.51.100.2");
    await put(a, blob(1));
    await put(b, blob(2), "198.51.100.2");
    const res = await reset.POST(req("POST", "/api/account/reset", { cookie: b, ip: "198.51.100.2" }));
    assert.equal(res.status, 200);
    assert.equal(await blobOf(b), null);
    const ub = fake.tables.user[1];
    assert.equal(ub.cash, 1_000_000);
    for (const t of ["watchlist", "holding", "order", "alert", "sip"]) assert.equal(fake.tables[t].filter((r) => r.userId === ub.id).length, 0, t);
    assert.deepEqual(Object.keys((await blobOf(a))!.holdings), ["HOLD1"]); // A is as it was
    assert.equal((await blobOf(a))!.cash, 100_000);
  });

  it("Reset with no cookie resets nothing and makes no account", async () => {
    const a = await visitor("198.51.100.1");
    await put(a, blob(1));
    const res = await reset.POST(req("POST", "/api/account/reset", { ip: "198.51.100.5" }));
    assert.equal(res.status, 200);
    assert.equal(fake.tables.user.length, 1);
    assert.equal((await blobOf(a))!.cash, 100_000);
  });

  it("no response is cacheable or shared: private, no-store, and varying by cookie", async () => {
    const a = await visitor("198.51.100.1");
    for (const res of [await portfolio.GET(req("GET", "/api/portfolio", { cookie: a })), await portfolio.PUT(req("PUT", "/api/portfolio", { cookie: a, body: blob(1) })), await reset.POST(req("POST", "/api/account/reset", { cookie: a }))]) {
      assert.match(res.headers.get("cache-control") ?? "", /private/);
      assert.match(res.headers.get("cache-control") ?? "", /no-store/);
      assert.match(res.headers.get("vary") ?? "", /cookie/i);
    }
  });

  it("a write from another site is refused (and the cookie is SameSite=Lax as well)", async () => {
    const a = await visitor("198.51.100.1");
    const res = await portfolio.PUT(req("PUT", "/api/portfolio", { cookie: a, body: blob(1), headers: { origin: "https://evil.example" } }));
    assert.equal(res.status, 403);
    const same = await portfolio.PUT(req("PUT", "/api/portfolio", { cookie: a, body: blob(1), headers: { origin: `https://${HOST}` } }));
    assert.equal(same.status, 200);
    const r2 = await reset.POST(req("POST", "/api/account/reset", { cookie: a, headers: { origin: "https://evil.example" } }));
    assert.equal(r2.status, 403);
  });

  it("an oversized or malformed body is refused, and nothing is stored", async () => {
    const a = await visitor("198.51.100.1");
    const big = await portfolio.PUT(new Request(`https://${HOST}/api/portfolio`, { method: "PUT", headers: { host: HOST, cookie: a }, body: JSON.stringify({ ...blob(1), junk: "x".repeat(portfolioLib.MAX_BODY_BYTES + 1) }) }));
    assert.equal(big.status, 413);
    const bad = await portfolio.PUT(new Request(`https://${HOST}/api/portfolio`, { method: "PUT", headers: { host: HOST, cookie: a }, body: "{nope" }));
    assert.equal(bad.status, 400);
    const arr = await portfolio.PUT(req("PUT", "/api/portfolio", { cookie: a, body: [1, 2] }));
    assert.equal(arr.status, 400);
    assert.equal(await blobOf(a), null);
  });
});

describe("every route: which ones touch user data, and that each gets the user from the cookie", () => {
  const apiDir = path.join(process.cwd(), "app", "api");
  const routes = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? routes(path.join(dir, e.name)) : e.name === "route.ts" ? [path.join(dir, e.name)] : []));
  const rel = (f: string) => path.relative(apiDir, f).replace(/\\/g, "/");
  const all = routes(apiDir).map((f) => ({ name: rel(f), src: fs.readFileSync(f, "utf8") }));

  it("the routes that read or write a user's data are exactly these, and each one uses withGuest (the cookie)", () => {
    const touchUser = all.filter((r) => /withGuest|loadPortfolio|savePortfolio|prisma\.(user|watchlist|holding|order|alert|sip)\b|getCurrentUser/.test(r.src)).map((r) => r.name).sort();
    assert.deepEqual(touchUser, ["account/claim-demo/route.ts", "account/reset/route.ts", "portfolio/route.ts"]);
    for (const r of all.filter((x) => touchUser.includes(x.name))) assert.match(r.src, /withGuest\(/, r.name);
  });

  it("no other route reads the database's user tables, takes a user id from the request, or looks at the cookie", () => {
    const own = new Set(["account/claim-demo/route.ts", "account/reset/route.ts", "portfolio/route.ts"]);
    for (const r of all.filter((x) => !own.has(x.name))) {
      assert.ok(!/prisma\.(user|watchlist|holding|order|alert|sip|guestCreation)\b/.test(r.src), `${r.name} reads user tables`);
      assert.ok(!/cookies\(\)|headers\(\)\.get\("cookie"/.test(r.src), `${r.name} reads cookies`);
      assert.ok(!/searchParams\.get\(["'](userId|user|guest)["']\)/.test(r.src), `${r.name} takes a user id from the query`);
    }
  });

  it("the routes that use the database for something else only touch public tables", () => {
    const dbUsers = all.filter((r) => /@\/lib\/db|prisma/.test(r.src)).map((r) => r.name);
    for (const n of dbUsers) assert.ok(["account/claim-demo/route.ts", "account/reset/route.ts", "portfolio/route.ts", "cron/daily/route.ts", "cron/fiidii/route.ts", "cron/index-pe/route.ts", "fiidii/route.ts"].includes(n) || !/prisma\.(user|watchlist|holding|order|alert|sip)\b/.test(all.find((r) => r.name === n)!.src), n);
  });

  it("nothing but the claim code ever looks the shared demo user up, and getCurrentUser (which served it) is gone", () => {
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".") ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
    for (const root of ["app", "lib", "components"]) {
      for (const f of walk(path.join(process.cwd(), root))) {
        const n = f.replace(/\\/g, "/");
        if (n.endsWith("lib/guest.ts") || n.endsWith("lib/guest.test.ts") || n.endsWith("lib/auth.ts")) continue;
        const src = fs.readFileSync(f, "utf8");
        assert.ok(!/DEMO_USER_EMAIL|demo@zestoxx\.local|getCurrentUser|prisma\.user\.upsert/.test(src), `${n} touches the demo user`);
      }
    }
  });
});

describe("rate-limiting guest creation per network address", () => {
  it(`allows ${"GUEST_CREATES_PER_IP"} new guests from one address in a day, then answers 429 and makes no account`, async () => {
    const ip = "203.0.113.50";
    assert.equal(guest.GUEST_CREATES_PER_IP, 30);
    for (let i = 0; i < guest.GUEST_CREATES_PER_IP; i++) {
      const res = await portfolio.PUT(req("PUT", "/api/portfolio", { ip, body: EMPTY }));
      assert.equal(res.status, 200, `guest ${i + 1}`);
    }
    const users = fake.tables.user.length;
    const res = await portfolio.PUT(req("PUT", "/api/portfolio", { ip, body: blob(1) }));
    assert.equal(res.status, 429);
    assert.ok(res.headers.get("retry-after"));
    assert.equal(setCookie(res), null);
    assert.equal(fake.tables.user.length, users);
    // reading still works (it makes nothing)
    assert.equal((await portfolio.GET(req("GET", "/api/portfolio", { ip }))).status, 200);
    // another address is not affected, and an existing guest keeps working from the limited address
    assert.equal((await portfolio.PUT(req("PUT", "/api/portfolio", { ip: "203.0.113.51", body: EMPTY }))).status, 200);
    const mine = await visitor("203.0.113.52");
    assert.equal((await portfolio.PUT(req("PUT", "/api/portfolio", { ip, cookie: mine, body: blob(2) }))).status, 200);
  });

  it("the limit is for a day: a day later the address can make guests again", async () => {
    const ip = "203.0.113.60";
    const t0 = new Date("2026-11-11T10:00:00Z");
    for (let i = 0; i < guest.GUEST_CREATES_PER_IP; i++) assert.equal((await guest.resolveGuest(req("GET", "/api/portfolio", { ip }), { now: t0 })).ok, true);
    const blocked = await guest.resolveGuest(req("GET", "/api/portfolio", { ip }), { now: new Date(t0.getTime() + 3_600_000) });
    assert.deepEqual(blocked, { ok: false, reason: "rate_limited" });
    // creation records carry real dates: age them
    for (const r of fake.tables.guestCreation) r.createdAt = t0;
    const later = await guest.resolveGuest(req("GET", "/api/portfolio", { ip }), { now: new Date(t0.getTime() + 25 * 3_600_000) });
    assert.equal(later.ok, true);
  });

  it("only a keyed hash of the address is stored: not the address, and not a plain SHA-256 of it either", async () => {
    await portfolio.PUT(req("PUT", "/api/portfolio", { ip: "203.0.113.70", body: EMPTY }));
    const dump = JSON.stringify(fake.tables);
    assert.ok(!dump.includes("203.0.113.70"));
    const plain = createHash("sha256").update("203.0.113.70").digest("hex");
    const plainPrefixed = createHash("sha256").update("zx-guest-ip:203.0.113.70").digest("hex");
    assert.ok(!dump.includes(plain) && !dump.includes(plainPrefixed));
    assert.ok(dump.includes(guest.hashIp("203.0.113.70")));
  });

  it("the hash is an HMAC keyed by GUEST_IP_SECRET: a different secret gives a different hash, the same secret the same one", () => {
    const keep = process.env.GUEST_IP_SECRET;
    try {
      process.env.GUEST_IP_SECRET = "first-server-secret-0123456789";
      const a1 = guest.hashIp("203.0.113.9");
      const a2 = guest.hashIp("203.0.113.9");
      process.env.GUEST_IP_SECRET = "second-server-secret-9876543210";
      const b = guest.hashIp("203.0.113.9");
      assert.equal(a1, a2);
      assert.notEqual(a1, b);
      assert.match(a1, /^[0-9a-f]{64}$/);
      assert.notEqual(guest.hashIp("203.0.113.10"), b);
    } finally {
      if (keep === undefined) delete process.env.GUEST_IP_SECRET;
      else process.env.GUEST_IP_SECRET = keep;
    }
  });

  it("with no secret set (or a short one) it still works, with a key derived from DATABASE_URL, and never falls back to a plain hash", () => {
    const keep = { s: process.env.GUEST_IP_SECRET, d: process.env.DATABASE_URL };
    try {
      delete process.env.GUEST_IP_SECRET;
      process.env.DATABASE_URL = "postgresql://u:pw-one@host/db";
      const one = guest.hashIp("203.0.113.9");
      assert.equal(one, guest.hashIp("203.0.113.9"));
      process.env.GUEST_IP_SECRET = "short"; // under 16 characters: not used
      assert.equal(guest.hashIp("203.0.113.9"), one);
      delete process.env.GUEST_IP_SECRET;
      process.env.DATABASE_URL = "postgresql://u:pw-two@host/db";
      assert.notEqual(guest.hashIp("203.0.113.9"), one);
      delete process.env.DATABASE_URL;
      assert.match(guest.hashIp("203.0.113.9"), /^[0-9a-f]{64}$/);
      assert.notEqual(guest.hashIp("203.0.113.9"), createHash("sha256").update("203.0.113.9").digest("hex"));
    } finally {
      if (keep.s === undefined) delete process.env.GUEST_IP_SECRET;
      else process.env.GUEST_IP_SECRET = keep.s;
      if (keep.d === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = keep.d;
    }
  });

  it("this machine (no address, or loopback) is not limited, so local development and the tests are not locked out", async () => {
    for (let i = 0; i < guest.GUEST_CREATES_PER_IP + 3; i++) assert.equal((await portfolio.PUT(req("PUT", "/api/portfolio", { body: EMPTY }))).status, 200);
    for (let i = 0; i < guest.GUEST_CREATES_PER_IP + 3; i++) assert.equal((await portfolio.PUT(req("PUT", "/api/portfolio", { ip: "127.0.0.1", body: EMPTY }))).status, 200);
  });

  it("the address is the first one in x-forwarded-for", () => {
    assert.equal(guest.clientIp(req("GET", "/", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } })), "203.0.113.9");
    assert.equal(guest.clientIp(req("GET", "/", { headers: { "x-real-ip": "203.0.113.8" } })), "203.0.113.8");
    assert.equal(guest.clientIp(req("GET", "/")), "unknown");
  });
});

describe("guests unseen for 90 days are deleted, inside the existing daily cron", () => {
  const day = 86_400_000;
  const now = new Date("2026-11-21T00:00:00Z");
  it("deletes guests idle over 90 days with all their data, and keeps everyone else", async () => {
    const old = await visitor("198.51.100.1");
    const fresh = await visitor("198.51.100.2");
    const edge = await visitor("198.51.100.3");
    await put(old, blob(1));
    await put(fresh, blob(2), "198.51.100.2");
    await put(edge, blob(3), "198.51.100.3");
    const [uOld, uFresh, uEdge] = fake.tables.user;
    uOld.lastSeenAt = new Date(now.getTime() - 91 * day);
    uFresh.lastSeenAt = new Date(now.getTime() - 1 * day);
    uEdge.lastSeenAt = new Date(now.getTime() - 89 * day);
    // a member idle for years, and the demo user, are never touched
    fake.tables.user.push({ id: "m1", email: "member@example.com", kind: "member", cash: 5, tokenHash: null, lastSeenAt: new Date(now.getTime() - 900 * day), claimedAt: null });
    fake.tables.user.push({ id: "demo", email: guest.DEMO_USER_EMAIL, kind: "member", cash: 5, tokenHash: null, lastSeenAt: new Date(now.getTime() - 900 * day), claimedAt: null });
    const r = await guest.purgeInactiveGuests(now);
    assert.equal(r.guests, 1);
    assert.deepEqual(fake.tables.user.map((u) => u.id).sort(), [uFresh.id, uEdge.id, "m1", "demo"].sort());
    for (const t of ["watchlist", "holding", "order", "alert", "sip"]) assert.ok(fake.tables[t].every((x) => x.userId !== uOld.id), `${t} of the deleted guest are gone`);
    assert.ok(fake.tables.holding.some((x) => x.userId === uFresh.id));
    // the deleted guest's cookie now makes a new, empty account
    const res = await portfolio.GET(req("GET", "/api/portfolio", { cookie: old, ip: "198.51.100.1" }));
    assert.equal(await res.json(), null);
  });

  it("clears guest-creation records older than 7 days, and keeps newer ones", async () => {
    fake.tables.guestCreation.push(
      { id: "old", ipHash: "x", createdAt: new Date(now.getTime() - 8 * day) },
      { id: "week", ipHash: "z", createdAt: new Date(now.getTime() - 6.9 * day) },
      { id: "new", ipHash: "y", createdAt: new Date(now.getTime() - 1 * day) }
    );
    const r = await guest.purgeInactiveGuests(now);
    assert.equal(r.creations, 1);
    assert.deepEqual(fake.tables.guestCreation.map((x) => x.id).sort(), ["new", "week"]);
    assert.equal(guest.GUEST_CREATION_KEEP_DAYS, 7);
  });

  it("a guest seen again is kept: using the account moves lastSeenAt forward (at most once a day)", async () => {
    const a = await visitor("198.51.100.1");
    const u = fake.tables.user[0];
    u.lastSeenAt = new Date(Date.now() - 80 * day);
    const res = await portfolio.GET(req("GET", "/api/portfolio", { cookie: a }));
    assert.ok(Date.now() - (u.lastSeenAt as Date).getTime() < 60_000);
    assert.equal(setCookie(res)?.pair, a, "and the one-year cookie is renewed with the same token");
    const again = await portfolio.GET(req("GET", "/api/portfolio", { cookie: a }));
    assert.equal(setCookie(again), null, "not renewed again the same day");
  });

  it("runs inside the existing daily cron: vercel.json still has exactly its two entries, both for /api/cron/daily, and the route calls the cleanup", () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    assert.equal(vercel.crons.length, 2);
    assert.ok(vercel.crons.every((c) => c.path === "/api/cron/daily"));
    const src = fs.readFileSync(path.join(process.cwd(), "app", "api", "cron", "daily", "route.ts"), "utf8");
    assert.match(src, /purgeInactiveGuests\(/);
  });
});

describe("claiming the old shared demo data, once, with a secret", () => {
  const SECRET = "a-long-random-secret-for-the-claim-route-123456";
  const seedDemo = () => {
    fake.tables.user.push({ id: "demo", email: guest.DEMO_USER_EMAIL, kind: "member", cash: 777_000, tokenHash: null, lastSeenAt: new Date(), claimedAt: null });
    fake.tables.watchlist.push({ id: "dw", userId: "demo", listName: "My Watchlist", symbol: "RELIANCE", position: 0 });
    fake.tables.holding.push({ id: "dh", userId: "demo", symbol: "RELIANCE", qty: 10, avgPrice: 1400 });
    fake.tables.order.push({ id: "do", userId: "demo", symbol: "RELIANCE", side: "buy", mode: "market", orderType: "MARKET", qty: 10, price: 1400, status: "filled", timeLabel: "10:00:00 AM", placedAt: new Date() });
    fake.tables.alert.push({ id: "da", userId: "demo", symbol: "TCS", condition: "above", target: 4500, createdAtLabel: "x", createdAt: new Date() });
    fake.tables.sip.push({ id: "ds", userId: "demo", symbol: "INFY", amount: 5000, frequency: "monthly", nextDate: "2026-12-01", anchorDay: 1, status: "active", installments: 2, createdLabel: "x", position: 0 });
  };
  const call = (cookie: string | undefined, secret: string | null, body?: unknown, ip = "198.51.100.1") => claim.POST(req("POST", "/api/account/claim-demo", { cookie, ip, body, headers: secret === null ? {} : { authorization: `Bearer ${secret}` } }));
  afterEach(() => {
    delete process.env.DEMO_CLAIM_SECRET;
  });

  it("is off without the secret in the environment (or with a short one), and refuses a wrong secret", async () => {
    seedDemo();
    const mine = await visitor("198.51.100.1");
    assert.equal((await call(mine, SECRET)).status, 404); // not configured
    process.env.DEMO_CLAIM_SECRET = "short";
    assert.equal((await call(mine, "short")).status, 404);
    process.env.DEMO_CLAIM_SECRET = SECRET;
    assert.equal((await call(mine, null)).status, 401);
    assert.equal((await call(mine, "wrong")).status, 401);
    assert.equal((await call(mine, SECRET + "x")).status, 401);
    assert.equal(fake.tables.user.find((u) => u.id === "demo")!.claimedAt, null);
    assert.equal(await blobOf(mine), null);
  });

  it("moves the demo user's balance and data to the caller's cookie, and to no one else's", async () => {
    seedDemo();
    process.env.DEMO_CLAIM_SECRET = SECRET;
    const other = await visitor("198.51.100.9");
    const mine = await visitor("198.51.100.1");
    const res = await call(mine, SECRET);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { result: "claimed" });
    const m = (await blobOf(mine))!;
    assert.equal(m.cash, 777_000);
    assert.deepEqual(m.watchlist, ["RELIANCE"]);
    assert.deepEqual(m.holdings, { RELIANCE: { qty: 10, avgPrice: 1400 } });
    assert.equal(m.orderLog.length, 1);
    assert.equal(m.alerts.length, 1);
    assert.equal(m.sips?.length, 1);
    // the other visitor sees nothing of it
    assert.equal(await blobOf(other), null);
    assert.equal(fake.tables.user.find((u) => u.id !== "demo" && u.tokenHash === guest.hashToken(other.slice("zx_guest=".length)))!.cash, 1_000_000);
  });

  it("afterwards the shared demo user is empty, marked claimed, and nobody can read it", async () => {
    seedDemo();
    process.env.DEMO_CLAIM_SECRET = SECRET;
    const mine = await visitor("198.51.100.1");
    await call(mine, SECRET);
    const demo = fake.tables.user.find((u) => u.id === "demo")!;
    assert.ok(demo.claimedAt instanceof Date);
    assert.equal(demo.cash, 1_000_000);
    for (const t of ["watchlist", "holding", "order", "alert", "sip"]) assert.equal(fake.tables[t].filter((r) => r.userId === "demo").length, 0, t);
    assert.equal(await portfolioLib.loadPortfolio("demo"), null);
    // no cookie can ever resolve to it: it has no token, and a request without a valid one gets a new guest
    assert.equal(demo.tokenHash, null);
    for (const cookie of [undefined, "zx_guest=" + "A".repeat(43)]) {
      const r = await guest.resolveGuest(req("GET", "/api/portfolio", { cookie, ip: "198.51.100.33" }));
      assert.ok(r.ok && r.user.id !== "demo");
    }
    // and it cannot be claimed a second time, by anyone
    const second = await visitor("198.51.100.2");
    assert.equal((await call(second, SECRET)).status, 410);
    assert.equal(await blobOf(second), null);
  });

  it("does not overwrite a guest that already has data, unless told to", async () => {
    seedDemo();
    process.env.DEMO_CLAIM_SECRET = SECRET;
    const mine = await visitor("198.51.100.1");
    await put(mine, blob(1));
    assert.equal((await call(mine, SECRET)).status, 409);
    assert.equal((await blobOf(mine))!.cash, 100_000);
    assert.equal(fake.tables.user.find((u) => u.id === "demo")!.claimedAt, null);
    assert.equal((await call(mine, SECRET, { replace: true })).status, 200);
    const m = (await blobOf(mine))!;
    assert.equal(m.cash, 777_000);
    assert.deepEqual(Object.keys(m.holdings), ["RELIANCE"]);
  });

  it("says so when there is no demo user", async () => {
    process.env.DEMO_CLAIM_SECRET = SECRET;
    const mine = await visitor("198.51.100.1");
    assert.equal((await call(mine, SECRET)).status, 404);
  });
});

describe("a later sign-up adopts a guest account", () => {
  it("the same account becomes a member's, with everything it has, and the old cookie stops working", async () => {
    const a = await visitor("198.51.100.1");
    await put(a, blob(1));
    const before = fake.tables.user[0];
    const id = before.id;
    const adopted = await guest.adoptGuest(id as string, { email: "me@example.com", name: "Me" });
    assert.equal(adopted.id, id);
    assert.equal(adopted.kind, "member");
    assert.equal(adopted.email, "me@example.com");
    assert.equal(adopted.tokenHash, null);
    // its data is untouched, still under the same id
    const kept = (await portfolioLib.loadPortfolio(id as string))!;
    assert.equal(kept.cash, 100_000);
    assert.deepEqual(Object.keys(kept.holdings), ["HOLD1"]);
    // the guest cookie no longer opens it (a sign-in session would), and the cleanup never deletes a member
    assert.equal(await blobOf(a), null);
    adopted.lastSeenAt = new Date(0);
    fake.tables.user.find((u) => u.id === id)!.lastSeenAt = new Date(0);
    await guest.purgeInactiveGuests(new Date());
    assert.ok(fake.tables.user.some((u) => u.id === id));
  });

  it("refuses an email that already belongs to an account", async () => {
    const a = await visitor("198.51.100.1");
    const b = await visitor("198.51.100.2");
    void b;
    await guest.adoptGuest(fake.tables.user[0].id as string, { email: "taken@example.com" });
    await assert.rejects(() => guest.adoptGuest(fake.tables.user[1].id as string, { email: "taken@example.com" }));
    void a;
  });
});

describe("cookie parsing", () => {
  it("reads only a token shaped like the ones we issue, from among other cookies", () => {
    const token = guest.newToken();
    assert.equal(guest.cookieToken(req("GET", "/", { cookie: `a=1; zx_guest=${token}; b=2` })), token);
    assert.equal(guest.cookieToken(req("GET", "/", { cookie: "zx_guest=short" })), null);
    assert.equal(guest.cookieToken(req("GET", "/", { cookie: `zx_guestx=${token}` })), null);
    assert.equal(guest.cookieToken(req("GET", "/")), null);
    assert.notEqual(guest.newToken(), guest.newToken());
    assert.match(guest.hashToken(token), /^[0-9a-f]{64}$/);
  });
});

describe("a database without the guest-account columns (a preview, which does not run migrations)", () => {
  type Db = { user: Record<string, unknown>; guestCreation: Record<string, unknown> };
  const db = fake.db as unknown as Db;
  const missing = (code: string) => Object.assign(new Error(`The column \`User.tokenHash\` does not exist in the current database.`), { code, name: "PrismaClientKnownRequestError" });
  let saved: { findUnique: unknown; count: unknown; create: unknown };
  beforeEach(() => {
    saved = { findUnique: db.user.findUnique, count: db.guestCreation.count, create: db.user.create };
    db.user.create = async () => {
      throw missing("P2022");
    };
    db.user.findUnique = async () => {
      throw missing("P2022");
    };
    db.guestCreation.count = async () => {
      throw missing("P2021");
    };
  });
  afterEach(() => {
    db.user.findUnique = saved.findUnique;
    db.guestCreation.count = saved.count;
    db.user.create = saved.create;
  });

  it("reading shows the default account and does not crash, with or without a cookie", async () => {
    const withCookie = await portfolio.GET(req("GET", "/api/portfolio", { cookie: "zx_guest=" + "A".repeat(43), ip: "198.51.100.1" }));
    assert.equal(withCookie.status, 200);
    assert.equal(await withCookie.json(), null);
    assert.equal(withCookie.headers.get("x-guest-storage"), "unavailable");
    const without = await portfolio.GET(req("GET", "/api/portfolio", { ip: "198.51.100.1" }));
    assert.equal(without.status, 200);
    assert.equal(await without.json(), null);
  });

  it("writing does not crash and saves nothing (503, with a message), and sets no cookie", async () => {
    const res = await portfolio.PUT(req("PUT", "/api/portfolio", { ip: "198.51.100.1", body: blob(1) }));
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("x-guest-storage"), "unavailable");
    assert.equal(setCookie(res), null);
    assert.match(((await res.json()) as { error: string }).error, /not available/);
    for (const t of Object.keys(fake.tables)) assert.equal(fake.tables[t].length, 0, t);
  });

  it("a reset and a claim do not crash either, and never fall back to a shared account", async () => {
    const r = await reset.POST(req("POST", "/api/account/reset", { cookie: "zx_guest=" + "A".repeat(43) }));
    assert.equal(r.status, 503);
    process.env.DEMO_CLAIM_SECRET = "a-long-random-secret-for-the-claim-route-123456";
    const c = await claim.POST(req("POST", "/api/account/claim-demo", { headers: { authorization: "Bearer a-long-random-secret-for-the-claim-route-123456" } }));
    assert.equal(c.status, 503);
    assert.equal(fake.tables.user.length, 0);
  });

  it("any other database error is still an error (500), not hidden as an unavailable account", async () => {
    db.user.findUnique = async () => {
      throw new Error("connection refused");
    };
    const res = await portfolio.GET(req("GET", "/api/portfolio", { cookie: "zx_guest=" + "A".repeat(43) }));
    assert.equal(res.status, 500);
    assert.equal(guest.schemaMissing(new Error("connection refused")), false);
    assert.equal(guest.schemaMissing(missing("P2022")), true);
    assert.equal(guest.schemaMissing(Object.assign(new Error("x"), { code: "P2021" })), true);
  });
});

describe("two browsers claiming the demo data", () => {
  const SECRET = "a-long-random-secret-for-the-claim-route-123456";
  beforeEach(() => {
    process.env.DEMO_CLAIM_SECRET = SECRET;
    fake.tables.user.push({ id: "demo", email: guest.DEMO_USER_EMAIL, kind: "member", cash: 777_000, tokenHash: null, lastSeenAt: new Date(), claimedAt: null });
    fake.tables.holding.push({ id: "dh", userId: "demo", symbol: "RELIANCE", qty: 10, avgPrice: 1400 });
  });
  afterEach(() => {
    delete process.env.DEMO_CLAIM_SECRET;
  });
  const claimAs = (cookie: string, ip: string) => claim.POST(req("POST", "/api/account/claim-demo", { cookie, ip, headers: { authorization: `Bearer ${SECRET}` } }));

  it("the first to claim gets everything; the second is told it is already claimed and gets nothing", async () => {
    const phone = await visitor("198.51.100.1");
    const laptop = await visitor("198.51.100.2");
    assert.equal((await claimAs(phone, "198.51.100.1")).status, 200);
    assert.equal((await claimAs(laptop, "198.51.100.2")).status, 410);
    assert.equal((await blobOf(phone))!.cash, 777_000);
    assert.equal(await blobOf(laptop), null);
  });

  it("at the same moment, exactly one of them wins and the other gets none of it (not half of it)", async () => {
    const phone = await visitor("198.51.100.1");
    const laptop = await visitor("198.51.100.2");
    const [a, b] = await Promise.all([claimAs(phone, "198.51.100.1"), claimAs(laptop, "198.51.100.2")]);
    assert.deepEqual([a.status, b.status].sort(), [200, 410]);
    const [winner, loser] = a.status === 200 ? [phone, laptop] : [laptop, phone];
    assert.equal((await blobOf(winner))!.cash, 777_000);
    assert.deepEqual(Object.keys((await blobOf(winner))!.holdings), ["RELIANCE"]);
    assert.equal(await blobOf(loser), null);
    assert.equal(fake.tables.user.find((u) => u.id === loser.slice(0))?.cash ?? 1_000_000, 1_000_000);
    assert.equal(fake.tables.holding.filter((h) => h.symbol === "RELIANCE").length, 1);
  });
});

describe("the /claim page", () => {
  const dir = path.join(process.cwd(), "app", "claim");
  const page = fs.readFileSync(path.join(dir, "page.tsx"), "utf8");
  const form = fs.readFileSync(path.join(dir, "ClaimForm.tsx"), "utf8");
  it("exists only while DEMO_CLAIM_SECRET is set: without it the page has no form", () => {
    assert.match(page, /process\.env\.DEMO_CLAIM_SECRET/);
    assert.match(page, /force-dynamic/);
    assert.match(page, /enabled \? \(\s*<ClaimForm/);
    assert.match(page, /robots: \{ index: false/);
  });
  it("a password field posts to the claim route with the secret in a header: never in a URL, a query string or storage", () => {
    assert.match(form, /type="password"/);
    assert.match(form, /"\/api\/account\/claim-demo"/);
    assert.match(form, /authorization: `Bearer \$\{secret\}`/);
    assert.ok(!/searchParams|location\.|\?secret|localStorage|sessionStorage|document\.cookie/.test(form + page));
    assert.ok(!/useSearchParams/.test(form + page));
  });
  it("says what happened for every answer the route gives", () => {
    for (const code of ["401", "404", "409", "410", "429", "503"]) assert.match(form, new RegExp(`${code}:`));
    assert.match(form, /claim-success/);
    assert.match(form, /claim-error/);
  });
});
