import { UPSTOX_KEYS, fetchQuotesBatch } from "./upstox";
import { getUniverse } from "./upstox-movers";
import { titleCase } from "./movers";
import { SYMBOL_MAP } from "./symbols";
import { MAX_QUOTE_SYMBOLS, type DynamicQuote } from "./dynamic-symbols";
import { isNseSymbol } from "./watchlists";

/**
 * Quotes and instrument keys for the NSE equities and ETFs the app does not chart on its own. Server-only. The instrument list is the exchange's
 * public one (cached, refreshed daily: see upstox-movers.ts); prices come from one bulk LTP call, so a screenful of symbols is a single request.
 */

/**
 * The Upstox instrument key for a symbol the candle and quote routes may serve: one of the app's own (from its fixed table), or any NSE equity or
 * ETF from the instrument list. Null for crypto, an index id, a malformed id or a symbol that is not listed. The list is only loaded for a
 * symbol the fixed table does not have.
 */
export async function equityKey(symbol: string): Promise<string | null> {
  if (UPSTOX_KEYS[symbol]) return UPSTOX_KEYS[symbol];
  if (SYMBOL_MAP[symbol] || !isNseSymbol(symbol)) return null;
  const u = await getUniverse();
  return u.bySymbol.get(symbol)?.key ?? null;
}

/**
 * The state of each symbol asked for (at most MAX_QUOTE_SYMBOLS): "live" with its price and previous close; "none" when it is listed but has no
 * recent trade (the feed has no last price for it: its price is left out, never guessed); "unknown" when it is not an NSE equity or ETF on the list.
 * Throws when the feed itself cannot be reached.
 */
export async function dynamicQuotes(token: string, symbols: string[]): Promise<Record<string, DynamicQuote>> {
  const asked = [...new Set(symbols)].slice(0, MAX_QUOTE_SYMBOLS);
  const u = await getUniverse();
  const infos = asked.map((s) => ({ s, info: u.bySymbol.get(s) }));
  const quotes = await fetchQuotesBatch(token, infos.flatMap((x) => (x.info ? [x.info.key] : [])));
  const out: Record<string, DynamicQuote> = {};
  for (const { s, info } of infos) {
    if (!info) {
      out[s] = { state: "unknown", prevClose: 0 };
      continue;
    }
    const name = info.shortName ?? titleCase(info.name);
    const q = quotes.get(info.key);
    out[s] = q && q.ltp > 0 ? { state: "live", ltp: q.ltp, prevClose: q.cp > 0 ? q.cp : 0, name } : { state: "none", prevClose: q?.cp && q.cp > 0 ? q.cp : 0, name };
  }
  return out;
}
