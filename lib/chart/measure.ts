import { DAY, timeToLogical } from "./coords";
import { fmtSigned } from "../helpers";
import type { Anchor } from "./drawings";

/**
 * The measure tool: from one point to another, the move in points and per cent, the number of candles and the time between them.
 * For an index it also gives the approximate rupees per lot of a future: the points moved times the lot size from the feed. That is
 * a rough figure (a future is not the index, and the lot size can change); with no lot size known it is null and shown as "--".
 */
export interface Measurement {
  /** b minus a, signed */
  points: number;
  /** per cent of a's price, signed */
  pct: number;
  candles: number;
  calendarDays: number;
  fromTime: number;
  toTime: number;
  rupeesPerLot: number | null;
}

export function measure(a: Anchor, b: Anchor, times: readonly number[], lot: number | null = null, isIndex = false): Measurement {
  const la = timeToLogical(times, a.time);
  const lb = timeToLogical(times, b.time);
  const points = b.price - a.price;
  return {
    points,
    pct: a.price !== 0 ? (points / a.price) * 100 : 0,
    candles: la === null || lb === null ? 0 : Math.round(Math.abs(lb - la)),
    calendarDays: Math.round(Math.abs(b.time - a.time) / DAY),
    fromTime: Math.min(a.time, b.time),
    toTime: Math.max(a.time, b.time),
    rupeesPerLot: isIndex && lot && lot > 0 ? Math.abs(points) * lot : null,
  };
}

/** "+120.50 pts (+0.48%)", "7 candles · 9 days" */
export function measureText(m: Measurement): { move: string; time: string } {
  return {
    move: `${fmtSigned(m.points, 2)} pts (${fmtSigned(m.pct, 2, "%")})`,
    time: `${m.candles} candle${m.candles === 1 ? "" : "s"} · ${m.calendarDays} day${m.calendarDays === 1 ? "" : "s"}`,
  };
}
