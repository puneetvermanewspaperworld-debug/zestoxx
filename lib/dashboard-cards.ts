import { latestCash } from "./fiidii/rollup";
import type { CashFigures, FiiDiiDayRow } from "./fiidii/types";
import type { FutureMover, FutureMovers, MoversResponse } from "./movers";

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
