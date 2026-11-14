/**
 * Short notes for values that read 0.00 or "--" only because the market is shut. `open` is the market status
 * (null until it is known, which counts as "no note": nothing is claimed before the status is read).
 */

export const CLOSED_LAST_CLOSE = "Market closed, last close shown";
export const WHEN_OPEN = "Available when the market is open";

/** A value that is just missing while the market is shut gets "Available when the market is open"; otherwise no note. */
export function unavailableNote(open: boolean | null, value: number | null | undefined): string | null {
  if (open !== false) return null;
  return value == null || !Number.isFinite(value) ? WHEN_OPEN : null;
}

/** True when a change figure reads as "nothing sent": both the point change and the percent are zero or absent. */
export const noChangeFigure = (r: { change: number; changePct: number | null }): boolean =>
  (r.changePct == null || r.changePct === 0) && r.change === 0;

/** The note above a Movers list. While the market is shut the prices are the last close; blank changes say when they return. */
export function moversNote(open: boolean | null, rows: { change: number; changePct: number | null }[]): string | null {
  if (open !== false || rows.length === 0) return null;
  return rows.some(noChangeFigure) ? `${CLOSED_LAST_CLOSE}. Change is ${WHEN_OPEN.charAt(0).toLowerCase()}${WHEN_OPEN.slice(1)}` : CLOSED_LAST_CLOSE;
}

/** The note under a contract's Open / High / Low / Prev close row. */
export function quoteNote(open: boolean | null, q: { open: number; high: number; low: number; prevClose: number }): string | null {
  if (open !== false) return null;
  const vals = [q.open, q.high, q.low, q.prevClose];
  const missing = vals.filter((v) => !(v > 0)).length;
  if (missing === vals.length) return WHEN_OPEN;
  return missing > 0 ? `${CLOSED_LAST_CLOSE}. Blank values are ${WHEN_OPEN.charAt(0).toLowerCase()}${WHEN_OPEN.slice(1)}` : CLOSED_LAST_CLOSE;
}
