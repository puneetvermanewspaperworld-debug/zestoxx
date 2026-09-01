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
