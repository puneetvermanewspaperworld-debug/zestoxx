import { previousTradingDay } from "../market-calendar";
import { fmtSigned } from "../helpers";

/**
 * Nifty's day-over-day change for each FII/DII day, worked out from the stored index closes (NSE's daily index closing file,
 * table IndexValuation). A day's change is its close against the previous trading day's close. It is only ever worked out from two
 * real stored closes: if either is missing the answer is null and the page shows "--", never a figure carried over a gap, a zero,
 * or an estimate.
 */
export const NIFTY_INDEX_NAME = "Nifty 50";

export interface IndexClose {
  /** YYYY-MM-DD */
  date: string;
  close: number;
}

const usable = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Per cent change of `date`'s close over the previous trading day's close, or null when either close is not stored. */
export function niftyChangePct(date: string, closes: ReadonlyMap<string, number>): number | null {
  const today = closes.get(date);
  const prev = closes.get(previousTradingDay(date));
  if (!usable(today) || !usable(prev)) return null;
  return (today / prev - 1) * 100;
}

/** The change for every date asked about (a map from date to per cent or null). */
export function niftyChanges(dates: string[], closes: IndexClose[]): Map<string, number | null> {
  const byDate = new Map<string, number>();
  for (const c of closes) if (c && typeof c.date === "string" && usable(c.close)) byDate.set(c.date, c.close);
  return new Map(dates.map((d) => [d, niftyChangePct(d, byDate)]));
}

/** "+0.52%", "-1.10%", "0.00%", or "--" when there is no figure. */
export const fmtNiftyPct = (v: number | null | undefined): string => (v == null ? "--" : fmtSigned(v, 2, "%"));

/** The first date the closes are needed from: a few days before the first FII/DII day, so its previous trading day is covered. */
export function closesFrom(firstDate: string): string {
  return new Date(Date.parse(`${firstDate}T00:00:00Z`) - 10 * 86_400_000).toISOString().slice(0, 10);
}

export const NIFTY_NOTE = "Nifty % is Nifty 50's close against the previous trading day's close, from NSE's index closing file. -- where either close is not stored.";
