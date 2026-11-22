import type { ChainRow, OptionChain, OptionLeg } from "./options";

/**
 * What the phone's option chain shows, worked out from the chain and nothing else. A column is offered only when the chain really carries it
 * (a feed that sends no volume gets no Volume column, and a value that is not there reads "--"): nothing is estimated or made up.
 */

export type ChainTab = "oi" | "greeks" | "buildup";
export type ChangeMode = "abs" | "pct";
/** buTag, buOi and buPx are the Buildup view's three columns: the tag, the OI change and the price change % (see lib/chain-buildup.ts). */
export type ColId = "oiChg" | "oi" | "volume" | "ltpChg" | "bid" | "ask" | "buTag" | "buOi" | "buPx" | "iv" | "delta" | "theta" | "vega" | "gamma";

/** The columns each view can show, in the order they are offered. The first one chosen sits next to the LTP. */
export const TAB_COLS: Record<ChainTab, ColId[]> = {
  oi: ["oiChg", "oi", "volume", "ltpChg", "bid", "ask"],
  greeks: ["iv", "delta", "theta", "vega", "gamma"],
  // the Buildup view: the price change first (it sits beside the LTP), then the OI change, then the tag at the outer edge, on both sides
  buildup: ["buPx", "buOi", "buTag"],
};

/** The fewest useful columns per side: what is shown until a choice is made. */
export const DEFAULT_COLS: Record<ChainTab, ColId[]> = { oi: ["oi", "oiChg"], greeks: ["iv", "delta"], buildup: ["buPx", "buOi", "buTag"] };

export const COL_META: Record<ColId, { label: string; hint: string }> = {
  oiChg: { label: "OI chg", hint: "Change in open interest since the previous session" },
  oi: { label: "OI", hint: "Open interest" },
  volume: { label: "Volume", hint: "Contracts traded in the session" },
  ltpChg: { label: "LTP chg", hint: "Change in the premium since the previous close" },
  bid: { label: "Bid", hint: "Best bid, when the feed sends it" },
  ask: { label: "Ask", hint: "Best ask, when the feed sends it" },
  buTag: { label: "Tag", hint: "Long buildup, short buildup, short covering or long unwinding, from the change in open interest and in the premium" },
  buOi: { label: "OI chg", hint: "Change in open interest since the previous session" },
  buPx: { label: "Price %", hint: "Change in the premium since the previous close, in per cent" },
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
  if (tab === "buildup") return TAB_COLS.buildup; // always its three columns: a strike with no tag has a blank tag
  const want = new Set(chosen ?? DEFAULT_COLS[tab]);
  return TAB_COLS[tab].filter((c) => want.has(c) && have.has(c));
}

/**
 * Open interest for a narrow cell: "58.9L", "1.43Cr", "80.0k" (no space before the unit, one decimal for lakh). The unit is always there, so a figure is
 * never read in the wrong size; the full figure is in the contract's sheet.
 */
export function fmtOiShort(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "--";
  const a = Math.abs(n);
  if (a >= 1e7) return (n / 1e7).toFixed(2) + "Cr";
  if (a >= 1e5) return (n / 1e5).toFixed(1) + "L";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
}

/** "+11.8L" / "−80.0k" / "0" */
export function fmtOiChangeShort(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "--";
  if (n === 0) return "0";
  return (n > 0 ? "+" : "−") + fmtOiShort(Math.abs(n));
}

/**
 * The width a text takes at a font size, in px, for sizing a table column. Figures are tabular (every digit the same width, 0.64 em in Inter at the
 * weights the chain uses, measured in the app), and the rest are counted on the wide side, so a column made from this is never narrower than its text.
 */
export function textWidth(text: string, px: number): number {
  let em = 0;
  for (const ch of text) {
    em += ch >= "0" && ch <= "9" ? 0.64 : ch === "." || ch === "," ? 0.31 : ch === "+" ? 0.62 : ch === "−" || ch === "-" ? 0.65 : ch === "%" ? 0.9 : ch === "L" ? 0.6 : ch === "k" ? 0.54 : ch === "r" ? 0.4 : ch === " " ? 0.28 : ch >= "a" && ch <= "z" ? 0.56 : 0.7;
  }
  return Math.ceil(em * px);
}

/** What share of the chain's open interest is in the calls and what in the puts (0 to 1 each); null when there is none. The PCR is put over call of the same two totals. */
export function oiShare(rows: ChainRow[]): { call: number; put: number } | null {
  const call = rows.reduce((n, r) => n + (r.call.oi > 0 ? r.call.oi : 0), 0);
  const put = rows.reduce((n, r) => n + (r.put.oi > 0 ? r.put.oi : 0), 0);
  return call + put > 0 ? { call: call / (call + put), put: put / (call + put) } : null;
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
      return { text: mode === "abs" ? fmtOiChangeShort(d) : signed((d / leg.prevOi) * 100, 1) + "%", tone: d > 0 ? "up" : d < 0 ? "down" : "flat" };
    }
    case "buTag":
    case "buOi":
    case "buPx":
      return none; // drawn by the table from the leg's buildup, not as text
    case "oi":
      return leg.oi > 0 ? { text: fmtOiShort(leg.oi), tone: "flat" } : none;
    case "volume":
      return leg.volume > 0 ? { text: fmtOiShort(leg.volume), tone: "flat" } : none;
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
