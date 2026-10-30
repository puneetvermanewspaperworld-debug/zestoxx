import { contractLabel } from "./movers";
import { seededRandom, strSeed } from "./helpers";
import type { OptionLeg } from "./options";

/**
 * One option contract as the order sheet sees it: price, OHLC, 5-level depth and the
 * exchange-wide buy/sell quantity totals. Shared by the Upstox mapper (server) and the
 * deterministic simulation (client fallback).
 */

export interface DepthLevel {
  qty: number;
  price: number;
  orders: number;
}

export interface ContractQuote {
  source: "live" | "simulated";
  ltp: number;
  change: number;
  changePct: number | null;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  /** best bid first */
  bids: DepthLevel[];
  /** best ask first */
  asks: DepthLevel[];
  /** whole-book totals (not just the five levels shown) */
  totalBuyQty: number;
  totalSellQty: number;
  volume: number;
  oi: number;
  avgPrice: number;
  /** 0 when the exchange doesn't publish a band for this contract */
  lowerCircuit: number;
  upperCircuit: number;
}

export interface Candle5 {
  /** ISO timestamp with IST offset */
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** Buy/sell share of resting quantity, rounded so the two always sum to 100. */
export function pressure(buyQty: number, sellQty: number): { buyPct: number; sellPct: number } | null {
  const total = buyQty + sellQty;
  if (!(total > 0)) return null;
  const buyPct = Math.round((buyQty / total) * 100);
  return { buyPct, sellPct: 100 - buyPct };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Stand-in quote for when Upstox is unreachable (or the chain itself is simulated).
 * Seeded by the contract and its rounded price, so the ladder holds still between polls
 * and only reshuffles when the price actually moves.
 */
export function simulateContractQuote(leg: OptionLeg, lotSize: number, seedKey: string): ContractQuote {
  const ltp = leg.ltp;
  const prevClose = leg.prevClose > 0 ? leg.prevClose : ltp;
  const rand = seededRandom(strSeed(`${seedKey}|${Math.round(ltp * 20)}`));
  const tick = 0.05;
  const lot = Math.max(1, lotSize);

  const open = round2(prevClose * (1 + (rand() - 0.5) * 0.06));
  const high = round2(Math.max(open, ltp) * (1 + rand() * 0.04));
  const low = round2(Math.min(open, ltp) * (1 - rand() * 0.04));

  const level = (side: 1 | -1, i: number): DepthLevel => ({
    price: round2(Math.max(tick, ltp + side * tick * (i + 1))),
    qty: lot * Math.round(1 + rand() * 12),
    orders: 1 + Math.floor(rand() * 5),
  });
  const bids = Array.from({ length: 5 }, (_, i) => level(-1, i));
  const asks = Array.from({ length: 5 }, (_, i) => level(1, i));
  const sum = (ls: DepthLevel[]) => ls.reduce((s, l) => s + l.qty, 0);
  // Whole-book totals are a multiple of what the five levels show.
  const totalBuyQty = Math.round(sum(bids) * (4 + rand() * 40));
  const totalSellQty = Math.round(sum(asks) * (4 + rand() * 40));

  const change = round2(ltp - prevClose);
  return {
    source: "simulated",
    ltp,
    change,
    changePct: prevClose > 0 ? (change / prevClose) * 100 : null,
    open,
    high,
    low,
    prevClose,
    bids,
    asks,
    totalBuyQty,
    totalSellQty,
    volume: leg.volume,
    oi: leg.oi,
    avgPrice: round2((high + low + ltp) / 3),
    lowerCircuit: 0,
    upperCircuit: 0,
  };
}

/* ------------------------------------------------------------- contract ids -- */

/**
 * Paper-trading holdings are keyed by a plain string. Option contracts use
 * "<label>#<key>" — e.g. "NIFTY 03 NOV 22900 CE#NSE_FO|53750" — so the id stays readable
 * and still carries what's needed to mark the position to market later. `key` is Upstox's
 * instrument key when the chain was live, or "sim|<underlying>|<expiry>|<strike>|<CE|PE>"
 * for a simulated one (re-priced from the simulated chain).
 */

export interface ParsedContractId {
  label: string;
  key: string;
  sim: { underlying: string; expiry: string; strike: number; type: "CE" | "PE" } | null;
}

/** Index ids the UI uses → the name traders know them by. */
const DISPLAY_UNDERLYING: Record<string, string> = { NIFTY50: "NIFTY" };

export function makeContractId(args: {
  underlying: string;
  expiry: string;
  strike: number;
  type: "CE" | "PE";
  /** Upstox instrument key; omit for a simulated contract */
  key?: string;
}): string {
  const symbol = DISPLAY_UNDERLYING[args.underlying] ?? args.underlying;
  const label = contractLabel({ symbol, expiry: args.expiry, strike: args.strike, type: args.type });
  const key = args.key ?? `sim|${args.underlying}|${args.expiry}|${args.strike}|${args.type}`;
  return `${label}#${key}`;
}

export function parseContractId(id: string): ParsedContractId | null {
  const i = id.indexOf("#");
  if (i <= 0) return null;
  const label = id.slice(0, i);
  const key = id.slice(i + 1);
  if (key.startsWith("sim|")) {
    const [, underlying, expiry, strike, type] = key.split("|");
    if (!underlying || !expiry || !(Number(strike) > 0) || (type !== "CE" && type !== "PE")) return null;
    return { label, key, sim: { underlying, expiry, strike: Number(strike), type } };
  }
  return { label, key, sim: null };
}

/** What to show for any holding/order id — the plain symbol, or the contract's label. */
export function displayName(id: string): string {
  return parseContractId(id)?.label ?? id;
}
