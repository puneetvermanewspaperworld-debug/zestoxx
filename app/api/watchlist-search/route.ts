import { NextResponse } from "next/server";
import { searchSymbols } from "@/lib/upstox-watchlist";

/**
 * Symbol/name search across every NSE equity, ETF and index (marking the ones with futures and options), for adding to a watchlist.
 *
 *   GET /api/watchlist-search?q=reli  ->  { results: [{ symbol, name, kind, fno }] }
 *   GET /api/watchlist-search?q=reli&options=1  ->  only the underlyings that have options and that the option chain can show
 *
 * Reads only the public instrument master, so it works without an Upstox token.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").slice(0, 40);
  const optionsOnly = params.get("options") === "1";
  try {
    return NextResponse.json({ results: await searchSymbols(q, 10, optionsOnly) }, { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch (err) {
    console.error("[/api/watchlist-search] failed:", err);
    return NextResponse.json({ results: [] });
  }
}
