import { NextResponse } from "next/server";
import { searchSymbols } from "@/lib/upstox-watchlist";

/**
 * Symbol/name search across every NSE equity, ETF and index (marking the ones with futures and options), for adding to a watchlist.
 *
 *   GET /api/watchlist-search?q=reli  ->  { results: [{ symbol, name, kind, fno }] }
 *
 * Reads only the public instrument master, so it works without an Upstox token.
 */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 40);
  try {
    return NextResponse.json({ results: await searchSymbols(q) }, { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch (err) {
    console.error("[/api/watchlist-search] failed:", err);
    return NextResponse.json({ results: [] });
  }
}
