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

export interface OrderLogEntry {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  mode: "market" | "limit";
  time: string;
}

export interface OpenOrder {
  id: number;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  limitPrice: number;
  time: string;
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
