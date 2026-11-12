import { istParts, isTradingDay, previousTradingDay } from "../market-calendar";
import { ParseError, parseCashJson, parseParticipantOiCsv } from "./parse";
import type { CashFigures, FiiDiiDayRow, IdxFut } from "./types";

/**
 * The daily ingest. Two public NSE files feed one row per trading day:
 *   cash   https://www.nseindia.com/api/fiidiiTradeReact   FII/DII buy, sell, net (₹ crore), latest day only, provisional, ~5 pm IST
 *   OI     https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_DDMMYYYY.csv   FII index futures long/short, ~7 pm IST
 *
 * Plain GETs with ordinary headers, nothing else. A source already stored for the day is never fetched again; a source that fails
 * is retried a couple of times with a delay and then logged. A 404 on the open interest file is normal (a holiday, a weekend, or
 * not published yet) and is neither retried nor treated as an error. Dependencies are injected so the logic is tested without a
 * network or a database.
 */

export const CASH_URL = "https://www.nseindia.com/api/fiidiiTradeReact";
export const oiUrl = (date: string): string => `https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_${date.slice(8, 10)}${date.slice(5, 7)}${date.slice(0, 4)}.csv`;

/** Wait before the 2nd and 3rd attempt. */
export const RETRY_DELAYS_MS = [3_000, 8_000];

/** A stored day as the ingest sees it: which halves exist and whether each source has been fetched. */
export interface StoredDay extends FiiDiiDayRow {
  cashFetched: boolean;
  oiFetched: boolean;
}

export interface DayPatch {
  cash?: CashFigures;
  idxFut?: IdxFut;
  /** only set when the row is created or gets its cash figures */
  provisional?: boolean;
  cashFetchedAt?: Date;
  oiFetchedAt?: Date;
}

export interface FiiDiiStore {
  get(date: string): Promise<StoredDay | null>;
  upsert(date: string, patch: DayPatch): Promise<void>;
  /** the newest `limit` days, oldest first */
  list(limit: number): Promise<FiiDiiDayRow[]>;
}

export type Fetcher = (url: string) => Promise<{ status: number; body: string }>;

export interface IngestDeps {
  fetcher: Fetcher;
  store: FiiDiiStore;
  now: Date;
  sleep: (ms: number) => Promise<void>;
  log: (level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) => void;
}

export type SourceOutcome =
  | { status: "stored"; date: string }
  | { status: "already-stored"; date: string }
  | { status: "not-published"; date: string }
  | { status: "source-behind"; date: string; shows: string }
  | { status: "failed"; date: string; reason: string };

export interface IngestReport {
  /** the trading day whose files should be out */
  target: string;
  cash: SourceOutcome;
  oi: SourceOutcome;
}

/** The latest trading day whose end-of-day files should be out: today after 19:30 IST on a trading day, else the one before. */
export function targetDay(now: Date): string {
  const ist = istParts(now);
  return isTradingDay(ist.date) && ist.minutes >= 19 * 60 + 30 ? ist.date : previousTradingDay(ist.date);
}

type Attempt<T> = { kind: "ok"; value: T } | { kind: "not-found" } | { kind: "failed"; reason: string };

/** GET `url`, parse it, and retry a transient failure (network error, 5xx/429/403, an unparseable body) after a delay. A 404 is returned, not retried. */
async function getWithRetry<T>(deps: IngestDeps, what: string, url: string, parse: (body: string) => T): Promise<Attempt<T>> {
  let reason = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await deps.sleep(RETRY_DELAYS_MS[attempt - 1]);
    try {
      const res = await deps.fetcher(url);
      if (res.status === 404) return { kind: "not-found" };
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return { kind: "ok", value: parse(res.body) };
    } catch (e) {
      reason = e instanceof ParseError ? `unexpected content: ${e.message}` : e instanceof Error ? e.message.slice(0, 160) : "failed";
      deps.log(attempt < RETRY_DELAYS_MS.length ? "warn" : "error", `${what}: attempt ${attempt + 1} failed`, { url, reason });
    }
  }
  return { kind: "failed", reason };
}

