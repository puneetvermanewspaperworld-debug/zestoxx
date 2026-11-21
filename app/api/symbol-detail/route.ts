import { NextResponse } from "next/server";
import { UPSTOX_KEYS, fetchSymbolDetail, upstoxToken } from "@/lib/upstox";
import { getUniverse } from "@/lib/upstox-movers";
import { isWatchSymbol } from "@/lib/watchlists";

/**
 * What the symbol sheet shows beyond the price: the day's open, high and low, and real five-level market depth (listed equities only).
 *
 * GET /api/symbol-detail?symbol=RELIANCE  (any NSE trading symbol, an index id, or one the app charts)
 *   -> { source: "live", ltp, ohlc: { open, high, low }, depth: { bids, asks, totalBuyQty, totalSellQty } | null }
 *   -> { source: "unsupported" }   crypto: not on this feed
 *   -> { source: "unavailable" }   no token, an unknown symbol, or Upstox did not answer
 * Nothing here is generated: a missing piece is null or the whole answer is "unavailable", and the sheet says so. Five levels is what the
 * quote carries; twenty-level depth needs the exchange's live stream, which Zestoxx does not have.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  if (!isWatchSymbol(symbol)) return NextResponse.json({ source: "unavailable" });
  if (["BTC", "ETH", "SOL"].includes(symbol)) return NextResponse.json({ source: "unsupported" });
  const token = upstoxToken();
  if (!token) return NextResponse.json({ source: "unavailable" });
  try {
    let key = UPSTOX_KEYS[symbol];
    if (!key) {
      const u = await getUniverse();
      key = (u.bySymbol.get(symbol) ?? u.indices.get(symbol))?.key ?? "";
    }
    if (!key) return NextResponse.json({ source: "unavailable" });
    return NextResponse.json({ source: "live", ...(await fetchSymbolDetail(token, key)) }, { headers: { "Cache-Control": "public, s-maxage=3" } });
  } catch (err) {
    console.error(`[/api/symbol-detail] ${symbol} failed:`, err);
    return NextResponse.json({ source: "unavailable" });
  }
}
