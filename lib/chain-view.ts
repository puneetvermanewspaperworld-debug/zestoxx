import { fmtOi, fmtOiChange } from "./helpers";
import type { ChainRow, OptionChain, OptionLeg } from "./options";

/**
 * What the phone's option chain shows, worked out from the chain and nothing else. A column is offered only when the chain really carries it
 * (a feed that sends no volume gets no Volume column, and a value that is not there reads "--"): nothing is estimated or made up.
 */

export type ChainTab = "oi" | "greeks" | "buildup";
export type ChangeMode = "abs" | "pct";
export type ColId = "oiChg" | "oi" | "volume" | "ltpChg" | "bid" | "ask" | "buildup" | "iv" | "delta" | "theta" | "vega" | "gamma";

/** The columns each view can show, in the order they are offered. The first one chosen sits next to the LTP. */
export const TAB_COLS: Record<ChainTab, ColId[]> = {
  oi: ["oiChg", "oi", "volume", "ltpChg", "bid", "ask"],
  greeks: ["iv", "delta", "theta", "vega", "gamma"],
  // the Buildup view is one column on each side: the tag with its OI change and price change (see lib/chain-buildup.ts)
  buildup: ["buildup"],
};

/** The fewest useful columns per side: what is shown until a choice is made. */
export const DEFAULT_COLS: Record<ChainTab, ColId[]> = { oi: ["oi"], greeks: ["iv", "delta"], buildup: ["buildup"] };

export const COL_META: Record<ColId, { label: string; hint: string }> = {
  oiChg: { label: "OI chg", hint: "Change in open interest since the previous session" },
  oi: { label: "OI", hint: "Open interest" },
  volume: { label: "Volume", hint: "Contracts traded in the session" },
  ltpChg: { label: "LTP chg", hint: "Change in the premium since the previous close" },
  bid: { label: "Bid", hint: "Best bid, when the feed sends it" },
  ask: { label: "Ask", hint: "Best ask, when the feed sends it" },
  buildup: { label: "Buildup", hint: "Long buildup, short buildup, short covering or long unwinding, from the change in open interest and in the premium" },
  iv: { label: "IV", hint: "Implied volatility" },
  delta: { label: "Delta", hint: "Change in premium for a ₹1 move in the underlying" },
  theta: { label: "Theta", hint: "Premium lost per day to time decay" },
  vega: { label: "Vega", hint: "Change in premium for a 1-point move in implied volatility" },
  gamma: { label: "Gamma", hint: "How fast delta changes per ₹1 move in the underlying" },
};

const GREEK_DIGITS = { delta: 2, theta: 2, vega: 2, gamma: 4 } as const;

const legs = (rows: ChainRow[]): OptionLeg[] => rows.flatMap((r) => [r.call, r.put]);

/** The columns the chain has real data for. */
export function availableCols(rows: ChainRow[]): Set<ColId> {
  const all = legs(rows);
  const has = new Set<ColId>();
  if (all.some((l) => l.prevOi > 0 && l.oi >= 0)) has.add("oiChg");
  if (all.some((l) => l.oi > 0)) has.add("oi");
  if (all.some((l) => l.volume > 0)) has.add("volume");
  if (all.some((l) => l.prevClose > 0 && l.ltp > 0)) has.add("ltpChg");
  if (all.some((l) => (l.bid ?? 0) > 0)) has.add("bid");
  if (all.some((l) => (l.ask ?? 0) > 0)) has.add("ask");
  if (all.some((l) => l.iv > 0)) has.add("iv");
  for (const g of ["delta", "theta", "vega", "gamma"] as const) if (all.some((l) => l[g] != null)) has.add(g);
  return has;
}

/** The columns to draw: the chosen ones that the chain really has, in the order they are offered. */
export function shownCols(tab: ChainTab, chosen: ColId[] | undefined, have: Set<ColId>): ColId[] {
  if (tab === "buildup") return ["buildup"]; // always its one column: a strike with no tag shows --
  const want = new Set(chosen ?? DEFAULT_COLS[tab]);
  return TAB_COLS[tab].filter((c) => want.has(c) && have.has(c));
}

