import { NextResponse } from "next/server";
import { OPTION_UNDERLYINGS, fetchOptionExpiries, upstoxToken } from "@/lib/upstox";

/**
 * Upcoming option expiry dates for an underlying (YYYY-MM-DD, soonest first) — enough for
 * an "EXPIRY TODAY" badge without pulling a whole chain.
 *
 *   GET /api/option-expiries?underlying=NIFTY  ->  { source: "live", expiries } or { source: "unavailable" }
 */
export async function GET(request: Request) {
  const underlying = new URL(request.url).searchParams.get("underlying") ?? "NIFTY";
  const key = OPTION_UNDERLYINGS[underlying];
  if (!key) return NextResponse.json({ error: "unknown underlying" }, { status: 400 });

  const token = upstoxToken();
  if (!token) {
    console.warn("[/api/option-expiries] UPSTOX_ANALYTICS_TOKEN is not set — serving unavailable");
    return NextResponse.json({ source: "unavailable" });
  }
  try {
    const { expiries } = await fetchOptionExpiries(token, key);
    if (expiries.length === 0) return NextResponse.json({ source: "unavailable" });
    return NextResponse.json({ source: "live", expiries }, { headers: { "Cache-Control": "public, s-maxage=600" } });
  } catch (err) {
    console.error(`[/api/option-expiries] ${underlying} failed:`, err);
    return NextResponse.json({ source: "unavailable" });
  }
}
