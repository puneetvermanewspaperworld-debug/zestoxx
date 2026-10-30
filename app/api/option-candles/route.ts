import { NextResponse } from "next/server";
import { fetchContractCandles, isDerivativeKey, upstoxToken } from "@/lib/upstox";

/**
 * Today's 5-minute candles for one option contract.
 *
 * GET /api/option-candles?key=NSE_FO|53750  ->  { source: "live", candles } or { source: "unavailable" }
 */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!isDerivativeKey(key)) return NextResponse.json({ error: "bad instrument key" }, { status: 400 });

  const token = upstoxToken();
  if (!token) {
    console.warn("[/api/option-candles] UPSTOX_ANALYTICS_TOKEN is not set — serving unavailable");
    return NextResponse.json({ source: "unavailable" });
  }
  try {
    const candles = await fetchContractCandles(token, key);
    return NextResponse.json({ source: "live", candles }, { headers: { "Cache-Control": "public, s-maxage=30" } });
  } catch (err) {
    console.error(`[/api/option-candles] ${key} failed:`, err);
    return NextResponse.json({ source: "unavailable" });
  }
}
