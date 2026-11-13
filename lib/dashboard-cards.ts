import type { FutureMover, FutureMovers, MoversResponse } from "./movers";

export const FUTURES_EMPTY = "No futures are up right now";
export const FUTURES_UNAVAILABLE = "Futures data is not available right now";

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
