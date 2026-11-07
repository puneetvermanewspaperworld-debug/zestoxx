import {
  OPTION_UNDERLYINGS,
  fetchIndiaVixQuote,
  fetchOptionChain,
  fetchOptionExpiries,
  fetchVixCloses,
} from "./upstox";
import { memoized } from "./upstox-movers";
import { chainStats, simulateChain, type ChainRow, type OptionLeg } from "./options";
import { UNDERLYINGS, lotFallback } from "./fno/lots";
import { isMarketOpen, strikeGap, type FnoLeg, type FnoSnapshot } from "./fno/snapshot";

/**
 * One call's worth of everything the F&O analyzer needs for an underlying + expiry. Server-only.
 * A single option-chain request carries spot, per-strike prices, OI, IV and Greeks; the lot size
 * comes from the contract list that is already fetched for expiries; VIX is one quote plus one
 * daily-candle history (cached, it only changes once a day).
 */

const VIX_HISTORY_TTL = 6 * 3_600_000;

const leg = (l: OptionLeg): FnoLeg => ({
  ltp: l.ltp,
  bid: l.bid ?? null,
  ask: l.ask ?? null,
  oi: l.oi,
  iv: l.iv > 0 ? l.iv : null,
  delta: l.delta ?? null,
  gamma: l.gamma ?? null,
  theta: l.theta ?? null,
  vega: l.vega ?? null,
});

const toStrikes = (rows: ChainRow[]) => rows.map((r) => ({ strike: r.strike, ce: leg(r.call), pe: leg(r.put) }));

/** Where today's VIX sits among the past year's daily closes, 0–100. */
export function percentileOf(value: number, closes: number[]): number | null {
  if (closes.length < 30) return null;
  return (closes.filter((c) => c <= value).length / closes.length) * 100;
}

export async function liveSnapshot(token: string, underlying: string, expiry: string | null): Promise<FnoSnapshot | null> {
  const key = OPTION_UNDERLYINGS[underlying];
  if (!key) return null;
  const { expiries, lotSizes } = await fetchOptionExpiries(token, key);
  const exp = expiry && expiries.includes(expiry) ? expiry : expiries[0];
  if (!exp) return null;

  const [chain, vixQuote, closes] = await Promise.all([
    fetchOptionChain(token, key, exp),
    fetchIndiaVixQuote(token).catch(() => null),
    memoized("fno:vix-closes", VIX_HISTORY_TTL, () => fetchVixCloses(token)).catch(() => [] as number[]),
  ]);
  if (chain.rows.length === 0 || chain.spot <= 0) return null;

  const stats = chainStats(chain.rows, chain.spot);
  return {
    asOf: new Date().toISOString(),
    source: isMarketOpen() ? "live" : "delayed",
    underlying,
    expiry: exp,
    expiries,
    spot: chain.spot,
    vix: vixQuote?.ltp ?? null,
    vixPrevClose: vixQuote?.prevClose ?? null,
    vixPercentile: vixQuote ? percentileOf(vixQuote.ltp, closes) : null,
    atmIv: stats?.atmIv ?? null,
    lot: lotSizes[exp] ?? lotFallback(underlying),
    step: strikeGap(chain.rows.map((r) => r.strike)) ?? UNDERLYINGS[underlying]?.step ?? 1,
    pcr: stats?.pcr ?? null,
    chain: toStrikes(chain.rows),
  };
}

/** Generated numbers for when Upstox isn't answering — always labelled `simulated`. */
export function simulatedSnapshot(underlying: string, expiry: string | null): FnoSnapshot | null {
  const info = UNDERLYINGS[underlying];
  if (!info) return null;
  const c = simulateChain(underlying, info.sampleSpot, expiry);
  const stats = chainStats(c.rows, c.spot);
  return {
    asOf: new Date().toISOString(),
    source: "simulated",
    underlying,
    expiry: c.expiry,
    expiries: c.expiries,
    spot: c.spot,
    vix: c.vix,
    vixPrevClose: null,
    vixPercentile: null,
    atmIv: stats?.atmIv ?? null,
    lot: info.lot,
    step: strikeGap(c.rows.map((r) => r.strike)) ?? info.step,
    pcr: stats?.pcr ?? null,
    chain: toStrikes(c.rows),
  };
}
