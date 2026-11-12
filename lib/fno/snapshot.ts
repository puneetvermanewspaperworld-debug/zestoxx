import type { IndexPE } from "../indexpe/types";
import type { QuoteLookup } from "./engine";

/**
 * What /api/fno/snapshot returns, and the small helpers both sides of it share.
 *
 * `source` is the honesty field:
 *   live       Upstox answered AND the exchange's own last-update time is under a minute old
 *   delayed    Upstox answered, but the feed hasn't ticked recently (market shut, an exchange holiday, or a
 *              stalled feed) — the numbers are the last ones received
 *   simulated  Upstox didn't answer; every number is generated. Never to be shown as real.
 *
 * "Live" is decided from the feed's timestamp, not the clock, so a holiday or a special session is
 * labelled correctly without keeping a holiday calendar.
 */

export type FnoSource = "live" | "delayed" | "simulated";

export interface FnoLeg {
  ltp: number;
  bid: number | null;
  ask: number | null;
  oi: number;
  /** percent */
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  /** when this contract last traded (ISO); absent or null when the feed didn't say */
  lastTrade?: string | null;
}

export interface FnoStrike {
  strike: number;
  ce: FnoLeg;
  pe: FnoLeg;
}

export interface FnoSnapshot {
  /** when this response was built */
  asOf: string;
  /** the exchange's last update to the underlying (its last trade time); null if the feed didn't say */
  feedAsOf: string | null;
  source: FnoSource;
  underlying: string;
  /** the expiry this chain is for, YYYY-MM-DD */
  expiry: string;
  expiries: string[];
  spot: number;
  /**
   * The index's P/E from NSE's daily close (index underlyings only): the close P/E, the same scaled to the live spot, and the
   * median of the stored history. Absent for stocks, a simulated feed, or when nothing is stored.
   */
  indexPE?: IndexPE | null;
  vix: number | null;
  vixPrevClose: number | null;
  /** share of the past year's daily closes at or below today's VIX, 0–100 */
  vixPercentile: number | null;
  /** at-the-money implied volatility, percent — what the analyzer uses where there is no VIX (stocks) */
  atmIv: number | null;
  lot: number;
  step: number;
  /** total put OI ÷ total call OI */
  pcr: number | null;
  chain: FnoStrike[];
}

/** A feed older than this is no longer "live". */
export const LIVE_MAX_AGE_MS = 60_000;

/**
 * live vs delayed from the feed's own timestamp. No timestamp means freshness can't be shown, which
 * is treated as delayed — never the other way round. A timestamp far in the future is a clock
 * problem, not freshness, and is also delayed.
 */
export function classifySource(feedAsOf: string | null, now: Date = new Date(), maxAgeMs: number = LIVE_MAX_AGE_MS): "live" | "delayed" {
  if (!feedAsOf) return "delayed";
  const t = Date.parse(feedAsOf);
  if (!Number.isFinite(t)) return "delayed";
  const age = now.getTime() - t;
  return age >= -5 * 60_000 && age <= maxAgeMs ? "live" : "delayed";
}

/* ------------------------------------------------------------------ time ---- */

// Market hours, holidays and "the last close" live in lib/market-calendar.ts (NSE's holiday list and
// the Muhurat session). Re-exported so existing imports keep working.
export { isMarketOpen, lastCloseTime } from "../market-calendar";

/** Days from `now` to 15:30 IST on `expiry` (YYYY-MM-DD), as a decimal, never below 0. */
export function daysToExpiry(expiry: string, now: Date = new Date()): number {
  const end = Date.parse(`${expiry}T15:30:00+05:30`);
  return Number.isFinite(end) ? Math.max(0, (end - now.getTime()) / 86_400_000) : 0;
}

/** When an expiry ends: 15:30 IST on its date (ms). */
export const expiryEndMs = (expiry: string): number => Date.parse(`${expiry}T15:30:00+05:30`);

/**
 * The expiries still open at `at` (the feed's last update): those whose 15:30 IST is after it, in order. An expiry that has
 * already ended never appears, so it can neither be the default nor be picked from the list.
 */
export function activeExpiries(expiries: string[], at: Date): string[] {
  return expiries.filter((e) => expiryEndMs(e) > at.getTime());
}

/** True when `expiry` falls on the same Indian calendar day as `at` (so it is the last day of that contract). */
export function expiresToday(expiry: string, at: Date): boolean {
  return new Date(at.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10) === expiry;
}

