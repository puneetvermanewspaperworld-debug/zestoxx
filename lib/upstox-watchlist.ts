import { fetchQuotesBatch, upstoxToken, type RawQuote } from "./upstox";
import { equityMovers, getUniverse, memoized, type StockInfo, type Universe } from "./upstox-movers";
import { titleCase } from "./movers";
import type { PopularList, WatchRow } from "./watchlists";

/**
 * Prices for watchlists. Server-only. Everything resolves NSE trading symbols through the
 * public instrument master (see upstox-movers.ts) and prices them with bulk LTP calls, so
 * any NSE-listed symbol works — not just the handful the terminal charts.
 */

const ROWS = 30;
const NEAR_N = 25;
const WEEK_RANGE_TTL = 6 * 3_600_000; // daily candles only change once a day
const HISTORY_DAYS = 365;
// Kept low on purpose: a burst of ~200 parallel candle calls got an IP rate-limited by Upstox's
// edge (Cloudflare 1015, ~5 min Retry-After). A few in flight is plenty for a cached hourly job.
const HISTORY_CONCURRENCY = 4;
let candlesBlockedUntil = 0;

const displayName = (s: StockInfo): string => s.shortName ?? titleCase(s.name);

const row = (s: StockInfo, q: RawQuote): WatchRow => ({
  symbol: s.symbol,
  name: displayName(s),
  ltp: q.ltp,
  change: q.cp > 0 ? q.ltp - q.cp : 0,
  changePct: q.cp > 0 ? ((q.ltp - q.cp) / q.cp) * 100 : null,
  volume: q.volume,
});

/** Rows for the given symbols, in the order asked. Unknown or untraded symbols drop out. */
export async function quoteRows(token: string, symbols: string[]): Promise<WatchRow[]> {
  const u = await getUniverse();
  const infos = symbols.map((sym) => u.bySymbol.get(sym)).filter((s): s is StockInfo => !!s);
  const quotes = await fetchQuotesBatch(token, infos.map((s) => s.key));
  const out: WatchRow[] = [];
  for (const s of infos) {
    const q = quotes.get(s.key);
    if (q && q.ltp > 0) out.push(row(s, q));
  }
  return out;
}

/** Symbol/name search over every NSE equity and ETF. Needs no Upstox token. */
export async function searchSymbols(query: string, limit = 8): Promise<{ symbol: string; name: string }[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const u = await getUniverse();
  const fno = new Set(u.fnoStocks.map((s) => s.symbol));
  const scored: { s: StockInfo; rank: number }[] = [];
  for (const s of u.allEq) {
    const sym = s.symbol.toLowerCase();
    const nm = displayName(s).toLowerCase();
    const rank = sym === q ? 0 : sym.startsWith(q) ? 1 : sym.includes(q) ? 2 : nm.includes(q) ? 3 : -1;
    if (rank >= 0) scored.push({ s, rank });
  }
  // Same match quality: F&O names (the liquid, well-known ones) first, then shorter symbols.
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(fno.has(b.s.symbol)) - Number(fno.has(a.s.symbol)) ||
      a.s.symbol.length - b.s.symbol.length
  );
  return scored.slice(0, limit).map(({ s }) => ({ symbol: s.symbol, name: displayName(s) }));
}

/* ------------------------------------------------------------- 52 weeks ---- */

interface Range {
  hi: number;
  lo: number;
}

/**
 * 52-week high/low for the F&O stocks, from a year of daily candles (about 220 calls,
 * well under a second in practice). Memoised for an hour; only liquid F&O names are
 * covered, which the UI says.
 */
