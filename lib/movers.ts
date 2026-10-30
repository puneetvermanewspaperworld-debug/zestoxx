import { fmtIsoDate } from "./helpers";

/** Shapes returned by /api/fno-movers (shared by the server ranking code and the UI). */

export interface StockMover {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  changePct: number;
  volume: number;
  /** traded value, ₹ (ltp × volume) */
  value: number;
  /** F&O lot size, when the stock is in F&O */
  lot?: number;
}

export interface StockMovers {
  gainers: StockMover[];
  losers: StockMover[];
  active: StockMover[];
  /** instruments ranked after the liquidity filter */
  ranked: number;
  /** instruments looked at before filtering */
  scanned: number;
}

export interface FutureMover {
  symbol: string;
  name: string;
  /** YYYY-MM-DD */
  expiry: string;
  ltp: number;
  change: number;
  changePct: number;
  volume: number;
  lot: number;
  isIndex: boolean;
}

export interface FutureMovers {
  gainers: FutureMover[];
  losers: FutureMover[];
  scanned: number;
}

export interface OptionContract {
  symbol: string;
  expiry: string;
  strike: number;
  type: "CE" | "PE";
  ltp: number;
  change: number;
  /** null when the contract has no previous-session price to compare with */
  changePct: number | null;
  volume: number;
  value: number;
  lot: number;
}

export interface OptionMovers {
  /** most-traded contracts by value, already liquidity-filtered */
  contracts: OptionContract[];
  underlyings: string[];
  scanned: number;
}

export type OptionKind = "OPTIDX" | "OPTSTK";

export type MoversResponse<T> =
  | { source: "live"; asOf: string; data: T }
  | { source: "unavailable" };

/**
 * Market-wide equity lists skip penny stocks and thin trading so a ₹2 stock moving 20% on
 * a few lakh rupees can't top the gainers. Shown in the UI so nothing is hidden silently.
 */
export const EQUITY_FILTER = { minPrice: 10, minTurnoverCr: 5 } as const;

/** "NIFTY 03 NOV 22900 CE" */
export function contractLabel(c: Pick<OptionContract, "symbol" | "expiry" | "strike" | "type">): string {
  return `${c.symbol} ${fmtIsoDate(c.expiry, false).toUpperCase()} ${c.strike} ${c.type}`;
}

/** "RELIANCE INDUSTRIES LTD" → "Reliance Industries Ltd" (the master file shouts). */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
