import type { OrderStatus, OrderType } from "./orders";

export type AssetType = "stock" | "index" | "crypto";

export interface SymbolInfo {
  id: string;
  name: string;
  type: AssetType;
  base: number;
}

export interface Candle {
  /** the bar's day as seconds since the epoch at 00:00 UTC of its calendar date (IST date for Indian symbols, UTC date for crypto); absent on simulated bars, which are given dates only when charted */
  t?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  h: string;
  src: string;
  tag: string;
  sentiment: "bullish" | "bearish" | "neutral";
  t: string;
}

export interface Holding {
  qty: number;
  avgPrice: number;
}

export type Holdings = Record<string, Holding>;

/** A finished order: filled, or cancelled/expired before it ever filled. */
export interface OrderLogEntry {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  /** fill price; for cancelled/expired orders this is the limit price it never reached */
  price: number;
  mode: "market" | "limit";
  time: string;
  /** absent on entries saved before order types existed — read as MARKET (or LIMIT when mode is limit) */
  orderType?: OrderType;
  status?: OrderStatus;
  expiryDate?: string;
  /** YYYY-MM-DD (IST) it was filled (absent on entries saved before dates were kept: they count as settled) */
  date?: string;
  /** a GTT or stop-loss filled from candles on a later visit, at the first candle that crossed the trigger (not watched live) */
  simulated?: boolean;
}

/** A resting order: a day LIMIT, a GTD good until `expiryDate`, or a GTT / stop-loss waiting for its trigger (lib/gtt.ts). */
export interface OpenOrder {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  limitPrice: number;
  time: string;
  orderType: "LIMIT" | "GTD" | "GTT";
  /** YYYY-MM-DD (IST) it was placed */
  placedDate: string;
  /** YYYY-MM-DD — GTD only */
  expiryDate?: string;
  /** GTT only: `limitPrice` is the trigger, and the price has to reach it from this side */
  trigger?: "above" | "below";
  /** GTT only: when it was placed (epoch ms), so the next visit knows which candles to look at */
  placedAtMs?: number;
}

export interface PriceAlert {
  id: number;
  symbol: string;
  condition: "above" | "below";
  target: number;
  createdAt: string;
}

export interface Toast {
  id: number;
  text: string;
}

export type LiveSource = Record<string, "live" | "sim">;

export type Timeframe = "D" | "W" | "M";

export interface PulseResult {
  score: number;
  label: "Bullish" | "Bearish" | "Neutral";
  momentum: number;
  rsi: number;
  /** what the score is built from, in words */
  basis: string;
}