/** Fetch and store the cash figures. The JSON names its own date, which is the date they are stored under. */
async function ingestCash(deps: IngestDeps, target: string): Promise<SourceOutcome> {
  const have = await deps.store.get(target);
  if (have?.cashFetched) return { status: "already-stored", date: target };
  const got = await getWithRetry(deps, "FII/DII cash", CASH_URL, parseCashJson);
  if (got.kind === "not-found") return { status: "not-published", date: target };
  if (got.kind === "failed") return { status: "failed", date: target, reason: got.reason };
  const { date, fii, dii } = got.value;
  const stored = await deps.store.get(date);
  if (stored?.cashFetched) {
    // NSE has not moved on to the target day yet: nothing new to store, and the next run tries again
    deps.log("info", "FII/DII cash: the source still shows a day we already hold", { shows: date, target });
    return date === target ? { status: "already-stored", date } : { status: "source-behind", date: target, shows: date };
  }
  await deps.store.upsert(date, { cash: { fii, dii }, provisional: true, cashFetchedAt: deps.now });
  deps.log("info", "FII/DII cash stored", { date });
  return date === target ? { status: "stored", date } : { status: "source-behind", date: target, shows: date };
}

/** Fetch and store the FII index-futures positions for `date`. */
async function ingestOi(deps: IngestDeps, date: string): Promise<SourceOutcome> {
  const have = await deps.store.get(date);
  if (have?.oiFetched) return { status: "already-stored", date };
  const got = await getWithRetry(deps, "participant open interest", oiUrl(date), (body) => {
    const p = parseParticipantOiCsv(body);
    if (p.date && p.date !== date) throw new ParseError(`the file is for ${p.date}, not ${date}`);
    return p;
  });
  if (got.kind === "not-found") {
    deps.log("info", "participant open interest: not published (a holiday, a weekend, or not out yet)", { date });
    return { status: "not-published", date };
  }
  if (got.kind === "failed") return { status: "failed", date, reason: got.reason };
  await deps.store.upsert(date, {
    idxFut: { long: got.value.long, short: got.value.short },
    // a row made only from this file has no provisional cash figures in it
    provisional: have ? undefined : false,
    oiFetchedAt: deps.now,
  });
  deps.log("info", "participant open interest stored", { date });
  return { status: "stored", date };
}

/** The daily run: fetch whatever is not yet stored for the latest trading day. */
export async function ingestLatest(deps: IngestDeps): Promise<IngestReport> {
  const target = targetDay(deps.now);
  const cash = await ingestCash(deps, target);
  const oi = await ingestOi(deps, target);
  for (const [name, o] of [["cash", cash], ["open interest", oi]] as const) {
    if (o.status === "failed") deps.log("error", `ingest: ${name} failed for ${o.date}`, { reason: o.reason });
  }
  return { target, cash, oi };
}

export interface BackfillReport {
  /** days whose open interest file was found and stored */
  stored: string[];
  /** days with no file (a holiday or not published): normal */
  none: string[];
  failed: { date: string; reason: string }[];
  /** days looked at and skipped because they were already stored */
  skipped: number;
  /** true when the run stopped at its fetch limit with days still to check */
  more: boolean;
}

/**
 * Fill earlier days from the participant open interest files, which exist per day. Only these files can be backfilled: the cash
 * JSON returns the latest day only, so earlier cash figures cannot be recovered and are left empty. Weekends are skipped, a day
 * already stored is skipped, a 404 (a holiday) is normal, and the run is bounded and spaced out so it stays polite.
 */
export async function backfillOi(deps: IngestDeps, opts: { days: number; maxFetches?: number; gapMs?: number }): Promise<BackfillReport> {
  const report: BackfillReport = { stored: [], none: [], failed: [], skipped: 0, more: false };
  const max = opts.maxFetches ?? 30;
  const gap = opts.gapMs ?? 400;
  let fetched = 0;
  const target = targetDay(deps.now);
  for (let i = 0; i < Math.max(0, Math.min(opts.days, 120)); i++) {
    const date = new Date(Date.parse(`${target}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10);
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    if ((await deps.store.get(date))?.oiFetched) {
      report.skipped++;
      continue;
    }
    if (fetched >= max) {
      report.more = true;
      break;
    }
    if (fetched > 0) await deps.sleep(gap);
    fetched++;
    const o = await ingestOi(deps, date);
    if (o.status === "stored") report.stored.push(date);
    else if (o.status === "not-published") report.none.push(date);
    else if (o.status === "failed") report.failed.push({ date, reason: o.reason });
  }
  return report;
}
