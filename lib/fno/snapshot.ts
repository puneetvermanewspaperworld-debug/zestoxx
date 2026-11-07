import type { QuoteLookup } from "./engine";

/**
 * What /api/fno/snapshot returns, and the small helpers both sides of it share.
 *
 * `source` is the honesty field:
 *   live       Upstox answered while the market is open
 *   delayed    Upstox answered, but the market is shut — these are the last session's closing numbers
 *   simulated  Upstox didn't answer; every number is generated. Never to be shown as real.
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
}

export interface FnoStrike {
  strike: number;
  ce: FnoLeg;
  pe: FnoLeg;
}

export interface FnoSnapshot {
  asOf: string;
  source: FnoSource;
  underlying: string;
  /** the expiry this chain is for, YYYY-MM-DD */
  expiry: string;
  expiries: string[];
  spot: number;
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

/* ------------------------------------------------------------------ time ---- */

const IST_MS = 5.5 * 3_600_000;

/** Indian equity-derivatives hours: weekdays 09:15–15:30 IST. Exchange holidays aren't modelled. */
export function isMarketOpen(now: Date = new Date()): boolean {
  const d = new Date(now.getTime() + IST_MS);
  const day = d.getUTCDay();
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return day >= 1 && day <= 5 && minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

/**
 * The most recent weekday 15:30 IST at or before `now` — when the last session's closing prices were
 * set. Prices read while the market is shut belong to this moment, so time to expiry must be
 * counted from here, not from the wall clock (or implied volatility drifts up over a weekend).
 */
export function lastCloseTime(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_MS);
  let day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const dow = ist.getUTCDay();
  const closedToday = dow >= 1 && dow <= 5 && minutes >= 15 * 60 + 30;
  if (!closedToday) day -= 86_400_000; // today's session hasn't closed yet (or there wasn't one)
  while ([0, 6].includes(new Date(day).getUTCDay())) day -= 86_400_000;
  return new Date(day + (15 * 60 + 30) * 60_000 - IST_MS);
}

/** Days from `now` to 15:30 IST on `expiry` (YYYY-MM-DD), as a decimal, never below 0. */
export function daysToExpiry(expiry: string, now: Date = new Date()): number {
  const end = Date.parse(`${expiry}T15:30:00+05:30`);
  return Number.isFinite(end) ? Math.max(0, (end - now.getTime()) / 86_400_000) : 0;
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

/** A lookup into the chain for the analyzer: last price and the strike's own IV. Null if it didn't trade. */
export function quoteFromSnapshot(snap: FnoSnapshot | null): QuoteLookup | undefined {
  if (!snap || snap.source === "simulated") return undefined; // simulated prices are never used as "chain" prices
  const byStrike = new Map(snap.chain.map((r) => [r.strike, r]));
  return (type, strike) => {
    const leg = byStrike.get(strike)?.[type === "CE" ? "ce" : "pe"];
    return leg && leg.ltp > 0 ? { ltp: leg.ltp, iv: leg.iv } : null;
  };
}