/** +12.3 or −12.3 (a true minus sign, as the OI changes use) */
export const signed = (n: number, digits: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(digits);

export interface Cell {
  text: string;
  tone: "up" | "down" | "flat";
}

/** One cell's text and direction. "--" when the leg has no such value. */
export function cellFor(col: ColId, leg: OptionLeg, mode: ChangeMode): Cell {
  const none: Cell = { text: "--", tone: "flat" };
  switch (col) {
    case "oiChg": {
      if (!(leg.prevOi > 0)) return none;
      const d = leg.oi - leg.prevOi;
      return { text: mode === "abs" ? fmtOiChange(d) : signed((d / leg.prevOi) * 100, 1) + "%", tone: d > 0 ? "up" : d < 0 ? "down" : "flat" };
    }
    case "buildup":
      return none; // drawn as a tag by the table, not as text
    case "oi":
      return leg.oi > 0 ? { text: fmtOi(leg.oi), tone: "flat" } : none;
    case "volume":
      return leg.volume > 0 ? { text: fmtOi(leg.volume), tone: "flat" } : none;
    case "ltpChg": {
      if (!(leg.prevClose > 0) || !(leg.ltp > 0)) return none;
      const d = leg.ltp - leg.prevClose;
      return { text: mode === "abs" ? signed(d, 2) : signed((d / leg.prevClose) * 100, 2) + "%", tone: d > 0 ? "up" : d < 0 ? "down" : "flat" };
    }
    case "bid":
    case "ask": {
      const v = leg[col];
      return v != null && v > 0 ? { text: v.toFixed(2), tone: "flat" } : none;
    }
    case "iv":
      return leg.iv > 0 ? { text: leg.iv.toFixed(1) + "%", tone: "flat" } : none;
    default: {
      const v = leg[col];
      return v == null ? none : { text: v.toFixed(GREEK_DIGITS[col]), tone: col === "delta" ? (v > 0 ? "up" : v < 0 ? "down" : "flat") : "flat" };
    }
  }
}

/** Whole days from `today` to `expiry` (both YYYY-MM-DD), by calendar date: no clock, no time zone. */
export function daysToExpiry(expiry: string, today: string): number {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(expiry) - ms(today)) / 86_400_000);
}

/** "today", "1d", "9d" */
export const daysLabel = (days: number): string => (days <= 0 ? "today" : `${days}d`);

/** How many strikes to draw either side of the at-the-money one. */
export const STRIKE_WINDOW = 20;

/** The strikes around the at-the-money one. */
export function windowRows(rows: ChainRow[], atm: number | undefined, window = STRIKE_WINDOW): ChainRow[] {
  const i = rows.findIndex((r) => r.strike === atm);
  return i < 0 ? rows : rows.slice(Math.max(0, i - window), i + window + 1);
}

/** The largest open interest among the strikes in view, for the size of the small bar under each OI figure. */
export function maxOiIn(rows: ChainRow[]): number {
  return rows.reduce((m, r) => Math.max(m, r.call.oi, r.put.oi), 0);
}

/** Calls against puts at one strike: each side's share of the two open interests, 0 to 1 (null when neither has any). */
export function oiSplit(row: ChainRow): { call: number; put: number } | null {
  const t = row.call.oi + row.put.oi;
  return t > 0 ? { call: row.call.oi / t, put: row.put.oi / t } : null;
}

/** How many strikes are at or below the spot: the live spot sits after that many rows (none: below the first strike; all of them: above the last). */
export const spotSlot = (rows: ChainRow[], spot: number): number => rows.filter((r) => r.strike <= spot).length;

/** A call is in the money below the spot, a put above it; a strike equal to the spot is neither. */
export const isItm = (strike: number, spot: number, type: "CE" | "PE"): boolean => (type === "CE" ? strike < spot : strike > spot);

/** Whether the chain carries Greeks at all (the feed's own, or the simulation's: the chain's `source` says which). */
export const hasGreeks = (chain: Pick<OptionChain, "rows">): boolean => chain.rows.some((r) => r.call.delta != null || r.put.delta != null);
