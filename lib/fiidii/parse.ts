import type { CashFigures, Flow, IdxFut } from "./types";

/**
 * Parsers for NSE's two public files. They are strict on purpose: a response that is not exactly what we expect (a block page, a
 * changed layout, a number that does not add up) throws a ParseError and nothing is stored, rather than storing a guess.
 */

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number): string => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function validDate(y: number, m: number, d: number): boolean {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** "11-Nov-2026" (the cash JSON) → "2026-11-11". */
export function parseNseDate(s: string): string {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(s).trim());
  const mon = m ? MONTHS[m[2].toLowerCase()] : undefined;
  if (!m || !mon || !validDate(Number(m[3]), mon, Number(m[1]))) throw new ParseError(`unrecognised date "${s}"`);
  return iso(Number(m[3]), mon, Number(m[1]));
}

function num(v: unknown, what: string): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(n) || String(v ?? "").trim() === "") throw new ParseError(`${what} is not a number ("${String(v)}")`);
  return n;
}

function flow(row: Record<string, unknown>, who: string): Flow {
  const buy = num(row.buyValue, `${who} buy`);
  const sell = num(row.sellValue, `${who} sell`);
  const net = num(row.netValue, `${who} net`);
  if (buy < 0 || sell < 0) throw new ParseError(`${who} buy/sell is negative`);
  // NSE rounds each figure to two decimals, so buy − sell can differ from net by a paisa or two, never by a crore.
  if (Math.abs(buy - sell - net) > 0.05) throw new ParseError(`${who} net ${net} does not equal buy ${buy} minus sell ${sell}`);
  return { buy, sell, net };
}

/**
 * NSE's FII/DII cash market JSON (https://www.nseindia.com/api/fiidiiTradeReact):
 * `[{category:"DII", date:"11-Nov-2026", buyValue:"19704.39", sellValue:"28138.92", netValue:"-8434.53"}, {category:"FII/FPI", ...}]`.
 * It carries only the latest day. Returns that day's date (YYYY-MM-DD) and both entities' figures in ₹ crore.
 */
export function parseCashJson(text: string): { date: string } & CashFigures {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ParseError("not JSON");
  }
  if (!Array.isArray(data)) throw new ParseError("expected a list of categories");
  const rows = data.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);
  const find = (prefix: string) => rows.filter((r) => String(r.category ?? "").trim().toUpperCase().startsWith(prefix));
  const fii = find("FII");
  const dii = find("DII");
  if (fii.length !== 1 || dii.length !== 1) throw new ParseError(`expected one FII and one DII row, got ${fii.length} and ${dii.length}`);
  const dFii = parseNseDate(String(fii[0].date));
  const dDii = parseNseDate(String(dii[0].date));
  if (dFii !== dDii) throw new ParseError(`FII row is for ${dFii} but DII row is for ${dDii}`);
  return { date: dFii, fii: flow(fii[0], "FII"), dii: flow(dii[0], "DII") };
}

/**
 * NSE's participant-wise open interest file (fao_participant_oi_DDMMYYYY.csv): a title line ("... as on Nov 11, 2026"), a header
 * line ("Client Type,Future Index Long,Future Index Short,...") and one row per participant (Client, DII, FII, Pro, TOTAL).
 * Returns the FII row's index-futures long and short contracts, and the date from the title (null if the title has none).
 */
export function parseParticipantOiCsv(text: string): { date: string | null } & IdxFut {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 3) throw new ParseError("too short to be the participant open interest file");
  const title = /as on ([A-Za-z]{3})[a-z]* (\d{1,2}), (\d{4})/i.exec(lines[0]);
  let date: string | null = null;
  if (title) {
    const mon = MONTHS[title[1].toLowerCase()];
    if (!mon || !validDate(Number(title[3]), mon, Number(title[2]))) throw new ParseError("unrecognised date in the title line");
    date = iso(Number(title[3]), mon, Number(title[2]));
  }
  const h = lines.findIndex((l) => l.split(",")[0].trim().toLowerCase() === "client type");
  if (h < 0) throw new ParseError('no "Client Type" header line');
  const header = lines[h].split(",").map((c) => c.trim().toLowerCase());
  const iLong = header.indexOf("future index long");
  const iShort = header.indexOf("future index short");
  if (iLong < 0 || iShort < 0) throw new ParseError("no Future Index Long / Short columns");
  const fii = lines.slice(h + 1).find((l) => l.split(",")[0].trim().toUpperCase() === "FII");
  if (!fii) throw new ParseError("no FII row");
  const cells = fii.split(",");
  const long = num(cells[iLong], "FII index futures long");
  const short = num(cells[iShort], "FII index futures short");
  if (long < 0 || short < 0 || !Number.isInteger(long) || !Number.isInteger(short)) throw new ParseError("index futures contracts must be whole, non-negative numbers");
  return { date, long, short };
}
