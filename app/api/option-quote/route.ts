import { NextResponse } from "next/server";
import { fetchContractQuote, isDerivativeKey, upstoxToken } from "@/lib/upstox";

/**
 * Full quote for one option contract — OHLC, five-level depth, buy/sell quantity totals.
 *
 * GET /api/option-quote?key=NSE_FO|53750  ->  ContractQuote (source "live") or { source: "unavailable" }
 *
 * "unavailable" is a 200: the order sheet then shows a labelled simulation instead.
 */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!isDerivativeKey(key)) return NextResponse.json({ error: "bad instrument key" }, { status: 400 });

  const token = upstoxToken();
  if (!token) {
    console.warn("[/api/option-quote] UPSTOX_ANALYTICS_TOKEN is not set — serving unavailable");
    return NextResponse.json({ source: "unavailable" });
  }
  try {
    return NextResponse.json(await fetchContractQuote(token, key), {
      headers: { "Cache-Control": "public, s-maxage=3" },
    });
  } catch (err) {
    console.error(`[/api/option-quote] ${key} failed:`, err);
    return NextResponse.json({ source: "unavailable" });
  }
}
