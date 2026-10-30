import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { fetchQuotesBatch, istToday, type RawQuote } from "./upstox";
import { EQUITY_FILTER } from "./movers";
import type {
  FutureMover,
  FutureMovers,
  OptionContract,
  OptionKind,
  OptionMovers,
  StockMover,
  StockMovers,
} from "./movers";

/**
 * Market-wide movers. Server-only.
 *
 * The F&O universe and each month's *current* futures/options keys come from Upstox's
 * public NSE instrument master (~1.9 MB gzipped, ~0.8 s to download and parse). It is
 * re-read every few hours, so new expiries and new F&O stocks appear on their own —
 * there's no static list to go stale.
 */

const MASTER_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const MASTER_TTL = 6 * 3_600_000;

const MIN_TURNOVER = EQUITY_FILTER.minTurnoverCr * 1e7; // ₹ Cr -> ₹
const TOP_N = 20;
const OPTSTK_UNDERLYINGS = 25;
const OPTION_ROWS = 100;
const INDEX_OPTION_UNDERLYINGS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"];
const INDEX_FUTURES = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"];

/* ------------------------------------------------------------- universe ----- */

interface StockInfo {
  symbol: string;
  name: string;
  key: string;
  lot?: number;
}

interface FutInfo {
  symbol: string;
  name: string;
  key: string;
  expiry: string;
  lot: number;
  isIndex: boolean;
}

interface OptRef {
  key: string;
  strike: number;
  type: "CE" | "PE";
}

interface OptionSeries {
  lot: number;
  isIndex: boolean;
  byExpiry: Map<string, OptRef[]>;
}

interface Universe {
  allEq: StockInfo[];
  fnoStocks: StockInfo[];
  futures: FutInfo[];
  options: Map<string, OptionSeries>;
}

interface MasterItem {
  segment?: string;
  instrument_type?: string;
  instrument_key: string;
  trading_symbol?: string;
  name?: string;
  lot_size?: number;
  expiry?: number;
  underlying_symbol?: string;
  underlying_key?: string;
  underlying_type?: string;
  strike_price?: number;
}

const gunzipAsync = promisify(gunzip);

async function buildUniverse(): Promise<Universe> {
  // Not run through Next's data cache: ~2 MB body, and we keep the parsed result ourselves.
  const res = await fetch(MASTER_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`instrument master ${res.status}`);
  const raw = JSON.parse((await gunzipAsync(Buffer.from(await res.arrayBuffer()))).toString("utf8")) as MasterItem[];

  const allEq: StockInfo[] = [];
  const fno = new Map<string, StockInfo>();
  const futures: FutInfo[] = [];
  const options = new Map<string, OptionSeries>();

  for (const i of raw) {
    if (i.segment === "NSE_EQ" && i.instrument_type === "EQ" && i.trading_symbol) {
      allEq.push({ symbol: i.trading_symbol, name: i.name ?? i.trading_symbol, key: i.instrument_key });
      continue;
    }
    if (i.segment !== "NSE_FO" || !i.expiry || !i.underlying_symbol) continue;

    const sym = i.underlying_symbol;
    const expiry = new Date(i.expiry).toISOString().slice(0, 10);
    const isIndex = i.underlying_type === "INDEX";

    if (!isIndex && i.underlying_key && !fno.has(sym)) {
      fno.set(sym, { symbol: sym, name: i.name ?? sym, key: i.underlying_key, lot: i.lot_size });
    }

    if (i.instrument_type === "FUT") {
      futures.push({ symbol: sym, name: i.name ?? sym, key: i.instrument_key, expiry, lot: i.lot_size ?? 1, isIndex });
    } else if (i.instrument_type === "CE" || i.instrument_type === "PE") {
      let series = options.get(sym);
      if (!series) options.set(sym, (series = { lot: i.lot_size ?? 1, isIndex, byExpiry: new Map() }));
      const list = series.byExpiry.get(expiry);
      const ref: OptRef = { key: i.instrument_key, strike: i.strike_price ?? 0, type: i.instrument_type };
      if (list) list.push(ref);
      else series.byExpiry.set(expiry, [ref]);
    }
  }

  return { allEq, fnoStocks: [...fno.values()], futures, options };
}

let universe: { at: number; promise: Promise<Universe> } | null = null;

export function getUniverse(): Promise<Universe> {
  if (universe && Date.now() - universe.at < MASTER_TTL) return universe.promise;
  const promise = buildUniverse();
  const entry = { at: Date.now(), promise };
  universe = entry;
  // A failed load must not be remembered for six hours.
  promise.catch(() => {
    if (universe === entry) universe = null;
  });
  return promise;
}

/* ------------------------------------------------------- tiny result memo ---- */

const memo = new Map<string, { at: number; value: Promise<unknown> }>();

/** Share one computation between concurrent/near-simultaneous callers for `ttlMs`. */
export function memoized<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn();
  const entry = { at: Date.now(), value };
  memo.set(key, entry);
  value.catch(() => {
    if (memo.get(key) === entry) memo.delete(key);
  });
  return value;
}

/* --------------------------------------------------------------- helpers ----- */

const pctChange = (ltp: number, cp: number) => ((ltp - cp) / cp) * 100;

/** Nearest expiry that hasn't passed, per call (IST). */
function nearest<T extends { expiry: string }>(items: T[]): T | undefined {
  const today = istToday();
  return items.filter((i) => i.expiry >= today).sort((a, b) => (a.expiry < b.expiry ? -1 : 1))[0];
}

