import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Guest accounts. Until real sign-up exists, every visitor who has no account gets a guest account of their own: a random token in an
 * httpOnly cookie, and a fresh paper account (the standard starting balance, no holdings, orders, alerts, SIPs or watchlists). Everything
 * that belongs to a user in the database (the User row with its balance, and the Watchlist, Holding, Order, Alert and Sip rows) hangs off
 * that guest's User id, and every route that reads or writes it gets the id from the cookie, through `withGuest` below and nowhere else.
 *
 * The cookie holds the token; the database holds only its SHA-256, so a leaked database does not hand out sessions.
 *
 * A later sign-up adopts a guest account with `adoptGuest`: it gives the same User row an email and a name, makes it a member and clears
 * the token, so everything the guest did carries over and nothing is copied.
 */
export const GUEST_COOKIE = "zx_guest";
export const GUEST_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
/** The standard starting balance of a paper account, in rupees. The same number is the column default in prisma/schema.prisma. */
export const STARTING_CASH = 1_000_000;
/** Guests not seen for this many days are deleted by the daily cron. */
export const GUEST_IDLE_DAYS = 90;
/** Guest accounts one network address may create in GUEST_WINDOW_HOURS. */
export const GUEST_CREATES_PER_IP = 10;
export const GUEST_WINDOW_HOURS = 24;
/** The shared user every visitor used before guest accounts. Only the one-time claim route ever looks it up. */
export const DEMO_USER_EMAIL = "demo@zestoxx.local";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export const newToken = (): string => randomBytes(32).toString("base64url");
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
const hashIp = (ip: string): string => createHash("sha256").update(`zx-guest-ip:${ip}`).digest("hex");

/** The guest token in the request's Cookie header, or null (also when it is not shaped like one we issue). */
export function cookieToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0 || part.slice(0, i).trim() !== GUEST_COOKIE) continue;
    const v = part.slice(i + 1).trim();
    return TOKEN_SHAPE.test(v) ? v : null;
  }
  return null;
}

/** The visitor's network address as the platform reports it (Vercel sets x-forwarded-for), or "unknown". */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || request.headers.get("x-real-ip")?.trim() || "unknown";
}
const LOOPBACK = new Set(["unknown", "127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export type GuestResult = { ok: true; user: User; setToken?: string } | { ok: false; reason: "rate_limited" | "no_guest" };

/**
 * The guest account for this request. With a valid cookie it is that guest's. Without one a new guest is created (`create: true`), unless
 * this network address already made GUEST_CREATES_PER_IP guests in the last GUEST_WINDOW_HOURS. `setToken` is the token to put in the
 * cookie: a new guest's, or the existing one again when the 1-year cookie is being renewed (at most once a day).
 */
export async function resolveGuest(request: Request, opts: { create?: boolean; now?: Date } = {}): Promise<GuestResult> {
  const { create = true, now = new Date() } = opts;
  const token = cookieToken(request);
  if (token) {
    const user = await prisma.user.findUnique({ where: { tokenHash: hashToken(token) } });
    if (user) {
      if (now.getTime() - user.lastSeenAt.getTime() < DAY_MS) return { ok: true, user };
      const renewed = await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: now } });
      return { ok: true, user: renewed, setToken: token };
    }
  }
  if (!create) return { ok: false, reason: "no_guest" };

  const ip = clientIp(request);
  const ipHash = hashIp(ip);
  if (!LOOPBACK.has(ip)) {
    const recent = await prisma.guestCreation.count({ where: { ipHash, createdAt: { gte: new Date(now.getTime() - GUEST_WINDOW_HOURS * 3_600_000) } } });
    if (recent >= GUEST_CREATES_PER_IP) return { ok: false, reason: "rate_limited" };
  }
  const fresh = newToken();
  await prisma.guestCreation.create({ data: { ipHash } });
  const user = await prisma.user.create({
    data: { email: `guest-${randomBytes(12).toString("hex")}@guest.zestoxx.local`, name: "Guest", kind: "guest", tokenHash: hashToken(fresh), lastSeenAt: now },
  });
  return { ok: true, user, setToken: fresh };
}

export function setGuestCookie(response: NextResponse, token: string): void {
  response.cookies.set(GUEST_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: GUEST_COOKIE_MAX_AGE });
}

/** A request from another site (the Origin header names a different host than the one asked). Cookies are SameSite=Lax as well. */
export function crossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    return true;
  }
}

/**
 * Run a route handler as the request's guest. Responses are never cached and vary by cookie, so no cache can hand one guest's data to
 * another. A network address over its guest-creation limit gets 429.
 */
