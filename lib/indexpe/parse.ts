import { ParseError } from "../nse/http";
import type { IndexDayRow } from "./types";

export { ParseError };

/**
 * NSE's daily index closing file (ind_close_all_DDMMYYYY.csv). One header line and one line per index:
 *   Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value,Points Change,Change(%),Volume,
 *   Turnover (Rs. Cr.),P/E,P/B,Div Yield
 *   Nifty 50,12-11-2026,25213.5,25384.8,25142.95,25299.35,44.3,.18,349198003,33608.35,20.62,3.1,1.39
 * Quirks handled: columns are found by name (any spacing or case, a few spellings), a UTF-8 BOM, LF or CRLF endings, quoted
 * cells, numbers with no leading zero (".18") or thousands commas, and "-" for a missing value (futures, leverage and strategy
 * indices have no P/E, P/B or yield). Anything that is not what we expect throws a ParseError and nothing is stored.
 */

const norm = (s: string): string => s.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").toLowerCase();

/** Split one CSV line, honouring double quotes ("Nifty 50, Equal Weight" stays one cell). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const MISSING = new Set(["", "-", "--", "na", "n/a", "nan", "null"]);

/** A number, or null for NSE's "-" (and blanks). Anything else that is not a number is an error: it means the layout changed. */
function cell(raw: string | undefined, what: string): number | null {
  const t = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (MISSING.has(t.toLowerCase())) return null;
  const n = Number(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new ParseError(`${what} is not a number ("${t.slice(0, 20)}")`);
  return n;
}

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "12-11-2026" or "12-Nov-2026" → "2026-11-12". */
export function parseIndexDate(raw: string): string {
  const m = /^(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{4})$/.exec(raw.trim());
  const mon = m ? (/^\d+$/.test(m[2]) ? Number(m[2]) : MON[m[2].toLowerCase()]) : undefined;
  const d = m ? Number(m[1]) : 0;
  const y = m ? Number(m[3]) : 0;
  const t = mon ? new Date(Date.UTC(y, mon - 1, d)) : null;
  if (!m || !mon || !t || t.getUTCFullYear() !== y || t.getUTCMonth() !== mon - 1 || t.getUTCDate() !== d) throw new ParseError(`unrecognised date "${raw}"`);
  return `${y}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Valuation figures outside a sane range are treated as "no value", not stored as fact. P/E and P/B must be above zero. */
const sane = (v: number | null, min: number, max: number): number | null => (v !== null && v > min && v < max ? v : null);
/** A dividend yield of exactly 0 is real (an index that pays nothing), so its lower bound is inclusive. */
const within = (v: number | null, min: number, max: number): number | null => (v !== null && v >= min && v < max ? v : null);

export function parseIndexCloseCsv(text: string): { date: string; rows: IndexDayRow[] } {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new ParseError("too short to be the index closing file");
  const head = splitCsvLine(lines[0]).map(norm);
  const col = (test: (h: string) => boolean, what: string): number => {
    const i = head.findIndex(test);
    if (i < 0) throw new ParseError(`no "${what}" column`);
    return i;
  };
  const iName = col((h) => h === "index name", "Index Name");
  const iDate = col((h) => h === "index date", "Index Date");
  const iClose = col((h) => h.startsWith("closing") || h === "close", "Closing Index Value");
  const iPe = col((h) => h === "p/e" || h === "pe", "P/E");
  const iPb = col((h) => h === "p/b" || h === "pb", "P/B");
  const iDy = col((h) => h.startsWith("div"), "Div Yield");

  const byName = new Map<string, IndexDayRow>();
  let date: string | null = null;
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line);
    const name = (c[iName] ?? "").replace(/\s+/g, " ").trim();
    if (!name || c.length <= Math.max(iClose, iPe, iPb, iDy)) continue; // a stray short line (a footer) is not a data row
    const d = parseIndexDate(c[iDate] ?? "");
    if (date && d !== date) throw new ParseError(`rows for different days (${date} and ${d})`);
    date = d;
    const close = cell(c[iClose], `${name} close`);
    if (close === null || close <= 0) throw new ParseError(`${name} has no closing value`);
    byName.set(name, {
      indexName: name,
      date: d,
      close,
      pe: sane(cell(c[iPe], `${name} P/E`), 0, 1000),
      pb: sane(cell(c[iPb], `${name} P/B`), 0, 100),
      divYield: within(cell(c[iDy], `${name} dividend yield`), 0, 50),
    });
  }
  if (!date || byName.size === 0) throw new ParseError("no index rows");
  return { date, rows: [...byName.values()] };
}
