import type { Candle } from "../types";

/**
 * Intervals and ranges of the Trade page chart, and the maths around them. Only intervals and ranges that have real data are offered;
 * the limits below are what the Upstox candle endpoint was measured to accept (1, 5 and 15 minute bars: a month per request; 30 minute and
 * hourly: a quarter; daily: ten years; weekly and monthly: no limit; intraday data starts in January 2022, the rest in January 2000).
 * The windows used are a little inside the measured limits. Pure: no network, no clock, no chart.
 *
 * Times: a bar's `t` is seconds since the epoch of its time on the Indian clock treated as if it were UTC (IST-shifted), so the chart
 * library, which shows UTC, shows IST, and a daily bar (00:00 IST) sits at midnight of its calendar day. Crypto stays UTC (see the provider).
 */
export const IST_OFFSET_S = 19_800;
export const DAY_S = 86_400;

export type IntervalId = "1m" | "5m" | "15m" | "30m" | "1h" | "1D" | "1W" | "1M";
export type RangeId = "1D" | "5D" | "1M" | "3M" | "6M" | "1Y" | "5Y" | "All";

export interface IntervalInfo {
  id: IntervalId;
  label: string;
  /** Upstox's unit and interval number */
  unit: "minutes" | "hours" | "days" | "weeks" | "months";
  n: number;
  intraday: boolean;
  /** length of a bar in seconds (intraday only) */
  barSeconds: number | null;
  /** the most calendar days one request covers (null: no limit) */
  maxSpanDays: number | null;
  /** first date with data */
  earliest: string;
}

export const INTERVALS: IntervalInfo[] = [
  { id: "1m", label: "1 minute", unit: "minutes", n: 1, intraday: true, barSeconds: 60, maxSpanDays: 30, earliest: "2022-01-03" },
  { id: "5m", label: "5 minutes", unit: "minutes", n: 5, intraday: true, barSeconds: 300, maxSpanDays: 30, earliest: "2022-01-03" },
  { id: "15m", label: "15 minutes", unit: "minutes", n: 15, intraday: true, barSeconds: 900, maxSpanDays: 30, earliest: "2022-01-03" },
  { id: "30m", label: "30 minutes", unit: "minutes", n: 30, intraday: true, barSeconds: 1800, maxSpanDays: 90, earliest: "2022-01-03" },
  { id: "1h", label: "1 hour", unit: "hours", n: 1, intraday: true, barSeconds: 3600, maxSpanDays: 90, earliest: "2022-01-03" },
  { id: "1D", label: "1 day", unit: "days", n: 1, intraday: false, barSeconds: null, maxSpanDays: 3600, earliest: "2000-01-01" },
  { id: "1W", label: "1 week", unit: "weeks", n: 1, intraday: false, barSeconds: null, maxSpanDays: null, earliest: "2000-01-01" },
  { id: "1M", label: "1 month", unit: "months", n: 1, intraday: false, barSeconds: null, maxSpanDays: null, earliest: "2000-01-01" },
];
export const intervalInfo = (id: IntervalId): IntervalInfo => INTERVALS.find((i) => i.id === id) as IntervalInfo;
export const isIntervalId = (v: unknown): v is IntervalId => INTERVALS.some((i) => i.id === v);
export const isIntraday = (id: IntervalId): boolean => intervalInfo(id).intraday;

export interface RangeInfo {
  id: RangeId;
  label: string;
  /** calendar days back from today (null: as far back as the interval has data) */
  days: number | null;
  /** a range of whole sessions: that many of the latest trading days are kept */
  sessions?: number;
  /** how far back to ask so that enough sessions are found across weekends and holidays */
  fetchDays?: number;
}
export const RANGES: RangeInfo[] = [
  { id: "1D", label: "1D", days: null, sessions: 1, fetchDays: 6 },
  { id: "5D", label: "5D", days: null, sessions: 5, fetchDays: 12 },
  { id: "1M", label: "1M", days: 31 },
  { id: "3M", label: "3M", days: 92 },
  { id: "6M", label: "6M", days: 183 },
  { id: "1Y", label: "1Y", days: 366 },
  { id: "5Y", label: "5Y", days: 1827 },
  { id: "All", label: "All", days: null },
];
export const rangeInfo = (id: RangeId): RangeInfo => RANGES.find((r) => r.id === id) as RangeInfo;
export const isRangeId = (v: unknown): v is RangeId => RANGES.some((r) => r.id === v);

