/**
 * Parser for AMFI's two NAV text files. Both are semicolon-separated with section lines mixed in:
 *
 *   NAVAll.txt (today's NAV of every scheme)      https://www.amfiindia.com/spages/NAVAll.txt
 *     Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date
 *   NAV history report (a date range)             https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?tp=1&frmdt=..&todt=..[&mf=..]
 *     Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date
 *
 * The column order differs between the two and has changed before (Plan and Option were added ahead of NAV), so columns are found
 * by header name and never by position. Section lines say what the rows below belong to:
 *
 *   Open Ended Schemes(Equity Scheme - Large Cap Fund)       (the live file)
 *   Open Ended Schemes ( Equity Scheme - Large Cap Fund )    (the history report: spaces inside the brackets)
 *   Axis Mutual Fund                                         a fund house; every scheme below it belongs to it
 *
 * Nothing is guessed: a row that cannot be read is skipped and reported, never repaired. No network here; the caller passes the text.
 */

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export type SchemeKind = "Open Ended" | "Close Ended" | "Interval";
export type PlanType = "Direct" | "Regular";
export type OptionType = "Growth" | "IDCW";

/** One scheme as the live file lists it. */
export interface Scheme {
  code: string;
  name: string;
  /** ISIN for the growth units, or the dividend-payout ISIN for an IDCW option */
  isin: string | null;
  isinReinvest: string | null;
  /** from the Plan column, else from the scheme name; null when neither says */
  plan: PlanType | null;
  /** from the Option column, else from the scheme name; null when neither says */
  option: OptionType | null;
  kind: SchemeKind;
  /** the category as AMFI writes it, spaces tidied: "Equity Scheme - Large Cap Fund" */
  category: string;
  amc: string;
  nav: number;
  /** YYYY-MM-DD, this scheme's own last NAV date */
  navDate: string;
}

/** One dated NAV, from the history report. */
export interface NavPoint {
  code: string;
  /** YYYY-MM-DD */
  date: string;
  nav: number;
}

export interface Skipped {
  line: number;
  reason: string;
  text: string;
}

