import { NextResponse } from "next/server";
import { upstoxToken } from "@/lib/upstox";
import { memoized } from "@/lib/upstox-movers";
import { popularRows, quoteRows } from "@/lib/upstox-watchlist";
import { MAX_SYMBOLS_PER_LIST, POPULAR_BY_ID, isNseSymbol, type WatchlistResponse } from "@/lib/watchlists";

/**
 * Priced rows for a watchlist.
 *
 *   GET /api/watchlist?list=gainers        a popular list (static, ETF, movers or 52-week)
 *   GET /api/watchlist?symbols=TCS,INFY    any NSE symbols (a custom watchlist)
 *
 * Answers `{source:"live", asOf, rows, note?}` or `{source:"unavailable"}` (HTTP 200 — the
 * UI shows an honest empty state instead of invented prices). Computed at most once per
 * 15 s per list per server instance, and CDN-cacheable for the same time, because Upstox's
 * rate limit is shared across everyone on the token.
 */
const TTL = 15_000;

const unavailable = (): NextResponse =>
  NextResponse.json({ source: "unavailable" } satisfies WatchlistResponse, {
    headers: { "Cache-Control": "no-store" },
  });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const listId = params.get("list");
  const symbolsParam = params.get("symbols");

  let cacheKey: string;
  let compute: () => Promise<{ rows: Awaited<ReturnType<typeof quoteRows>>; note?: string }>;

  if (listId) {
    const list = POPULAR_BY_ID[listId];
    if (!list) return NextResponse.json({ error: "unknown list" }, { status: 400 });
    cacheKey = `wl:list:${listId}`;
    compute = () => popularRows(list);
  } else if (symbolsParam !== null) {
    const symbols = [...new Set(symbolsParam.split(",").filter(Boolean))];
    if (symbols.length > MAX_SYMBOLS_PER_LIST || !symbols.every(isNseSymbol)) {
      return NextResponse.json({ error: "bad symbols" }, { status: 400 });
    }
    if (symbols.length === 0) return NextResponse.json({ source: "live", asOf: new Date().toISOString(), rows: [] });
    const token = upstoxToken();
    if (!token) {
      console.warn("[/api/watchlist] UPSTOX_ANALYTICS_TOKEN is not set — serving unavailable");
      return unavailable();
    }
    cacheKey = `wl:symbols:${symbols.join(",")}`;
    compute = async () => ({ rows: await quoteRows(token, symbols) });
  } else {
    return NextResponse.json({ error: "list or symbols required" }, { status: 400 });
  }

  if (!upstoxToken()) {
    console.warn("[/api/watchlist] UPSTOX_ANALYTICS_TOKEN is not set — serving unavailable");
    return unavailable();
  }

  try {
    const { rows, note } = await memoized(cacheKey, TTL, compute);
    return NextResponse.json(
      { source: "live", asOf: new Date().toISOString(), rows, note } satisfies WatchlistResponse,
      { headers: { "Cache-Control": "public, s-maxage=15" } }
    );
  } catch (err) {
    console.error(`[/api/watchlist] ${cacheKey} failed:`, err);
    return unavailable();
  }
}
