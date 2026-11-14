import { istDateString } from "../helpers";
import { ParseError, parseNavAll, type Scheme } from "./parse";
import { MIN_TRACKED_SCHEMES, trackedSchemes } from "./universe";
import { PERIODS, TOLERANCE_DAYS, returnsOf, subtractMonths, type NavPoint, type Returns } from "./returns";

/**
 * The nightly NAV job: one GET of AMFI's NAV file, then the tracked schemes (Direct plan, Growth option, open ended, fresh) are
 * written: their details and newest NAV, that day's NAV row, and their returns. A scheme publishes under its own NAV date, so a
 * fund house that is late is simply stored the next night under its true date. Dependencies are injected so the logic is tested
 * without a network or a database. The database is touched only if the file parsed and looks complete.
 */
export const NAV_ALL_URL = "https://www.amfiindia.com/spages/NAVAll.txt";
export const navHistoryUrl = (date: string): string => {
  const [y, m, d] = date.split("-");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1];
  const day = `${d}-${mon}-${y}`;
  return `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?tp=1&frmdt=${day}&todt=${day}`;
};

export interface SchemeRow {
  code: number;
  name: string;
  isin: string | null;
  amc: string;
  category: string;
  nav: number;
  /** YYYY-MM-DD */
  navDate: string;
}
export interface NavRow {
  code: number;
  date: string;
  nav: number;
}
export interface ReturnRow extends Record<"1m" | "6m" | "1y" | "3y" | "5y", number | null> {
  code: number;
}

export interface MfStore {
  /** insert or update the scheme rows (details, newest NAV and its date) */
  upsertSchemes(rows: SchemeRow[]): Promise<void>;
  /** insert NAV rows, leaving any that already exist; returns how many were new */
  insertNavs(rows: NavRow[]): Promise<number>;
  /** for each code, the newest stored NAV dated from `from` to `to` inclusive (YYYY-MM-DD), if any */
  anchorNavs(codes: number[], from: string, to: string): Promise<Map<number, NavPoint>>;
  updateReturns(rows: ReturnRow[]): Promise<void>;
}

export interface MfDeps {
  fetchText: (url: string) => Promise<string>;
  store: MfStore;
  now: Date;
  log: (level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) => void;
  /** override MIN_TRACKED_SCHEMES (tests only) */
  minTracked?: number;
}

export type MfOutcome =
  | { status: "stored"; tracked: number; navsInserted: number; newestNavDate: string | null; returnsUpdated: number }
  | { status: "failed"; reason: string };

export const toSchemeRow = (s: Scheme): SchemeRow => ({ code: Number(s.code), name: s.name, isin: s.isin, amc: s.amc, category: s.category, nav: s.nav, navDate: s.navDate });

/**
 * Work out and store returns for schemes whose newest NAV is already stored. Schemes are grouped by their newest NAV date (almost
 * all share one); for each period the stored NAV just before the date that far back is read, and the five returns are worked out
 * by the same rule as a scheme page (lib/mf/returns.ts).
 */
export async function refreshReturns(store: MfStore, schemes: Pick<SchemeRow, "code" | "nav" | "navDate">[]): Promise<number> {
  const byDate = new Map<string, typeof schemes>();
  for (const s of schemes) byDate.set(s.navDate, [...(byDate.get(s.navDate) ?? []), s]);
  const rows: ReturnRow[] = [];
  for (const [navDate, group] of byDate) {
    const codes = group.map((s) => s.code);
    const anchors = new Map<number, NavPoint[]>(codes.map((c) => [c, []]));
    for (const p of PERIODS) {
      const target = subtractMonths(navDate, p.months);
      const from = new Date(Date.parse(`${target}T00:00:00Z`) - TOLERANCE_DAYS * 86_400_000).toISOString().slice(0, 10);
      for (const [code, point] of await store.anchorNavs(codes, from, target)) anchors.get(code)?.push(point);
    }
    for (const s of group) {
      const pts = [...new Map([...(anchors.get(s.code) ?? []), { date: navDate, nav: s.nav }].map((p) => [p.date, p])).values()].sort((a, b) => (a.date < b.date ? -1 : 1));
      const r: Returns = returnsOf(pts);
      rows.push({ code: s.code, ...r });
    }
  }
  if (rows.length) await store.updateReturns(rows);
  return rows.length;
}

export async function ingestNavLatest(deps: MfDeps): Promise<MfOutcome> {
  let text: string;
  try {
    text = await deps.fetchText(NAV_ALL_URL);
  } catch (e) {
    deps.log("error", "NAV file could not be fetched", { reason: e instanceof Error ? e.message : "error" });
    return { status: "failed", reason: "fetch failed" };
  }
  let parsed;
  try {
    parsed = parseNavAll(text);
  } catch (e) {
    const reason = e instanceof ParseError ? e.message : "parse failed";
    deps.log("error", "NAV file could not be read", { reason });
    return { status: "failed", reason };
  }
  const tracked = trackedSchemes(parsed.items, istDateString(deps.now));
  const min = deps.minTracked ?? MIN_TRACKED_SCHEMES;
  if (tracked.length < min) {
    deps.log("error", "NAV file looks incomplete; nothing written", { tracked: tracked.length, expectedAtLeast: min });
    return { status: "failed", reason: `only ${tracked.length} tracked schemes (expected at least ${min}); nothing written` };
  }
  if (parsed.skipped.length > parsed.items.length * 0.05) deps.log("warn", "many NAV rows were skipped", { skipped: parsed.skipped.length, read: parsed.items.length });

  const rows = tracked.map(toSchemeRow);
  await deps.store.upsertSchemes(rows);
  const navsInserted = await deps.store.insertNavs(rows.map((r) => ({ code: r.code, date: r.navDate, nav: r.nav })));
  const returnsUpdated = await refreshReturns(deps.store, rows);
  const newest = rows.reduce<string | null>((m, r) => (m === null || r.navDate > m ? r.navDate : m), null);
  deps.log("info", "NAVs stored", { tracked: rows.length, navsInserted, newestNavDate: newest });
  return { status: "stored", tracked: rows.length, navsInserted, newestNavDate: newest, returnsUpdated };
}

/** A plain GET with a couple of retries. AMFI redirects www to portal, which fetch follows. */
export async function fetchAmfiText(url: string, tries = 3): Promise<string> {
  let last = "error";
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { redirect: "follow", cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (compatible; zestoxx)", Accept: "text/plain,*/*" } });
      if (res.ok) return await res.text();
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : "error";
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error(last);
}