export async function withGuest(request: Request, fn: (user: User) => Promise<NextResponse>, opts: { create?: boolean } = {}): Promise<NextResponse> {
  if (request.method !== "GET" && crossSite(request)) return NextResponse.json({ error: "cross-site request refused" }, { status: 403 });
  const g = await resolveGuest(request, opts);
  let res: NextResponse;
  if (!g.ok) res = g.reason === "rate_limited" ? NextResponse.json({ error: "too many new guest accounts from this network, try again later" }, { status: 429, headers: { "Retry-After": "3600" } }) : NextResponse.json(null);
  else {
    res = await fn(g.user);
    if (g.setToken) setGuestCookie(res, g.setToken);
  }
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Vary", "Cookie");
  return res;
}

/* ------------------------------------------------------------------ account actions ---- */

/** "Reset my paper account": the standard balance and nothing else, for this guest only. */
export async function resetGuestAccount(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.watchlist.deleteMany({ where: { userId } }),
    prisma.holding.deleteMany({ where: { userId } }),
    prisma.order.deleteMany({ where: { userId } }),
    prisma.alert.deleteMany({ where: { userId } }),
    prisma.sip.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { cash: STARTING_CASH } }),
  ]);
}

/** The daily cleanup: guests unseen for GUEST_IDLE_DAYS (their data goes with them, by cascade) and old guest-creation records. */
export async function purgeInactiveGuests(now: Date = new Date()): Promise<{ guests: number; creations: number }> {
  const guests = await prisma.user.deleteMany({ where: { kind: "guest", lastSeenAt: { lt: new Date(now.getTime() - GUEST_IDLE_DAYS * DAY_MS) } } });
  const creations = await prisma.guestCreation.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 2 * DAY_MS) } } });
  return { guests: guests.count, creations: creations.count };
}

/**
 * What a later sign-up does with the visitor's guest account: it becomes the member's account (same User row, so the cash, holdings,
 * orders, alerts, SIPs and watchlists carry over untouched). Throws if the email already belongs to someone.
 */
export async function adoptGuest(userId: string, member: { email: string; name?: string | null }): Promise<User> {
  return prisma.user.update({ where: { id: userId }, data: { email: member.email, name: member.name ?? null, kind: "member", tokenHash: null } });
}

export type ClaimResult = "claimed" | "no_demo_user" | "already_claimed" | "guest_has_data";

/**
 * One-time: move the old shared demo user's data (balance, watchlists, holdings, orders, alerts, SIPs) into this guest account. The demo
 * user is marked claimed and left with nothing; no route ever serves it, so nobody else can read it either. A guest that already has data
 * is not overwritten unless `replace` is set.
 */
export async function claimDemoData(guestId: string, opts: { replace?: boolean; now?: Date } = {}): Promise<ClaimResult> {
  const now = opts.now ?? new Date();
  const demo = await prisma.user.findUnique({ where: { email: DEMO_USER_EMAIL } });
  if (!demo) return "no_demo_user";
  if (demo.claimedAt) return "already_claimed";
  if (demo.id === guestId) return "already_claimed";
  const [w, h, o, a, s] = await Promise.all([
    prisma.watchlist.count({ where: { userId: guestId } }),
    prisma.holding.count({ where: { userId: guestId } }),
    prisma.order.count({ where: { userId: guestId } }),
    prisma.alert.count({ where: { userId: guestId } }),
    prisma.sip.count({ where: { userId: guestId } }),
  ]);
  const hasData = w + h + o + a + s > 0;
  if (hasData && !opts.replace) return "guest_has_data";
  const from = { userId: demo.id };
  await prisma.$transaction([
    prisma.watchlist.deleteMany({ where: { userId: guestId } }),
    prisma.holding.deleteMany({ where: { userId: guestId } }),
    prisma.order.deleteMany({ where: { userId: guestId } }),
    prisma.alert.deleteMany({ where: { userId: guestId } }),
    prisma.sip.deleteMany({ where: { userId: guestId } }),
    prisma.watchlist.updateMany({ where: from, data: { userId: guestId } }),
    prisma.holding.updateMany({ where: from, data: { userId: guestId } }),
    prisma.order.updateMany({ where: from, data: { userId: guestId } }),
    prisma.alert.updateMany({ where: from, data: { userId: guestId } }),
    prisma.sip.updateMany({ where: from, data: { userId: guestId } }),
    prisma.user.update({ where: { id: guestId }, data: { cash: demo.cash } }),
    prisma.user.update({ where: { id: demo.id }, data: { cash: STARTING_CASH, claimedAt: now } }),
  ]);
  return "claimed";
}

/** Whether `given` equals the configured claim secret (constant time). A secret under 24 characters counts as not configured. */
export function claimSecretMatches(given: string | null): boolean {
  const secret = process.env.DEMO_CLAIM_SECRET;
  if (!secret || secret.length < 24 || !given) return false;
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}
