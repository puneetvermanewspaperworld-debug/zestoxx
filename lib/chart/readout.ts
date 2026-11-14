import type { TimedCandle } from "./series";

type ReadoutBar = TimedCandle & { realT?: number };

/** What the crosshair readout shows for one bar. */
export interface Readout {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** close minus the previous bar's close, and as per cent of it; null on the first bar */
  change: number | null;
  pct: number | null;
  up: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Nov 2026": the bar's calendar day (its time is that day at 00:00 UTC). */
export function fmtBarDate(t: number): string {
  const d = new Date(t * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "12 Nov 2026", or "12 Nov 2026 09:15" on an intraday chart (the time is the Indian clock: bar times are IST-shifted). */
export function fmtBarStamp(t: number, intraday: boolean): string {
  if (!intraday) return fmtBarDate(t);
  const d = new Date(t * 1000);
  return `${fmtBarDate(t)} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** The bar whose time is `time`, found by bisection, or null when there is none (the crosshair is off the data). */
export function readoutFor(bars: readonly ReadoutBar[], time: number, intraday = false): Readout | null {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].t === time) {
      const b = bars[mid];
      const prev = mid > 0 ? bars[mid - 1].close : null;
      return {
        date: fmtBarStamp(b.realT ?? b.t, intraday),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        change: prev === null ? null : b.close - prev,
        pct: prev === null || prev === 0 ? null : ((b.close - prev) / prev) * 100,
        up: b.close >= b.open,
      };
    }
    if (bars[mid].t < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}