const nearestFutures = (u: Universe, symbols?: string[]): FutInfo[] => {
  const bySymbol = new Map<string, FutInfo[]>();
  for (const f of u.futures) {
    if (symbols && !symbols.includes(f.symbol)) continue;
    const list = bySymbol.get(f.symbol);
    if (list) list.push(f);
    else bySymbol.set(f.symbol, [f]);
  }
  return [...bySymbol.values()].map((l) => nearest(l)).filter((f): f is FutInfo => !!f);
};

const live = (q: RawQuote | undefined): q is RawQuote => !!q && q.ltp > 0 && q.cp > 0 && q.volume > 0;

/* --------------------------------------------------------------- rankers ----- */

export async function equityMovers(token: string, scope: "all" | "fno"): Promise<StockMovers> {
  const u = await getUniverse();
  const list = scope === "all" ? u.allEq : u.fnoStocks;
  const lots = new Map(u.fnoStocks.map((s) => [s.symbol, s.lot]));
  const quotes = await fetchQuotesBatch(token, list.map((s) => s.key));

  const rows: StockMover[] = [];
  for (const s of list) {
    const q = quotes.get(s.key);
    if (!live(q)) continue;
    const value = q.ltp * q.volume;
    if (scope === "all" && (q.ltp < EQUITY_FILTER.minPrice || value < MIN_TURNOVER)) continue;
    rows.push({
      symbol: s.symbol,
      name: s.name,
      ltp: q.ltp,
      change: q.ltp - q.cp,
      changePct: pctChange(q.ltp, q.cp),
      volume: q.volume,
      value,
      lot: lots.get(s.symbol),
    });
  }

  return {
    gainers: rows.filter((r) => r.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, TOP_N),
    losers: rows.filter((r) => r.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, TOP_N),
    active: [...rows].sort((a, b) => b.value - a.value).slice(0, TOP_N),
    ranked: rows.length,
    scanned: list.length,
  };
}

async function futureRows(token: string, futs: FutInfo[]): Promise<FutureMover[]> {
  const quotes = await fetchQuotesBatch(token, futs.map((f) => f.key));
  const rows: FutureMover[] = [];
  for (const f of futs) {
    const q = quotes.get(f.key);
    if (!live(q)) continue;
    rows.push({
      symbol: f.symbol,
      name: f.name,
      expiry: f.expiry,
      ltp: q.ltp,
      change: q.ltp - q.cp,
      changePct: pctChange(q.ltp, q.cp),
      volume: q.volume,
      lot: f.lot,
      isIndex: f.isIndex,
    });
  }
  return rows;
}

export async function futuresMovers(token: string): Promise<FutureMovers> {
  const u = await getUniverse();
  const stocks = nearestFutures(u).filter((f) => !f.isIndex);
  const indices = nearestFutures(u, INDEX_FUTURES);
  const futs = [...stocks, ...indices];
  const rows = await futureRows(token, futs);
  return {
    gainers: rows.filter((r) => r.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, TOP_N),
    losers: rows.filter((r) => r.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, TOP_N),
    scanned: futs.length,
  };
}

export async function optionsMovers(token: string, kind: OptionKind): Promise<OptionMovers> {
  const u = await getUniverse();

  let underlyings: string[];
  if (kind === "OPTIDX") {
    underlyings = INDEX_OPTION_UNDERLYINGS.filter((s) => u.options.get(s)?.isIndex);
  } else {
    // Stock options: take the stocks whose futures trade the most value today.
    const futs = nearestFutures(u).filter((f) => !f.isIndex && u.options.get(f.symbol));
    const quotes = await fetchQuotesBatch(token, futs.map((f) => f.key));
    underlyings = futs
      .map((f) => ({ symbol: f.symbol, turnover: (quotes.get(f.key)?.ltp ?? 0) * (quotes.get(f.key)?.volume ?? 0) }))
      .sort((a, b) => b.turnover - a.turnover)
      .slice(0, OPTSTK_UNDERLYINGS)
      .map((x) => x.symbol);
  }

  const today = istToday();
  const refs: { symbol: string; expiry: string; lot: number; ref: OptRef }[] = [];
  for (const symbol of underlyings) {
    const series = u.options.get(symbol);
    if (!series) continue;
    const expiry = [...series.byExpiry.keys()].filter((e) => e >= today).sort()[0];
    if (!expiry) continue;
    for (const ref of series.byExpiry.get(expiry) ?? []) refs.push({ symbol, expiry, lot: series.lot, ref });
  }

  const quotes = await fetchQuotesBatch(token, refs.map((r) => r.ref.key));
  const contracts: OptionContract[] = [];
  for (const r of refs) {
    const q = quotes.get(r.ref.key);
    if (!q || q.ltp <= 0 || q.volume <= 0) continue;
    const hasPrev = q.cp > 0;
    contracts.push({
      symbol: r.symbol,
      expiry: r.expiry,
      strike: r.ref.strike,
      type: r.ref.type,
      ltp: q.ltp,
      change: hasPrev ? q.ltp - q.cp : 0,
      changePct: hasPrev ? pctChange(q.ltp, q.cp) : null,
      volume: q.volume,
      value: q.ltp * q.volume,
      lot: r.lot,
    });
  }

  return {
    contracts: contracts.sort((a, b) => b.value - a.value).slice(0, OPTION_ROWS),
    underlyings,
    scanned: refs.length,
  };
}