/** Which intervals make sense for each range (and have real data for it). */
export const VALID_INTERVALS: Record<RangeId, IntervalId[]> = {
  "1D": ["1m", "5m", "15m"],
  "5D": ["1m", "5m", "15m", "30m", "1h"],
  "1M": ["5m", "15m", "30m", "1h", "1D"],
  "3M": ["15m", "30m", "1h", "1D"],
  "6M": ["30m", "1h", "1D"],
  "1Y": ["1h", "1D", "1W"],
  "5Y": ["1D", "1W"],
  All: ["1D", "1W", "1M"],
};
export const DEFAULT_INTERVAL: Record<RangeId, IntervalId> = { "1D": "5m", "5D": "15m", "1M": "1h", "3M": "1D", "6M": "1D", "1Y": "1D", "5Y": "1W", All: "1M" };
export const DEFAULT_RANGE: Record<IntervalId, RangeId> = { "1m": "1D", "5m": "1D", "15m": "5D", "30m": "1M", "1h": "1M", "1D": "1Y", "1W": "5Y", "1M": "All" };

export interface Selection {
  interval: IntervalId;
  range: RangeId;
}
export const isValidSelection = (s: Selection): boolean => VALID_INTERVALS[s.range].includes(s.interval);

/** The user picks an interval: the range stays when it suits, otherwise it becomes that interval's usual range. */
export const pickInterval = (cur: Selection, interval: IntervalId): Selection => (VALID_INTERVALS[cur.range].includes(interval) ? { interval, range: cur.range } : { interval, range: DEFAULT_RANGE[interval] });
/** The user picks a range: the interval stays when it suits, otherwise it becomes that range's usual interval. */
export const pickRange = (cur: Selection, range: RangeId): Selection => (VALID_INTERVALS[range].includes(cur.interval) ? { interval: cur.interval, range } : { interval: DEFAULT_INTERVAL[range], range });

/** A selection from what was stored: anything unknown or not valid together is replaced by a valid one. */
export function selectionFrom(interval: unknown, range: unknown): Selection {
  const i = isIntervalId(interval) ? interval : null;
  const r = isRangeId(range) ? range : null;
  if (i && r) return isValidSelection({ interval: i, range: r }) ? { interval: i, range: r } : pickInterval({ interval: DEFAULT_INTERVAL[r], range: r }, i);
  if (i) return { interval: i, range: DEFAULT_RANGE[i] };
  if (r) return { interval: DEFAULT_INTERVAL[r], range: r };
  return { interval: "1D", range: "1Y" };
}

/* ----------------------------------------------------------------------------------- dates, time -- */

const parseDay = (iso: string): number => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 1000;
const formatDay = (s: number): string => new Date(s * 1000).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number): string => formatDay(parseDay(iso) + n * DAY_S);

/** Seconds on the chart's clock for a moment: IST-shifted. */
export const toChartSeconds = (epochMs: number): number => Math.floor(epochMs / 1000) + IST_OFFSET_S;
/** Today's date in IST. */
export const istDate = (nowMs: number): string => formatDay(Math.floor(toChartSeconds(nowMs) / DAY_S) * DAY_S);

/** The dates to ask for: the range's window ending today, never before the interval's first data. */
export function rangeWindow(range: RangeId, interval: IntervalId, todayIst: string): { from: string; to: string } {
  const info = rangeInfo(range);
  const earliest = intervalInfo(interval).earliest;
  const back = info.fetchDays ?? info.days;
  const from = back === null ? earliest : addDays(todayIst, -back);
  return { from: from < earliest ? earliest : from, to: todayIst };
}

/**
 * The requests that cover [from, to]: windows no longer than the interval's per-request limit, oldest first, together covering every
 * date once. Weekly and monthly are one request. A request is for dates, inclusive at both ends.
 */
export function planRequests(interval: IntervalId, from: string, to: string): { from: string; to: string }[] {
  if (from > to) return [];
  const span = intervalInfo(interval).maxSpanDays;
  if (span === null) return [{ from, to }];
  const out: { from: string; to: string }[] = [];
  let end = to;
  while (end >= from) {
    const start = addDays(end, -(span - 1));
    const s = start < from ? from : start;
    out.unshift({ from: s, to: end });
    end = addDays(s, -1);
  }
  return out;
}
export const MAX_REQUESTS = 6;
export const requestCount = (interval: IntervalId, range: RangeId, todayIst: string): number => {
  const w = rangeWindow(range, interval, todayIst);
  return planRequests(interval, w.from, w.to).length;
};

/** Keep the bars of the latest `n` trading days (by the IST date of each bar). */
export function trimToSessions<T extends { t: number }>(bars: readonly T[], n: number): T[] {
  const days: number[] = [];
  for (let i = bars.length - 1; i >= 0; i--) {
    const d = Math.floor(bars[i].t / DAY_S);
    if (days[days.length - 1] !== d) {
      if (days.length === n) return bars.slice(i + 1) as T[];
      days.push(d);
    }
  }
  return [...bars];
}

