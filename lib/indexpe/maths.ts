import { istParts, isTradingDay, previousTradingDay } from "../market-calendar";
import type { IndexDayRow, IndexPE } from "./types";

/**
 * The index P/E as the analyzer uses it: NSE's closing P/E, scaled to the live index level, with a long-run reference taken from
 * the stored history, and a freshness check. Pure functions, so the rules are tested without a network or a database.
 */

/** Days of P/E history needed before a median is trusted as the long-run P/E. */
export const MIN_HISTORY_DAYS = 20;
/** A stored close older than this many trading days is stale: the analyzer shows Manual. */
export const MAX_AGE_TRADING_DAYS = 3;
/** NSE's index closing file is out by about 18:00 IST. */
export const FILE_PUBLISHED_MINUTES = 18 * 60;

/**
 * Live P/E: the close P/E scaled by how far the index has moved since that close, livePE = closePE × spot ÷ lastClose. It holds
 * earnings fixed and lets the price move, which is what a P/E does intraday. Null when any input is missing or not positive.
 */
export function livePE(closePE: number | null | undefined, liveSpot: number, lastClose: number): number | null {
  if (closePE == null || ![closePE, liveSpot, lastClose].every((x) => Number.isFinite(x) && x > 0)) return null;
  const v = closePE * (liveSpot / lastClose);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Median (the mean of the middle two for an even count); null for nothing. */
export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** The latest trading day whose closing file should be out: today after 18:00 IST on a trading day, else the one before. */
export function latestExpectedDate(now: Date): string {
  const ist = istParts(now);
  return isTradingDay(ist.date) && ist.minutes >= FILE_PUBLISHED_MINUTES ? ist.date : previousTradingDay(ist.date);
}

/** Trading days after `asOfDate`, up to the latest close that should exist at `now`: how far behind the stored data is. */
export function tradingDaysOld(asOfDate: string, now: Date): number {
  const latest = latestExpectedDate(now);
  let n = 0;
  for (let d = Date.parse(`${asOfDate}T00:00:00Z`) + 86_400_000; d <= Date.parse(`${latest}T00:00:00Z`); d += 86_400_000) {
    if (isTradingDay(new Date(d).toISOString().slice(0, 10))) n++;
  }
  return n;
}

export const isStale = (asOfDate: string, now: Date): boolean => tradingDaysOld(asOfDate, now) > MAX_AGE_TRADING_DAYS;

/**
 * What the snapshot returns as `indexPE`, from the latest stored row for the index and its P/E history (any order). Null when the
 * index has no stored P/E at all. A stale row is still returned, marked `stale`, so the page can say why it shows Manual.
 */
export function buildIndexPE(latest: IndexDayRow | null, peHistory: number[], liveSpot: number, now: Date): IndexPE | null {
  if (!latest || latest.pe == null || !(latest.pe > 0)) return null;
  const old = tradingDaysOld(latest.date, now);
  return {
    value: latest.pe,
    asOfDate: latest.date,
    source: "NSE close",
    livePE: livePE(latest.pe, liveSpot, latest.close),
    medianPE: peHistory.length >= MIN_HISTORY_DAYS ? median(peHistory) : null,
    historyDays: peHistory.length,
    tradingDaysOld: old,
    stale: old > MAX_AGE_TRADING_DAYS,
  };
}

/** Which index's valuation goes with each F&O underlying (stocks have no index P/E). */
export const UNDERLYING_INDEX: Record<string, string> = {
  NIFTY: "Nifty 50",
  NIFTY50: "Nifty 50",
  BANKNIFTY: "Nifty Bank",
  FINNIFTY: "Nifty Financial Services",
  MIDCPNIFTY: "Nifty Midcap Select",
};
