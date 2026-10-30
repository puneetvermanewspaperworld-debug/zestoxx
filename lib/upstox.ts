/**
 * Upstox market data — real NSE/BSE quotes and historical candles for the symbols in
 * lib/symbols.ts. Server-side only: the Analytics Token is a static Bearer credential
 * (long-lived, read-only, no OAuth flow) read from `UPSTOX_ANALYTICS_TOKEN` and must
 * never reach the browser. Called from app/api/market-data/route.ts.
 *
 * Crypto (BTC/ETH/SOL) is not on Upstox and stays on CoinGecko.
 *
 * Docs: https://upstox.com/developer/api-documentation/ltp-v3/
 *       https://upstox.com/developer/api-documentation/get-market-quote-ohlc-v3/
 *       https://upstox.com/developer/api-documentation/get-historical-candle-data-v3/
 */

import type { ChainRow, OptionLeg } from "./options";

const UPSTOX_BASE = "https://api.upstox.com";

/**
 * Upstox instrument keys. Equities are keyed by ISIN, indices by name. Verified live
 * against the LTP endpoint — note Tata Motors trades as "TMPV" post-demerger but its
 * ISIN key is unchanged.
 */
export const UPSTOX_KEYS: Record<string, string> = {
  RELIANCE: "NSE_EQ|INE002A01018",
  TCS: "NSE_EQ|INE467B01029",
  INFY: "NSE_EQ|INE009A01021",
  HDFCBANK: "NSE_EQ|INE040A01034",
  SBIN: "NSE_EQ|INE062A01020",
  TATAMOTORS: "NSE_EQ|INE155A01022",
  NIFTY50: "NSE_INDEX|Nifty 50",
  SENSEX: "BSE_INDEX|SENSEX",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
};

/** instrument_token (as echoed in responses) -> our symbol id */
const KEY_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(UPSTOX_KEYS).map(([sym, key]) => [key, sym])
);

