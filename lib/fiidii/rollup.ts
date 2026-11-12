import { isTradingDay } from "../market-calendar";
import type { Entity, FiiDiiDayRow, Interval } from "./types";

/**
 * Daily / weekly / monthly views of the stored days. The rules that keep it honest:
 *  - a trading day with no stored figures is a gap ("missing"), never a zero and never an estimate;
 *  - a week or month is the sum of the days we actually have, and says how many of the period's trading days that is;
 *  - futures positions are a stock, not a flow, so a week or month shows the last day's position, not a sum.
 */

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const LIMITS: Record<Interval, number> = { daily: 60, weekly: 26, monthly: 12 };

const shift = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const dayLabel = (iso: string): string => `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const monthLabel = (key: string): string => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const dow = new Date(Date.parse(`${iso}T00:00:00Z`)).getUTCDay();
  return shift(iso, -((dow + 6) % 7));
}

/** Trading days from `from` to `to`, both included (per the exchange calendar, weekdays where it has no data). */
function tradingDaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = shift(d, 1)) if (isTradingDay(d)) out.push(d);
  return out;
}

export interface FlowRow {
  /** the day (daily), the Monday (weekly) or YYYY-MM (monthly) */
  key: string;
  /** compact axis/table label */
  label: string;
  buy: number;
  sell: number;
  net: number;
  /** trading days with figures in this row */
  days: number;
  /** trading days the period has had so far, up to the latest day we hold */
  expected: number;
  /** fewer days than the period has had: the sums cover only the days we hold */
  partial: boolean;
  /** a trading day with no figures at all: draw nothing and say "Data not available", never a zero */
  missing: boolean;
  provisional: boolean;
}

const missingRow = (date: string): FlowRow => ({ key: date, label: dayLabel(date), buy: 0, sell: 0, net: 0, days: 0, expected: 1, partial: true, missing: true, provisional: false });

/**
 * One row per day / week / month for the chosen entity, oldest first, from the days that have cash figures. Daily rows keep the
 * gaps (trading days between the first and last stored day that have nothing) as `missing` rows.
 */
export function flowRows(days: FiiDiiDayRow[], interval: Interval, entity: Entity): FlowRow[] {
  const cash = days.filter((d) => d.cash !== null).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (cash.length === 0) return [];
  const pick = (d: FiiDiiDayRow) => (entity === "FII" ? d.cash!.fii : d.cash!.dii);
  const lastDate = cash[cash.length - 1].date;

  if (interval === "daily") {
    const byDate = new Map(cash.map((d) => [d.date, d]));
    const rows: FlowRow[] = [];
    for (const date of tradingDaysBetween(cash[0].date, lastDate)) {
      const d = byDate.get(date);
      if (!d) rows.push(missingRow(date));
      else rows.push({ key: date, label: dayLabel(date), ...pick(d), days: 1, expected: 1, partial: false, missing: false, provisional: d.provisional });
    }
    // a stored day the calendar does not call a trading day (a special session) is still real data
    for (const d of cash) if (!isTradingDay(d.date)) rows.push({ key: d.date, label: dayLabel(d.date), ...pick(d), days: 1, expected: 1, partial: false, missing: false, provisional: d.provisional });
    return rows.sort((a, b) => (a.key < b.key ? -1 : 1)).slice(-LIMITS.daily);
  }

  const groups = new Map<string, FiiDiiDayRow[]>();
  for (const d of cash) {
    const k = interval === "weekly" ? weekStart(d.date) : d.date.slice(0, 7);
    const g = groups.get(k);
    if (g) g.push(d);
    else groups.set(k, [d]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, g]) => {
      const start = interval === "weekly" ? key : `${key}-01`;
      const end = interval === "weekly" ? shift(key, 6) : lastDayOfMonth(key);
      // trading days the period has had so far, up to the latest day we hold (an unfinished week or month is not "missing" days)
      const expected = Math.max(g.length, tradingDaysBetween(start, end < lastDate ? end : lastDate).length);
      const buy = g.reduce((s, d) => s + pick(d).buy, 0);
      const sell = g.reduce((s, d) => s + pick(d).sell, 0);
      return {
        key,
        label: interval === "weekly" ? dayLabel(key) : monthLabel(key),
        buy,
        sell,
        net: g.reduce((s, d) => s + pick(d).net, 0),
        days: g.length,
        expected,
        partial: g.length < expected,
        missing: false,
        provisional: g.some((d) => d.provisional),
      };
    })
    .slice(-LIMITS[interval]);
}

function lastDayOfMonth(key: string): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export interface FutRow {
  key: string;
  label: string;
  /** the day whose position this row shows */
  date: string;
  long: number;
  short: number;
  longPct: number;
  shortPct: number;
}

/** Long share of FII index futures, in per cent. Null when there are no contracts at all. */
export function longPct(long: number, short: number): number | null {
  const total = long + short;
  return total > 0 ? (long / total) * 100 : null;
}

/**
 * FII index futures long % against short %, oldest first. A position is a stock, so a week or month shows the position at the last
 * day we hold in it (its `date`), not a sum.
 */
export function futuresRows(days: FiiDiiDayRow[], interval: Interval): FutRow[] {
  const oi = days.filter((d) => d.idxFut !== null).sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = new Map<string, FiiDiiDayRow>();
  for (const d of oi) last.set(interval === "daily" ? d.date : interval === "weekly" ? weekStart(d.date) : d.date.slice(0, 7), d);
  const rows: FutRow[] = [];
  for (const [key, d] of last) {
    const { long, short } = d.idxFut!;
    const lp = longPct(long, short);
    if (lp === null) continue;
    rows.push({ key, label: interval === "monthly" ? monthLabel(key) : dayLabel(interval === "weekly" ? key : d.date), date: d.date, long, short, longPct: lp, shortPct: 100 - lp });
  }
  return rows.slice(-LIMITS[interval]);
}

/** The newest stored day that has cash figures, and the newest that has futures positions (they can be different days). */
export function latestCash(days: FiiDiiDayRow[]): FiiDiiDayRow | null {
  return days.filter((d) => d.cash !== null).sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;
}
export function latestFutures(days: FiiDiiDayRow[]): FiiDiiDayRow | null {
  return days.filter((d) => d.idxFut !== null).sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;
}
export const cashDayCount = (days: FiiDiiDayRow[]): number => days.filter((d) => d.cash !== null).length;

/** How many days of cash figures make the history "built"; below it the page says the history is still building. */
export const HISTORY_TARGET = 20;
