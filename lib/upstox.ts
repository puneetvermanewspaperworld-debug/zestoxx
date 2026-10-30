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
import type { Candle5, ContractQuote, DepthLevel } from "./contract";

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
export function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

interface ApiContract {
  expiry?: string;
  lot_size?: number;
}

/** Listed option contracts for an underlying (cached an hour — the list barely moves intraday). */
async function fetchOptionContracts(token: string, key: string): Promise<ApiContract[]> {
  const res = await fetch(`${UPSTOX_BASE}/v2/option/contract?instrument_key=${encodeURIComponent(key)}`, {
    headers: authHeaders(token),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`upstox option contracts ${res.status}`);
  return ((await res.json()) as { data?: ApiContract[] }).data ?? [];
}

/** Upcoming expiry dates (YYYY-MM-DD, soonest first) that have listed option contracts, and the lot size for each. */
export async function fetchOptionExpiries(
  token: string,
  key: string
): Promise<{ expiries: string[]; lotSizes: Record<string, number> }> {
  const today = istToday();
  const lotSizes: Record<string, number> = {};
  for (const c of await fetchOptionContracts(token, key)) {
    if (c.expiry && c.expiry >= today && num(c.lot_size) > 0) lotSizes[c.expiry] = num(c.lot_size);
  }
  return { expiries: Object.keys(lotSizes).sort(), lotSizes };
}

interface ApiLeg {
  instrument_key?: string;
  market_data?: {
    ltp?: number;
    close_price?: number;
    oi?: number;
    prev_oi?: number;
    volume?: number;
  };
  option_greeks?: { iv?: number; delta?: number; gamma?: number; theta?: number; vega?: number };
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
  key: l?.instrument_key,
  // Only when the feed sent a real number — "0" for a missing Greek would read as a value.
  ...Object.fromEntries(
    (["delta", "gamma", "theta", "vega"] as const)
      .filter((g) => typeof l?.option_greeks?.[g] === "number" && isFinite(l.option_greeks[g] as number))
      .map((g) => [g, l?.option_greeks?.[g]])
  ),
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

/* ------------------------------------------------------------ bulk quotes ---- */

export interface RawQuote {
  ltp: number;
  /** previous close */
  cp: number;
  /** total traded quantity today */
  volume: number;
}

const BATCH = 500; // Upstox's per-call ceiling for market-quote endpoints

/**
 * Last price, previous close and volume for any number of instrument keys (chunked into
 * parallel calls of 500). Keyed by the instrument_token each entry echoes back, because
 * the response object itself is keyed "EXCHANGE:SYMBOL". Never cached: callers dedupe
 * and rate-limit themselves, and these numbers must be fresh.
 */
export async function fetchQuotesBatch(token: string, keys: string[]): Promise<Map<string, RawQuote>> {
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += BATCH) chunks.push(keys.slice(i, i + BATCH));

  const responses = await Promise.all(
    chunks.map(async (chunk) => {
      const res = await fetch(
        `${UPSTOX_BASE}/v3/market-quote/ltp?instrument_key=${encodeURIComponent(chunk.join(","))}`,
        { headers: authHeaders(token), cache: "no-store" }
      );
      if (!res.ok) throw new Error(`upstox bulk ltp ${res.status}`);
      return (await res.json()) as { data?: Record<string, LtpEntry & { volume?: number }> };
    })
  );

  const out = new Map<string, RawQuote>();
  for (const json of responses) {
    for (const e of Object.values(json.data ?? {})) {
      if (!e.instrument_token) continue;
      out.set(e.instrument_token, { ltp: num(e.last_price), cp: num(e.cp), volume: num(e.volume) });
    }
  }
  return out;
}

/* ------------------------------------------------------------ one contract ---- */

/** Only derivative instrument keys are proxied — this isn't a general Upstox passthrough. */
export const isDerivativeKey = (k: string): boolean => /^(NSE_FO|BSE_FO|MCX_FO)\|\d{1,10}$/.test(k);

interface ApiDepthLevel {
  quantity?: number;
  price?: number;
  orders?: number;
}

interface ApiFullQuote {
  ohlc?: { open?: number; high?: number; low?: number };
  depth?: { buy?: ApiDepthLevel[]; sell?: ApiDepthLevel[] };
  last_price?: number;
  net_change?: number;
  volume?: number;
  average_price?: number;
  oi?: number;
  total_buy_quantity?: number;
  total_sell_quantity?: number;
  lower_circuit_limit?: number;
  upper_circuit_limit?: number;
}

const toLevels = (ls?: ApiDepthLevel[]): DepthLevel[] =>
  (ls ?? [])
    .map((l) => ({ qty: num(l.quantity), price: num(l.price), orders: num(l.orders) }))
    .filter((l) => l.price > 0)
    .slice(0, 5);

/**
 * Full quote (OHLC, five-level depth, buy/sell totals) for one derivative contract.
 * Previous close is derived as `last_price - net_change`: the response's own `ohlc.close`
 * tracks the live price intraday rather than yesterday's settlement.
 */
export async function fetchContractQuote(token: string, key: string): Promise<ContractQuote> {
  const res = await fetch(`${UPSTOX_BASE}/v2/market-quote/quotes?instrument_key=${encodeURIComponent(key)}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstox full quote ${res.status}`);
  const json = (await res.json()) as { data?: Record<string, ApiFullQuote & { instrument_token?: string }> };
  const q = Object.values(json.data ?? {})[0];
  if (!q || !(num(q.last_price) > 0)) throw new Error("upstox full quote: empty");

  const ltp = num(q.last_price);
  const change = num(q.net_change);
  const prevClose = ltp - change;
  return {
    source: "live",
    ltp,
    change,
    changePct: prevClose > 0 ? (change / prevClose) * 100 : null,
    open: num(q.ohlc?.open),
    high: num(q.ohlc?.high),
    low: num(q.ohlc?.low),
    prevClose: Math.round(prevClose * 100) / 100,
    bids: toLevels(q.depth?.buy),
    asks: toLevels(q.depth?.sell),
    totalBuyQty: num(q.total_buy_quantity),
    totalSellQty: num(q.total_sell_quantity),
    volume: num(q.volume),
    oi: num(q.oi),
    avgPrice: num(q.average_price),
    lowerCircuit: num(q.lower_circuit_limit),
    upperCircuit: num(q.upper_circuit_limit),
  };
}

/** Today's 5-minute candles for one contract, oldest first. Empty before the first trade. */
export async function fetchContractCandles(token: string, key: string): Promise<Candle5[]> {
  const res = await fetch(
    `${UPSTOX_BASE}/v3/historical-candle/intraday/${encodeURIComponent(key)}/minutes/5`,
    { headers: authHeaders(token), next: { revalidate: 30 } }
  );
  if (!res.ok) throw new Error(`upstox intraday candles ${res.status}`);
  const json = (await res.json()) as { data?: { candles?: (string | number)[][] } };
  return (json.data?.candles ?? [])
    .map((c) => ({ t: String(c[0]), o: num(c[1]), h: num(c[2]), l: num(c[3]), c: num(c[4]), v: num(c[5]) }))
    .reverse();
}