/* ----------------------------------------------------------------------------------- the data -- */

/** What the server sends: [epoch ms, open, high, low, close, volume], oldest first. */
export type BarRow = [number, number, number, number, number, number];

/**
 * Candle rows from the feed (newest first, [ISO time, o, h, l, c, volume, oi]) as BarRow, oldest first. A row that is not a real bar
 * (a missing or non-positive price, a high below the low, an unparseable time) is dropped, never repaired; repeated times keep the later row.
 */
export function parseUpstoxRows(rows: unknown): BarRow[] {
  if (!Array.isArray(rows)) return [];
  const byTime = new Map<number, BarRow>();
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 5) continue;
    const ms = typeof r[0] === "string" ? Date.parse(r[0]) : NaN;
    const [o, h, l, c] = [Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4])];
    const v = Number(r[5]);
    if (!Number.isFinite(ms) || ![o, h, l, c].every((x) => Number.isFinite(x) && x > 0) || h < l) continue;
    byTime.set(ms, [ms, o, h, l, c, Number.isFinite(v) && v > 0 ? v : 0]);
  }
  return [...byTime.values()].sort((a, b) => a[0] - b[0]);
}

/** Candles for the chart from rows: `t` on the IST-shifted clock. */
export const rowsToCandles = (rows: readonly BarRow[]): Candle[] => rows.map((r) => ({ t: toChartSeconds(r[0]), open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] }));

/** Two sets of bars as one, in time order; where both have a bar for the same time the second one wins. */
export function mergeBars<T extends { t: number }>(a: readonly T[], b: readonly T[]): T[] {
  const m = new Map<number, T>();
  for (const x of a) m.set(x.t, x);
  for (const x of b) m.set(x.t, x);
  return [...m.values()].sort((x, y) => x.t - y.t);
}

/* ------------------------------------------------------------------------------- the live candle -- */

const SESSION_OPEN_MIN = 9 * 60 + 15;

/** The chart-clock time at which the bar containing `nowMs` starts. */
export function barStart(interval: IntervalId, nowMs: number): number {
  const s = toChartSeconds(nowMs);
  const day = Math.floor(s / DAY_S) * DAY_S;
  const info = intervalInfo(interval);
  if (info.intraday) {
    const step = (info.barSeconds as number) / 60;
    const m = Math.floor((s - day) / 60);
    return day + (SESSION_OPEN_MIN + Math.floor((m - SESSION_OPEN_MIN) / step) * step) * 60;
  }
  if (interval === "1D") return day;
  const d = new Date(day * 1000);
  if (interval === "1M") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  return day - ((d.getUTCDay() + 6) % 7) * DAY_S; // the Monday of the week
}

/**
 * The last bar moved by the live price. While the market is open: if the price falls in the last bar's period its close moves (its high
 * and low widen); if it falls in a later period a new bar starts, opening at the first price seen, with no volume (the feed has not
 * given one). Nothing happens when the market is closed, the price is not real, or there are no bars.
 */
export function applyTick(bars: readonly Candle[], price: number, nowMs: number, interval: IntervalId, marketOpen: boolean): Candle[] {
  if (!marketOpen || !(price > 0) || !Number.isFinite(price) || bars.length === 0) return bars as Candle[];
  const start = barStart(interval, nowMs);
  const last = bars[bars.length - 1];
  const lastT = last.t ?? 0;
  if (lastT === start) {
    if (last.close === price && price <= last.high && price >= last.low) return bars as Candle[];
    return [...bars.slice(0, -1), { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price }];
  }
  if (start > lastT) return [...bars, { t: start, open: price, high: price, low: price, close: price, volume: 0 }];
  return bars as Candle[];
}

/* ------------------------------------------------------------------------------ what can be chosen -- */

/** Where a symbol's candles come from: the live feed (all intervals), the app's simulated series (daily and longer only), or crypto (daily only). */
export type DataKind = "live" | "simulated" | "crypto";

export const NEEDS_LIVE = "Needs live data";
export const DAILY_ONLY = "Daily data only";

/** Which intervals can be chosen for a kind of data, and for the others why not. */
export function intervalAvailability(kind: DataKind): { id: IntervalId; reason: string | null }[] {
  return INTERVALS.map((i) => {
    if (kind === "live") return { id: i.id, reason: null };
    if (kind === "crypto") return { id: i.id, reason: i.id === "1D" ? null : DAILY_ONLY };
    return { id: i.id, reason: i.intraday ? NEEDS_LIVE : null };
  });
}
