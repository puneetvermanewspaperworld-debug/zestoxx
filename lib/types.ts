import type { OrderStatus, OrderType } from "./orders";

export type AssetType = "stock" | "index" | "crypto";

export interface SymbolInfo {
  id: string;
  name: string;
  type: AssetType;
  base: number;
}

export interface Candle {
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
}

/** A resting limit-style order: a day LIMIT, or a GTD good until `expiryDate`. */
export interface OpenOrder {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  limitPrice: number;
  time: string;
  orderType: "LIMIT" | "GTD";
  /** YYYY-MM-DD (IST) it was placed */
  placedDate: string;
  /** YYYY-MM-DD — GTD only */
  expiryDate?: string;
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

export type Drawing =
  | { type: "hline"; price: number }
  | { type: "trend"; x1: number; y1: number; x2: number; y2: number };

export type LiveSource = Record<string, "live" | "sim">;

export type Timeframe = "D" | "W" | "M";

export interface PulseResult {
  score: number;
  label: "Bullish" | "Bearish" | "Neutral";
  momentum: number;
  rsi: number;
  newsScore: number;
}