export interface Parsed<T> {
  items: T[];
  skipped: Skipped[];
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "12-Nov-2026" -> "2026-11-12"; null for anything else (including a calendar-impossible date). */
export function parseAmfiDate(s: string): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  if (!mm) return null;
  const iso = `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** A NAV is a plain positive decimal. "N.A.", "-", "" and anything else is not a NAV. */
export function parseNav(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z/]/g, "");

interface Columns {
  code: number;
  name: number;
  plan: number | null;
  option: number | null;
  isin: number | null;
  isinReinvest: number | null;
  nav: number;
  date: number;
}

/** Finds the columns by header name. Throws, naming the column, when one that is needed is missing. */
export function readHeader(line: string): Columns {
  const cells = line.split(";").map(norm);
  const find = (...names: string[]) => {
    const i = cells.findIndex((c) => names.includes(c));
    return i < 0 ? null : i;
  };
  const need = (what: string, i: number | null) => {
    if (i === null) throw new ParseError(`the header has no "${what}" column`);
    return i;
  };
  return {
    code: need("Scheme Code", find("schemecode")),
    name: need("Scheme Name", find("schemename", "navname")),
    plan: find("plan"),
    option: find("option"),
    isin: find("isindivpayout/isingrowth", "isindivpayout/ isingrowth"),
    isinReinvest: find("isindivreinvestment"),
    nav: need("Net Asset Value", find("netassetvalue")),
    date: need("Date", find("date")),
  };
}

const SECTION = /^(Open Ended|Close Ended|Interval Fund)\s+Schemes?\s*\(\s*(.*?)\s*\)\s*$/i;

export interface Section {
  kind: SchemeKind;
  category: string;
}

/** A "Open Ended Schemes(...)" line, or null when the line is something else (a fund house, usually). */
export function parseSection(line: string): Section | null {
  const m = SECTION.exec(line.trim());
  if (!m) return null;
  const head = m[1].toLowerCase();
  const kind: SchemeKind = head.startsWith("open") ? "Open Ended" : head.startsWith("close") ? "Close Ended" : "Interval";
  // tidy: AMFI sometimes double-spaces words, and marks a footnote with "**"
  const category = m[2].replace(/\*+/g, "").replace(/\s+/g, " ").trim();
  return { kind, category };
}

/** Plan from the Plan column ("Direct Plan"), else from the scheme name. */
export function planOf(planCell: string | undefined, name: string): PlanType | null {
  const s = `${planCell ?? ""}`;
  if (/direct/i.test(s)) return "Direct";
  if (/regular/i.test(s)) return "Regular";
  if (s.trim() !== "") return null;
  if (/\bdirect\b/i.test(name)) return "Direct";
  if (/\bregular\b/i.test(name)) return "Regular";
  return null;
}

/** Option from the Option column ("Growth Option", "IDCW", "Monthly IDCW", "Dividend"), else from the scheme name. */
export function optionOf(optionCell: string | undefined, name: string): OptionType | null {
  const s = `${optionCell ?? ""}`.trim() === "" ? name : `${optionCell}`;
  if (/idcw|dividend|income distribution|payout|reinvest/i.test(s)) return "IDCW";
  if (/growth/i.test(s)) return "Growth";
  return null;
}

const dataLine = (l: string) => l.includes(";");

function splitLines(text: string): string[] {
  return text.replace(/^﻿/, "").split(/\r\n|\n|\r/);
}

/**
 * Today's NAV of every scheme (NAVAll.txt). A row needs a code, a name, a readable NAV and date, and a category and fund house
 * above it; a row without one of those is skipped with its reason. Duplicate codes keep the row with the newer date.
 */
export function parseNavAll(text: string): Parsed<Scheme> {
  const lines = splitLines(text);
  const hi = lines.findIndex((l) => /^\s*Scheme Code\s*;/i.test(l));
  if (hi < 0) throw new ParseError("no header line starting with \"Scheme Code\": this is not an AMFI NAV file");
  const col = readHeader(lines[hi]);

  const items = new Map<string, Scheme>();
  const skipped: Skipped[] = [];
  let section: Section | null = null;
  let amc: string | null = null;

  for (let i = hi + 1; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;
    if (!dataLine(line)) {
      const s = parseSection(line);
      if (s) {
        section = s;
        amc = null;
      } else {
        amc = line;
      }
      continue;
    }
    const c = line.split(";").map((x) => x.trim());
    const code = c[col.code];
    const name = c[col.name];
    const nav = parseNav(c[col.nav] ?? "");
    const navDate = parseAmfiDate(c[col.date] ?? "");
    const fail = (reason: string) => skipped.push({ line: i + 1, reason, text: line.slice(0, 120) });
    if (!/^\d+$/.test(code ?? "")) {
      fail("scheme code is not a number");
      continue;
    }
    if (!name) {
      fail("no scheme name");
      continue;
    }
    if (nav === null) {
      fail(`NAV is not a number ("${c[col.nav] ?? ""}")`);
      continue;
    }
    if (navDate === null) {
      fail(`NAV date is not a date ("${c[col.date] ?? ""}")`);
      continue;
    }
    if (!section || !amc) {
      fail("row is not under a category and a fund house");
      continue;
    }
    const dash = (v: string | undefined) => (v && v !== "-" ? v : null);
    const scheme: Scheme = {
      code,
      name,
      isin: dash(col.isin === null ? undefined : c[col.isin]),
      isinReinvest: dash(col.isinReinvest === null ? undefined : c[col.isinReinvest]),
      plan: planOf(col.plan === null ? undefined : c[col.plan], name),
      option: optionOf(col.option === null ? undefined : c[col.option], name),
      kind: section.kind,
      category: section.category,
      amc,
      nav,
      navDate,
    };
    const prev = items.get(code);
    if (!prev || prev.navDate < scheme.navDate) items.set(code, scheme);
  }
  return { items: [...items.values()], skipped };
}

/** Dated NAVs from the history report: scheme code, date, NAV. Section and fund-house lines are ignored. */
export function parseNavHistory(text: string): Parsed<NavPoint> {
  const lines = splitLines(text);
  const hi = lines.findIndex((l) => /^\s*Scheme Code\s*;/i.test(l));
  if (hi < 0) throw new ParseError("no header line starting with \"Scheme Code\": this is not an AMFI NAV history file");
  const col = readHeader(lines[hi]);
  const items: NavPoint[] = [];
  const skipped: Skipped[] = [];
  for (let i = hi + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || !dataLine(line)) continue;
    const c = line.split(";").map((x) => x.trim());
    const code = c[col.code];
    const nav = parseNav(c[col.nav] ?? "");
    const date = parseAmfiDate(c[col.date] ?? "");
    if (!/^\d+$/.test(code ?? "") || nav === null || date === null) {
      skipped.push({ line: i + 1, reason: "row has no readable code, NAV and date", text: line.slice(0, 120) });
      continue;
    }
    items.push({ code, date, nav });
  }
  return { items, skipped };
}

/* ------------------------------------------------------------------ hiding -- */

export const STALE_AFTER_DAYS = 7;

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** Calendar days from a NAV date to `today` (both YYYY-MM-DD). */
export const daysOld = (navDate: string, today: string): number => dayNumber(today) - dayNumber(navDate);

/** A scheme that has stopped publishing, or says it has matured or been wound up, is not shown. */
export function isHidden(s: Pick<Scheme, "name" | "navDate">, today: string): boolean {
  return daysOld(s.navDate, today) > STALE_AFTER_DAYS || /\b(matured|wound up)\b/i.test(s.name);
}

/** The schemes worth showing: fresh and not matured. */
export const visibleSchemes = (schemes: Scheme[], today: string): Scheme[] => schemes.filter((s) => !isHidden(s, today));
