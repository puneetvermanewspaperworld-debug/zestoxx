import { getWithRetry, type Fetcher, type HttpDeps } from "../nse/http";
import { parseIndexCloseCsv, ParseError } from "./parse";
import { FILE_PUBLISHED_MINUTES, latestExpectedDate } from "./maths";
import type { IndexDayRow } from "./types";

/**
 * The daily index valuation ingest from NSE's index closing file:
 *   https://nsearchives.nseindia.com/content/indices/ind_close_all_DDMMYYYY.csv   (out by about 18:00 IST)
 * One plain GET with ordinary headers. A day already stored is never fetched again; a failure is retried after a delay and then
 * logged; a 404 (a holiday, a weekend, not out yet) is normal. Dependencies are injected so the logic is tested without a network
 * or a database.
 */

export type { Fetcher };
export { FILE_PUBLISHED_MINUTES };

export const indexCloseUrl = (date: string): string => `https://nsearchives.nseindia.com/content/indices/ind_close_all_${date.slice(8, 10)}${date.slice(5, 7)}${date.slice(0, 4)}.csv`;

/** The latest trading day whose closing file should be out. */
export const targetDay = latestExpectedDate;

export interface IndexIngestStore {
  hasDate(date: string): Promise<boolean>;
  /** Upsert the day's rows by (index, date). */
  saveDay(date: string, rows: IndexDayRow[], fetchedAt: Date): Promise<void>;
}

export interface IndexIngestDeps extends HttpDeps {
  store: IndexIngestStore;
  now: Date;
}

export type IndexOutcome =
  | { status: "stored"; date: string; indices: number }
  | { status: "already-stored"; date: string }
  | { status: "not-published"; date: string }
  | { status: "failed"; date: string; reason: string };

/** Fetch and store one day's file (skipped if that day is already stored). */
export async function ingestIndexDay(deps: IndexIngestDeps, date: string): Promise<IndexOutcome> {
  if (await deps.store.hasDate(date)) return { status: "already-stored", date };
  const got = await getWithRetry(deps, "index closing file", indexCloseUrl(date), (body) => {
    const p = parseIndexCloseCsv(body);
    if (p.date !== date) throw new ParseError(`the file is for ${p.date}, not ${date}`);
    return p;
  });
  if (got.kind === "not-found") {
    deps.log("info", "index closing file: not published (a holiday, a weekend, or not out yet)", { date });
    return { status: "not-published", date };
  }
  if (got.kind === "failed") {
    deps.log("error", "index closing file: failed", { date, reason: got.reason });
    return { status: "failed", date, reason: got.reason };
  }
  await deps.store.saveDay(date, got.value.rows, deps.now);
  deps.log("info", "index closing file stored", { date, indices: got.value.rows.length });
  return { status: "stored", date, indices: got.value.rows.length };
}

/** The daily run: the latest trading day's file, if it is not stored yet. */
export function ingestIndexLatest(deps: IndexIngestDeps): Promise<IndexOutcome> {
  return ingestIndexDay(deps, targetDay(deps.now));
}

export interface IndexBackfillReport {
  stored: string[];
  /** days with no file (a holiday or not published): normal */
  none: string[];
  failed: { date: string; reason: string }[];
  skipped: number;
  /** true when the run stopped at its fetch limit with days still to check */
  more: boolean;
}

/**
 * Fill earlier days from the dated files. Weekends are skipped, a day already stored is skipped, a 404 (a holiday) is normal, and
 * the run is bounded and spaced out so it stays polite: call it again to go further back.
 */
export async function backfillIndexClose(deps: IndexIngestDeps, opts: { days: number; maxFetches?: number; gapMs?: number }): Promise<IndexBackfillReport> {
  const report: IndexBackfillReport = { stored: [], none: [], failed: [], skipped: 0, more: false };
  const max = opts.maxFetches ?? 40;
  const gap = opts.gapMs ?? 300;
  let fetched = 0;
  const target = targetDay(deps.now);
  for (let i = 0; i < Math.max(0, Math.min(opts.days, 800)); i++) {
    const date = new Date(Date.parse(`${target}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10);
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    if (await deps.store.hasDate(date)) {
      report.skipped++;
      continue;
    }
    if (fetched >= max) {
      report.more = true;
      break;
    }
    if (fetched > 0) await deps.sleep(gap);
    fetched++;
    const o = await ingestIndexDay(deps, date);
    if (o.status === "stored") report.stored.push(date);
    else if (o.status === "not-published") report.none.push(date);
    else if (o.status === "failed") report.failed.push({ date, reason: o.reason });
  }
  return report;
}
