import { SYMBOL_MAP } from "./symbols";
import type { SymbolInfo } from "./types";
import { isNseSymbol } from "./watchlists";

/**
 * Any NSE equity or ETF from Upstox's instrument list can be charted, quoted and paper-traded, not only the twelve the app was built around
 * (lib/symbols.ts). The twelve keep their own live feed and history; every other trading symbol is a "dynamic" one: its quote and candles are
 * fetched on demand, and nothing about it is ever simulated or invented.
 */

/** At most this many symbols in one quote request, and in the set the app keeps polling at any time. */
export const MAX_QUOTE_SYMBOLS = 25;

/** An NSE trading symbol the app does not chart on its own (the twelve in SYMBOL_MAP are not dynamic). */
export const isDynamicEquity = (id: string): boolean => !SYMBOL_MAP[id] && isNseSymbol(id);

/** Whether paper orders, alerts and GTT orders can be placed on this id: the app's own twelve, or any NSE trading symbol. */
export const isTradableId = (id: string): boolean => !!SYMBOL_MAP[id] || isNseSymbol(id);

/** What the feed said about a dynamic symbol when last asked. */
export type QuoteState = "live" | "none" | "unknown";

export interface DynamicQuote {
  state: QuoteState;
  /** last traded price; only for "live" */
  ltp?: number;
  /** previous close, 0 when the feed did not give one */
  prevClose: number;
  /** the instrument's name from the exchange's list, when it is known */
  name?: string;
}

/** The symbol's info for the app's screens: the charted one, or a stock with the name the instrument list gave (the symbol itself until it is known). */
export const infoFor = (id: string, name?: string): SymbolInfo => SYMBOL_MAP[id] ?? { id, name: name || id, type: "stock", base: 0 };

export const NO_RECENT_TRADES = "No recent trades";
export const NO_TRADES_NOTE = "No recent trades in this symbol, so there is no live price to fill an order at. Zestoxx never makes a price up: buying and selling are off until it trades again.";
