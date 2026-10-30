import type { ChainRow, OptionLeg } from "./options";

/**
 * Buildup over a chosen intraday window, from per-minute option candles.
 *
 * Each 1-minute bar carries the contract's close and its open interest at that minute, so
 * the premium change and OI change between any two times fall straight out of two bars.
 * The result is expressed as synthetic `OptionLeg`s (`prevClose`/`prevOi` = the state at the
 * window start, `ltp`/`oi` = the state at the end), which lets the existing classifier,
 * breakdown and heatmap run unchanged on a window instead of "since previous close".
 *
 * Times are minutes after midnight IST. A bar starting at minute `m` covers [m, m+1).
 */

export interface MinuteBar {
  /** YYYY-MM-DD (IST) */
  date: string;
  /** start of the bar, minutes after midnight IST */
  m: number;
  o: number;
  c: number;
  v: number;
  /** open interest at the bar's close */
  oi: number;
}

export const SESSION_OPEN = 9 * 60 + 15;
export const SESSION_CLOSE = 15 * 60 + 30;

export const toHHMM = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** "09:45" → 585, or null if it isn't a valid HH:MM. */
export function fromHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
}

/** Parse Upstox's "2026-10-29T15:39:00+05:30" candle stamp (already IST wall-clock). */
export function barTime(stamp: string): { date: string; m: number } | null {
  const d = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(stamp);
  return d ? { date: d[1], m: Number(d[2]) * 60 + Number(d[3]) } : null;
}

export interface WindowQuery {
  /** "the last N minutes of the session so far" */
  back?: number;
  from?: number;
  to?: number;
}

/**
 * Concrete [from, to) in minutes for a query, clamped to the span the bars cover. Null when
 * the query is empty or inverted. `bars` must be sorted ascending.
 */
export function resolveWindow(bars: MinuteBar[], q: WindowQuery): { from: number; to: number } | null {
  if (bars.length === 0) return null;
  const first = bars[0].m;
  const last = bars[bars.length - 1].m + 1;
  let from: number;
  let to: number;
  if (q.back != null) {
    if (!(q.back >= 1)) return null;
    to = last;
    from = Math.max(first, to - Math.floor(q.back));
  } else {
    if (q.from == null || q.to == null) return null;
    from = Math.max(first, q.from);
    to = Math.min(last, q.to);
  }
  return from < to ? { from, to } : null;
}

/**
 * The contract's state over [from, to) as a synthetic leg, or null if it has no bar by `to`.
 *
 * Baseline at `from` is the last bar completed by then; for a window that starts before the
 * first bar it is that first bar's open price and its OI (the OI change during the opening
 * minute is therefore not counted). `volume` is what traded inside the window — a contract
 * that didn't trade in it isn't classified.
 */
export function legInWindow(bars: MinuteBar[], from: number, to: number): OptionLeg | null {
  let end = -1;
  let start = -1;
  let volume = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (b.m + 1 <= to) end = i;
    if (b.m + 1 <= from) start = i;
    if (b.m >= from && b.m + 1 <= to) volume += b.v;
  }
  if (end < 0) return null;
  const baseline = start >= 0 ? { price: bars[start].c, oi: bars[start].oi } : { price: bars[0].o, oi: bars[0].oi };
  return {
    ltp: bars[end].c,
    prevClose: baseline.price,
    oi: bars[end].oi,
    prevOi: baseline.oi,
    volume,
    iv: 0,
  };
}

/* ---------------------------------------------------------------- shapes ---- */

export interface BuildupWindowData {
  source: "live";
  /** the trading day these bars belong to */
  date: string;
  /** true when the day is still in progress (bars up to "now") */
  liveSession: boolean;
  /** first and last minute the bars cover */
  firstMin: number;
  lastMin: number;
  /** the window actually used */
  from: number;
  to: number;
  /** strikes classified over the window (a band around the money, not the whole chain) */
  rows: ChainRow[];
  /** true if Upstox throttled us mid-way and only the strikes nearest the money are included */
  partial: boolean;
}

export type BuildupWindowResponse = BuildupWindowData | { source: "unavailable"; reason: string };