export function upstoxToken(): string | null {
  return process.env.UPSTOX_ANALYTICS_TOKEN?.trim() || null;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

interface LtpEntry {
  last_price?: number;
  instrument_token?: string;
  /** `cp` = previous session's close, used for the day-change calculation. */
  cp?: number;
}

export interface Quote {
  price: number;
  /** Previous close — the reference for "Chg %". 0 when Upstox didn't provide one. */
  prevClose: number;
}

/** Last price + previous close per symbol. Missing symbols simply aren't in the result. */
export async function fetchUpstoxQuotes(token: string): Promise<Record<string, Quote>> {
  const keys = Object.values(UPSTOX_KEYS).join(",");
  const res = await fetch(
    `${UPSTOX_BASE}/v3/market-quote/ltp?instrument_key=${encodeURIComponent(keys)}`,
    { headers: authHeaders(token), next: { revalidate: 10 } }
  );
  if (!res.ok) throw new Error(`upstox ltp ${res.status}`);
  const json = (await res.json()) as { data?: Record<string, LtpEntry> };

  const out: Record<string, Quote> = {};
  // The `data` object is keyed by "EXCHANGE:TRADINGSYMBOL", which doesn't match our
  // ids — map back through each entry's `instrument_token` instead.
  for (const entry of Object.values(json.data ?? {})) {
    const sym = entry.instrument_token ? KEY_TO_SYMBOL[entry.instrument_token] : undefined;
    if (sym && typeof entry.last_price === "number" && entry.last_price > 0) {
      out[sym] = {
        price: entry.last_price,
        prevClose: typeof entry.cp === "number" && entry.cp > 0 ? entry.cp : 0,
      };
    }
  }
  return out;
}

/** Daily candles per symbol as `[epochMs, open, high, low, close, volume]`, oldest first. */
export async function fetchUpstoxHistory(
  token: string,
  calendarDays = 400
): Promise<Record<string, number[][]>> {
  const to = new Date();
  const from = new Date(to.getTime() - calendarDays * 86_400_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);

  const results = await Promise.all(
    Object.entries(UPSTOX_KEYS).map(async ([sym, key]) => {
      try {
        const res = await fetch(
          `${UPSTOX_BASE}/v3/historical-candle/${encodeURIComponent(key)}/days/1/${day(to)}/${day(from)}`,
          { headers: authHeaders(token), next: { revalidate: 3600 } }
        );
        if (!res.ok) return [sym, null] as const;
        const json = (await res.json()) as { data?: { candles?: unknown[][] } };
        const candles = json.data?.candles;
        if (!Array.isArray(candles) || candles.length < 10) return [sym, null] as const;
        // Upstox: newest-first, [tsIso, o, h, l, c, volume, oi]. We want oldest-first.
        const asc = [...candles]
          .reverse()
          .map((c) => [
            Date.parse(c[0] as string),
            Number(c[1]),
            Number(c[2]),
            Number(c[3]),
            Number(c[4]),
            Number(c[5]),
          ]);
        return [sym, asc] as const;
      } catch {
        return [sym, null] as const;
      }
    })
  );

  const out: Record<string, number[][]> = {};
  for (const [sym, candles] of results) if (candles) out[sym] = candles;
  return out;
}

/* ------------------------------------------------------------ option chain ---- */

/**
 * Underlyings the option-chain endpoints accept, keyed by the ids the UI uses.
 * NIFTY / BANKNIFTY / FINNIFTY / MIDCPNIFTY are the four index tabs on the buildup
 * view; the rest alias the symbols in lib/symbols.ts so the Options view can use them.
 */
export const OPTION_UNDERLYINGS: Record<string, string> = {
  ...UPSTOX_KEYS,
  NIFTY: UPSTOX_KEYS.NIFTY50,
  FINNIFTY: "NSE_INDEX|Nifty Fin Service",
  MIDCPNIFTY: "NSE_INDEX|NIFTY MID SELECT",
};

const INDIA_VIX_KEY = "NSE_INDEX|India VIX";

/** Today's date in IST as YYYY-MM-DD — expiries are Indian exchange dates. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

/** Upcoming expiry dates (YYYY-MM-DD, soonest first) that have listed option contracts. */
export async function fetchOptionExpiries(token: string, key: string): Promise<string[]> {
  const res = await fetch(`${UPSTOX_BASE}/v2/option/contract?instrument_key=${encodeURIComponent(key)}`, {
    headers: authHeaders(token),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`upstox option contracts ${res.status}`);
  const json = (await res.json()) as { data?: { expiry?: string }[] };
  const today = istToday();
  const set = new Set<string>();
  for (const c of json.data ?? []) if (c.expiry && c.expiry >= today) set.add(c.expiry);
  return [...set].sort();
}

interface ApiLeg {
  market_data?: {
    ltp?: number;
    close_price?: number;
    oi?: number;
    prev_oi?: number;
    volume?: number;
  };
  option_greeks?: { iv?: number };
}

interface ApiChainRow {
  strike_price?: number;
  underlying_spot_price?: number;
  call_options?: ApiLeg;
  put_options?: ApiLeg;
}

const toLeg = (l?: ApiLeg): OptionLeg => ({
  ltp: num(l?.market_data?.ltp),
  prevClose: num(l?.market_data?.close_price),
  oi: num(l?.market_data?.oi),
  prevOi: num(l?.market_data?.prev_oi),
  volume: num(l?.market_data?.volume),
  iv: num(l?.option_greeks?.iv),
});

/** Full chain for one underlying + expiry, strikes ascending. */
export async function fetchOptionChain(
  token: string,
  key: string,
  expiry: string
): Promise<{ spot: number; rows: ChainRow[] }> {
  const res = await fetch(
    `${UPSTOX_BASE}/v2/option/chain?instrument_key=${encodeURIComponent(key)}&expiry_date=${expiry}`,
    { headers: authHeaders(token), next: { revalidate: 15 } }
  );
  if (!res.ok) throw new Error(`upstox option chain ${res.status}`);
  const json = (await res.json()) as { data?: ApiChainRow[] };
  const data = json.data ?? [];
  const rows: ChainRow[] = data
    .filter((r) => typeof r.strike_price === "number")
    .map((r) => ({ strike: r.strike_price as number, call: toLeg(r.call_options), put: toLeg(r.put_options) }))
    .sort((a, b) => a.strike - b.strike);
  const spot = data.map((r) => num(r.underlying_spot_price)).find((v) => v > 0) ?? 0;
  return { spot, rows };
}

export async function fetchIndiaVix(token: string): Promise<number | null> {
  const res = await fetch(
    `${UPSTOX_BASE}/v3/market-quote/ltp?instrument_key=${encodeURIComponent(INDIA_VIX_KEY)}`,
    { headers: authHeaders(token), next: { revalidate: 30 } }
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Record<string, LtpEntry> };
  const v = Object.values(json.data ?? {})[0]?.last_price;
  return typeof v === "number" && v > 0 ? v : null;
}