/** Strike gap: the most common difference between neighbouring strikes. */
export function strikeGap(strikes: number[]): number | null {
  const counts = new Map<number, number>();
  for (let i = 1; i < strikes.length; i++) {
    const d = Math.round((strikes[i] - strikes[i - 1]) * 100) / 100;
    if (d > 0) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best: number | null = null;
  let n = 0;
  for (const [d, c] of counts) if (c > n || (c === n && best != null && d < best)) { best = d; n = c; }
  return best;
}

/* ----------------------------------------------------- price quality ---- */

/** A bid-ask spread wider than this share of the mid makes the price (and the volatility read from it) unreliable. */
export const WIDE_SPREAD = 0.05;
/** A contract whose last trade is this much older than the freshest trade in the chain is treated as stale. */
export const STALE_TRADE_MS = 10 * 60_000;

/** Middle of the bid and ask, when both are there and make sense; else null. */
export function midPrice(l: Pick<FnoLeg, "bid" | "ask">): number | null {
  return l.bid != null && l.ask != null && l.bid > 0 && l.ask >= l.bid ? (l.bid + l.ask) / 2 : null;
}

/** The latest last-trade time in the chain (ms), the yardstick for "old"; null when no contract reported one. */
export function freshestTrade(chain: FnoStrike[]): number | null {
  let best: number | null = null;
  for (const r of chain)
    for (const l of [r.ce, r.pe]) {
      const t = l.lastTrade ? Date.parse(l.lastTrade) : NaN;
      if (Number.isFinite(t) && (best == null || t > best)) best = t;
    }
  return best;
}

/** Why a contract's price is shaky ("" when it isn't). Unknown trade time is never read as stale. */
export function legDoubts(l: FnoLeg, freshestMs: number | null): string[] {
  const out: string[] = [];
  const mid = midPrice(l);
  if (mid == null) out.push("no two-sided bid and ask");
  else if (((l.ask as number) - (l.bid as number)) / mid > WIDE_SPREAD) out.push(`wide bid-ask spread (${((((l.ask as number) - (l.bid as number)) / mid) * 100).toFixed(1)}%)`);
  const t = l.lastTrade ? Date.parse(l.lastTrade) : NaN;
  if (freshestMs != null && Number.isFinite(t) && freshestMs - t > STALE_TRADE_MS) {
    out.push(`last trade ${Math.round((freshestMs - t) / 60_000)} minutes older than the chain's latest`);
  }
  return out;
}

export interface ForwardCheck {
  /** the forward the option prices themselves imply, by put-call parity */
  impliedForward: number;
  /** spot grown at the model's rate and dividend yield */
  modelForward: number;
  /** impliedForward − modelForward, in index points */
  gapPoints: number;
  /** true when the gap is more than rate and dividend error could explain: spot and option prices are out of step */
  outOfSync: boolean;
}

/**
 * Do the index level and the option prices describe the same moment? Put-call parity at the strikes nearest the money
 * gives the forward the options imply; if that is far from spot grown at the model's rate and yield, the spot was read at a
 * different time from the option prices (the market has shut, or a price is stale) and every implied volatility read from
 * them is off, most of all in the money, where delta is large.
 */
export function chainForwardCheck(snap: Pick<FnoSnapshot, "spot" | "chain">, r: number, q: number, dte: number): ForwardCheck | null {
  const T = dte / 365;
  if (!(T > 0) || !(snap.spot > 0)) return null;
  const px = (l: FnoLeg) => midPrice(l) ?? (l.ltp > 0 ? l.ltp : null);
  const ests: number[] = [];
  const near = [...snap.chain].sort((a, b) => Math.abs(a.strike - snap.spot) - Math.abs(b.strike - snap.spot)).slice(0, 5);
  for (const row of near) {
    const c = px(row.ce), p = px(row.pe);
    if (c != null && p != null) ests.push(row.strike + Math.exp(r * T) * (c - p));
  }
  if (ests.length < 2) return null;
  ests.sort((a, b) => a - b);
  const impliedForward = ests[Math.floor(ests.length / 2)];
  const modelForward = snap.spot * Math.exp((r - q) * T);
  const gapPoints = impliedForward - modelForward;
  // 0.1% of spot, plus what a 0.5-point error in the dividend yield could move the forward over this expiry
  const tolerance = snap.spot * (0.001 + 0.005 * T);
  return { impliedForward, modelForward, gapPoints, outOfSync: Math.abs(gapPoints) > tolerance };
}

/**
 * A lookup into the chain for the analyzer. The price is the middle of the bid and ask when both are there (a last trade can be
 * minutes old and can even sit outside the bid-ask), else the last trade. `low` says why the price should be trusted less: a
 * wide spread, no two-sided quote, an old last trade, or (with `ctx`) spot and option prices being out of step. Null if the
 * contract has no price at all.
 */
export function quoteFromSnapshot(snap: FnoSnapshot | null, ctx?: { r: number; q: number; dte: number }): QuoteLookup | undefined {
  if (!snap || snap.source === "simulated") return undefined; // simulated prices are never used as "chain" prices
  const byStrike = new Map(snap.chain.map((r) => [r.strike, r]));
  const freshest = freshestTrade(snap.chain);
  const sync = ctx ? chainForwardCheck(snap, ctx.r, ctx.q, ctx.dte) : null;
  const syncNote = sync?.outOfSync
    ? `index level and option prices are out of step by about ${Math.round(Math.abs(sync.gapPoints))} points, so implied volatility reads wrong (most in the money)`
    : null;
  return (type, strike) => {
    const leg = byStrike.get(strike)?.[type === "CE" ? "ce" : "pe"];
    if (!leg) return null;
    const mid = midPrice(leg);
    const price = mid ?? leg.ltp;
    if (!(price > 0)) return null;
    const doubts = [...legDoubts(leg, freshest), ...(syncNote ? [syncNote] : [])];
    return { ltp: price, iv: leg.iv, basis: mid != null ? "mid" : "last", ...(doubts.length ? { low: doubts.join("; ") } : {}) };
  };
}