async function weekRanges(token: string, u: Universe): Promise<Map<string, Range>> {
  return memoized("wl-52w", WEEK_RANGE_TTL, async () => {
    const to = new Date();
    const from = new Date(to.getTime() - HISTORY_DAYS * 86_400_000);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    if (Date.now() < candlesBlockedUntil) throw new Error("candle endpoint is rate-limited, backing off");
    const out = new Map<string, Range>();
    const queue = [...u.fnoStocks];

    const worker = async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        try {
          const res = await fetch(
            `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(s.key)}/days/1/${day(to)}/${day(from)}`,
            { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" }
          );
          if (res.status === 429) {
            // Stop at once and remember the Retry-After rather than hammering a limited endpoint.
            candlesBlockedUntil = Date.now() + Math.min(600, Math.max(30, Number(res.headers.get("retry-after")) || 120)) * 1000;
            queue.length = 0;
            return;
          }
          if (!res.ok) continue;
          const candles = ((await res.json()) as { data?: { candles?: (string | number)[][] } }).data?.candles ?? [];
          if (candles.length < 50) continue; // too short to call it a 52-week range
          let hi = -Infinity;
          let lo = Infinity;
          for (const c of candles) {
            hi = Math.max(hi, Number(c[2]));
            lo = Math.min(lo, Number(c[3]));
          }
          if (isFinite(hi) && isFinite(lo) && lo > 0) out.set(s.symbol, { hi, lo });
        } catch {
          // skip this symbol
        }
      }
    };
    await Promise.all(Array.from({ length: HISTORY_CONCURRENCY }, worker));
    if (out.size === 0) throw new Error("no 52-week data");
    return out;
  });
}

async function nearExtreme(token: string, side: "high" | "low"): Promise<WatchRow[]> {
  const u = await getUniverse();
  const [ranges, quotes] = await Promise.all([
    weekRanges(token, u),
    fetchQuotesBatch(token, u.fnoStocks.map((s) => s.key)),
  ]);
  const scored: { r: WatchRow; gap: number }[] = [];
  for (const s of u.fnoStocks) {
    const q = quotes.get(s.key);
    const range = ranges.get(s.symbol);
    if (!q || q.ltp <= 0 || !range) continue;
    // Today's price can itself set a new extreme the candles don't include yet.
    const hi = Math.max(range.hi, q.ltp);
    const lo = Math.min(range.lo, q.ltp);
    // Distance from the extreme as % of that extreme: 0 means "at it".
    const gap = side === "high" ? ((hi - q.ltp) / hi) * 100 : ((q.ltp - lo) / lo) * 100;
    scored.push({ r: { ...row(s, q), hi52: hi, lo52: lo }, gap });
  }
  return scored
    .sort((a, b) => a.gap - b.gap)
    .slice(0, NEAR_N)
    .map((x) => x.r);
}

/* ----------------------------------------------------------- popular lists -- */

const byValueDesc = (a: WatchRow, b: WatchRow) => b.ltp * b.volume - a.ltp * a.volume;

async function etfRows(token: string, pattern?: string): Promise<WatchRow[]> {
  const u = await getUniverse();
  const re = pattern ? new RegExp(pattern, "i") : null;
  const etfs = u.allEq.filter(
    (s) => s.isin?.startsWith("INF") && (!re || re.test(`${s.symbol} ${s.name} ${s.shortName ?? ""}`))
  );
  const quotes = await fetchQuotesBatch(token, etfs.map((s) => s.key));
  const rows: WatchRow[] = [];
  for (const s of etfs) {
    const q = quotes.get(s.key);
    if (q && q.ltp > 0 && q.volume > 0) rows.push(row(s, q));
  }
  return rows.sort(byValueDesc).slice(0, ROWS);
}

/** Priced rows for one popular list. */
export async function popularRows(list: PopularList): Promise<{ rows: WatchRow[]; note?: string }> {
  const token = upstoxToken();
  if (!token) throw new Error("UPSTOX_ANALYTICS_TOKEN is not set");
  const k = list.kind;
  switch (k.type) {
    case "static":
      return { rows: await quoteRows(token, k.symbols) };
    case "etf":
      return { rows: await etfRows(token, k.pattern), note: "Ranked by traded value today." };
    case "gainers":
    case "losers": {
      const m = await memoized("wl-movers-all", 15_000, () => equityMovers(token, "all"));
      const src = k.type === "gainers" ? m.gainers : m.losers;
      return {
        rows: src.map((s) => ({
          symbol: s.symbol,
          name: titleCase(s.name),
          ltp: s.ltp,
          change: s.change,
          changePct: s.changePct,
          volume: s.volume,
        })),
        note: "Stocks above ₹10 with at least ₹5 Cr traded today.",
      };
    }
    case "high52":
    case "low52":
      return {
        rows: await nearExtreme(token, k.type === "high52" ? "high" : "low"),
        note: "F&O stocks, nearest first. A stock at its extreme shows 0% away.",
      };
  }
}
