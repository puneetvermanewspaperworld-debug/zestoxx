import { NextResponse } from "next/server";
import { depthKeyFor, fetchSymbolDepth, upstoxToken } from "@/lib/upstox";

/**
 * Real market depth (five bid and five ask levels) for one symbol from Upstox.
 *
 * GET /api/symbol-depth?symbol=RELIANCE
 *   -> { source: "live", bids, asks, totalBuyQty, totalSellQty }   levels may be empty outside market hours
 *   -> { source: "unsupported" }   indices and crypto have no order book
 *   -> { source: "unavailable" }   no token, or Upstox did not answer
 * Never a generated or random ladder: when there is nothing real, the client says so.
 */
export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  const key = depthKeyFor(symbol);
  if (!key) return NextResponse.json({ source: "unsupported" });

  const token = upstoxToken();
  if (!token) return NextResponse.json({ source: "unavailable" });
  try {
    return NextResponse.json({ source: "live", ...(await fetchSymbolDepth(token, key)) }, { headers: { "Cache-Control": "public, s-maxage=3" } });
  } catch (err) {
    console.error(`[/api/symbol-depth] ${symbol} failed:`, err);
    return NextResponse.json({ source: "unavailable" });
  }
}
