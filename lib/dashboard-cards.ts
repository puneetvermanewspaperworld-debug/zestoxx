import { latestCash } from "./fiidii/rollup";
import type { CashFigures, FiiDiiDayRow } from "./fiidii/types";
import { rankMovers } from "./dashboard-movers";
import type { FutureMover, FutureMovers, MoversResponse, StockMover, StockMovers } from "./movers";

export const FII_DII_EMPTY = "Data not available yet";
export const FUTURES_EMPTY = "No futures are up right now";
export const FUTURES_UNAVAILABLE = "Futures data is not available right now";

/* ---------------------------------------------------------- FII/DII card --- */

export interface FiiDiiSummary {
  /** the trading day the figures are for (YYYY-MM-DD) */
  date: string;
  cash: CashFigures;
  /** NSE's provisional figures, not yet final */
  provisional: boolean;
}

/** The newest stored day with cash figures, or null when nothing is stored (the card then says "Data not available yet"). */
export function fiiDiiSummary(rows: FiiDiiDayRow[] | null | undefined): FiiDiiSummary | null {
  const day = latestCash(rows ?? []);
  return day && day.cash ? { date: day.date, cash: day.cash, provisional: day.provisional } : null;
}

/* ------------------------------------------------------- futures gainers --- */

export type FuturesGainers =
  | { kind: "loading" }
  | { kind: "unavailable"; text: string }
  | { kind: "empty"; text: string }
  | { kind: "rows"; rows: FutureMover[] };

/**
 * The dashboard's Futures gainers: the top few near-month futures that are up, straight from the Movers feed. Only futures with a
 * positive change are listed (never a falling one under "gainers"), best first.
 */
export function futuresGainers(res: MoversResponse<FutureMovers> | null | undefined, n = 3): FuturesGainers {
  if (!res) return { kind: "loading" };
  if (res.source !== "live") return { kind: "unavailable", text: FUTURES_UNAVAILABLE };
  const rows = res.data.gainers
    .filter((f) => Number.isFinite(f.changePct) && f.changePct > 0)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, n);
  return rows.length ? { kind: "rows", rows } : { kind: "empty", text: FUTURES_EMPTY };
}

/* --------------------------------------------------- market movers card --- */

export const MOVERS_UNAVAILABLE = "Live market data is unavailable right now";
export const NO_GAINERS = "No gainers right now";
export const NO_LOSERS = "No losers right now";

export type EquityMoversCard =
  | { kind: "loading" }
  | { kind: "unavailable"; text: string }
  | { kind: "ok"; gainers: StockMover[]; losers: StockMover[] };

/**
 * The dashboard's Market Movers: the same all-NSE equity gainers and losers as the Movers page (one feed, so the two always agree),
 * the top `n` of each. A gainer is a stock that is up and a loser one that is down, so a list can legitimately be empty; an
 * unavailable feed says so instead of listing anything.
 */
export function equityMoversCard(res: MoversResponse<StockMovers> | null | undefined, n = 3): EquityMoversCard {
  if (!res) return { kind: "loading" };
  if (res.source !== "live") return { kind: "unavailable", text: MOVERS_UNAVAILABLE };
  const ranked = rankMovers([...res.data.gainers, ...res.data.losers].map((r) => ({ ...r, id: r.symbol, chg: r.changePct, real: true, indian: true })), n);
  return { kind: "ok", gainers: ranked.gainers, losers: ranked.losers };
}
