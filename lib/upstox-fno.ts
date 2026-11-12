import {
  OPTION_UNDERLYINGS,
  fetchIndiaVixQuote,
  fetchLastTradeTime,
  fetchLastTradeTimes,
  fetchOptionChain,
  fetchOptionExpiries,
  fetchVixCloses,
} from "./upstox";
import { memoized } from "./upstox-movers";
import { chainStats, simulateChain, type ChainRow, type OptionLeg } from "./options";
import { UNDERLYINGS, lotFallback } from "./fno/lots";
import { activeExpiries, classifySource, strikeGap, type FnoLeg, type FnoSnapshot } from "./fno/snapshot";

/**
 * One call's worth of everything the F&O analyzer needs for an underlying + expiry. Server-only.
 * A single option-chain request carries spot, per-strike prices, OI, IV and Greeks; the lot size
 * comes from the contract list that is already fetched for expiries; VIX is one quote plus one
 * daily-candle history (cached, it only changes once a day).
 */

const VIX_HISTORY_TTL = 6 * 3_600_000;
const TRADE_TIMES_TTL = 20_000;

const leg = (l: OptionLeg, times: Record<string, string> = {}): FnoLeg => ({
  ltp: l.ltp,
  bid: l.bid ?? null,
  ask: l.ask ?? null,
  oi: l.oi,
  iv: l.iv > 0 ? l.iv : null,
  delta: l.delta ?? null,
  gamma: l.gamma ?? null,
  theta: l.theta ?? null,
  vega: l.vega ?? null,
  lastTrade: (l.key && times[l.key]) || null,
});

const toStrikes = (rows: ChainRow[], times: Record<string, string> = {}) =>
  rows.map((r) => ({ strike: r.strike, ce: leg(r.call, times), pe: leg(r.put, times) }));

/** Where today's VIX sits among the past year's daily closes, 0–100. */
export function percentileOf(value: number, closes: number[]): number | null {
  if (closes.length < 30) return null;
  return (closes.filter((c) => c <= value).length / closes.length) * 100;
}

export async function liveSnapshot(token: string, underlying: string, expiry: string | null): Promise<FnoSnapshot | null> {
  const key = OPTION_UNDERLYINGS[underlying];
  if (!key) return null;
  // The feed's last update decides what has expired: an expiry whose 15:30 IST is not after it is over, even while the
  // exchange still lists it (after the close on expiry day, or on the morning after).
  const [{ expiries: listed, lotSizes }, lastUpdate] = await Promise.all([fetchOptionExpiries(token, key), fetchLastTradeTime(token, key).catch(() => null)]);
  const expiries = activeExpiries(listed, lastUpdate ? new Date(lastUpdate) : new Date());
  const exp = expiry && expiries.includes(expiry) ? expiry : expiries[0];
  if (!exp) return null;

  const feedAsOf = lastUpdate;
  const [chain, vixQuote, closes] = await Promise.all([
    fetchOptionChain(token, key, exp),
    fetchIndiaVixQuote(token).catch(() => null),
    memoized("fno:vix-closes", VIX_HISTORY_TTL, () => fetchVixCloses(token)).catch(() => [] as number[]),
  ]);
  if (chain.rows.length === 0 || chain.spot <= 0) return null;

  // When each option last traded, to tell a stale last price from a live one. Cached a little, since it is one
  // extra request per 100 contracts; an unanswered request just means "unknown".
  const keys = chain.rows.flatMap((r) => [r.call.key, r.put.key]).filter((k): k is string => !!k);
  const times = await memoized(`fno:trade-times:${underlying}:${exp}`, TRADE_TIMES_TTL, () => fetchLastTradeTimes(token, keys)).catch(() => ({}) as Record<string, string>);

  const stats = chainStats(chain.rows, chain.spot);
  return {
    asOf: new Date().toISOString(),
    feedAsOf,
    source: classifySource(feedAsOf),
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
    chain: toStrikes(chain.rows, times),
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
    feedAsOf: null,
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
