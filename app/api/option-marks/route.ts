import { NextResponse } from "next/server";
import { fetchQuotesBatch, isDerivativeKey, upstoxToken } from "@/lib/upstox";

/**
 * Last prices for the option contracts a paper portfolio holds, so positions can be
 * marked to market.
 *
 * GET /api/option-marks?keys=NSE_FO|53750,NSE_FO|53781  ->  { source: "live", marks: { [key]: ltp } }
 *   or { source: "unavailable" }
 */
const MAX_KEYS = 50;

export async function GET(request: Request) {
  const keys = (new URL(request.url).searchParams.get("keys") ?? "").split(",").filter(Boolean);
  if (keys.length === 0 || keys.length > MAX_KEYS || !keys.every(isDerivativeKey)) {
    return NextResponse.json({ error: "bad instrument keys" }, { status: 400 });
  }

  const token = upstoxToken();
  if (!token) {
    console.warn("[/api/option-marks] UPSTOX_ANALYTICS_TOKEN is not set — serving unavailable");
    return NextResponse.json({ source: "unavailable" });
  }
  try {
    const quotes = await fetchQuotesBatch(token, keys);
    const marks: Record<string, number> = {};
    for (const [key, q] of quotes) if (q.ltp > 0) marks[key] = q.ltp;
    return NextResponse.json({ source: "live", marks }, { headers: { "Cache-Control": "public, s-maxage=5" } });
  } catch (err) {
    console.error("[/api/option-marks] failed:", err);
    return NextResponse.json({ source: "unavailable" });
  }
}
