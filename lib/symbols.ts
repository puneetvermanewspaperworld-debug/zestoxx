import type { SymbolInfo, NewsItem, AssetType } from "./types";

export const SYMBOLS: SymbolInfo[] = [
  { id: "RELIANCE", name: "Reliance Industries", type: "stock", base: 2932.15 },
  { id: "TCS", name: "Tata Consultancy Svcs", type: "stock", base: 4128.6 },
  { id: "INFY", name: "Infosys", type: "stock", base: 1842.3 },
  { id: "HDFCBANK", name: "HDFC Bank", type: "stock", base: 1678.9 },
  { id: "SBIN", name: "State Bank of India", type: "stock", base: 812.45 },
  { id: "TATAMOTORS", name: "Tata Motors", type: "stock", base: 968.2 },
  { id: "NIFTY50", name: "Nifty 50 Index", type: "index", base: 24812.35 },
  { id: "SENSEX", name: "BSE Sensex", type: "index", base: 81420.1 },
  { id: "BANKNIFTY", name: "Bank Nifty", type: "index", base: 51230.4 },
  { id: "BTC", name: "Bitcoin", type: "crypto", base: 98560 },
  { id: "ETH", name: "Ethereum", type: "crypto", base: 3125 },
  { id: "SOL", name: "Solana", type: "crypto", base: 178.4 },
];

export const SYMBOL_MAP: Record<string, SymbolInfo> = Object.fromEntries(
  SYMBOLS.map((s) => [s.id, s])
);

export const VOL: Record<AssetType, number> = { stock: 0.006, index: 0.003, crypto: 0.016 };

export const EXPIRIES = ["25 Sep 2026", "30 Oct 2026", "27 Nov 2026"];

export const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
};

export const NEWS: NewsItem[] = [
  { h: "RBI holds repo rate steady, signals watchful stance on inflation", src: "Market Desk", tag: "NIFTY50", sentiment: "neutral", t: "2h ago" },
  { h: "IT majors rally as Q2 earnings beat street estimates on deal wins", src: "Bourse Wire", tag: "TCS", sentiment: "bullish", t: "3h ago" },
  { h: "Bitcoin holds above key support as spot ETF inflows resume", src: "CoinLedger", tag: "BTC", sentiment: "bullish", t: "4h ago" },
  { h: "Banking stocks under pressure on rising bad-loan provisioning", src: "Market Desk", tag: "BANKNIFTY", sentiment: "bearish", t: "5h ago" },
  { h: "Auto sales data beats estimates ahead of festive season demand", src: "Sector Watch", tag: "TATAMOTORS", sentiment: "bullish", t: "7h ago" },
  { h: "FIIs turn net sellers for third straight session on valuation concerns", src: "Bourse Wire", tag: "SENSEX", sentiment: "bearish", t: "9h ago" },
  { h: "Ethereum network upgrade completes, gas fees drop sharply", src: "CoinLedger", tag: "ETH", sentiment: "bullish", t: "11h ago" },
  { h: "Reliance retail arm reportedly weighs fresh fundraise for expansion", src: "Deal Street", tag: "RELIANCE", sentiment: "neutral", t: "1d ago" },
];
