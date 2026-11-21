import { NextResponse } from "next/server";
import { upstoxToken } from "@/lib/upstox";
import { memoized } from "@/lib/upstox-movers";
import { dynamicQuotes } from "@/lib/upstox-quotes";
import { MAX_QUOTE_SYMBOLS, type DynamicQuote } from "@/lib/dynamic-symbols";
import { isNseSymbol } from "@/lib/watchlists";
import { clientIp } from "@/lib/guest";
import { makeLimiter } from "@/lib/rateLimit";

/**
 * Live quotes for the NSE equities and ETFs the app does not chart on its own: only the symbols that are on screen (or that an order, alert or
 * position needs watching), asked for together.
 *
 *   GET /api/quotes?symbols=TCS,ITC   ->  { source: "live", quotes: { ITC: { state: "live", ltp, prevClose, name }, XYZ: { state: "none", prevClose, name } } }
 *   state "none"    listed, but no recent trade: there is no price and none is made up
 *   state "unknown" not an NSE equity or ETF on the instrument list
 *   { source: "unavailable" }   no token, or Upstox did not answer
 *
 * Limits, because the feed's rate limit is shared by everyone on the token: at most 25 symbols per request, the same set answered from memory for
 * 10 s (and CDN-cached for as long), and 60 requests a minute from one address.
 */
export const dynamic = "force-dynamic";

export const QUOTES_PER_MINUTE = 60;
const TTL = 10_000;
const limiter = makeLimiter(QUOTES_PER_MINUTE, 60_000);
const LOCAL = new Set(["unknown", "127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export async function GET(request: Request) {
  const ip = clientIp(request);
  if (!LOCAL.has(ip)) {
    const r = limiter(ip);
    if (!r.ok) return NextResponse.json({ source: "unavailable", reason: "too many requests" }, { status: 429, headers: { "Retry-After": String(r.retryAfterS) } });
  }
  const raw = new URL(request.url).searchParams.get("symbols") ?? "";
  const symbols = [...new Set(raw.split(",").filter(Boolean))].sort();
  if (symbols.length === 0 || symbols.length > MAX_QUOTE_SYMBOLS || !symbols.every(isNseSymbol)) return NextResponse.json({ error: "bad symbols" }, { status: 400 });
  const token = upstoxToken();
  if (!token) return NextResponse.json({ source: "unavailable", reason: "no token" }, { headers: { "Cache-Control": "no-store" } });
  try {
    const quotes: Record<string, DynamicQuote> = await memoized(`quotes:${symbols.join(",")}`, TTL, () => dynamicQuotes(token, symbols));
    return NextResponse.json({ source: "live", quotes }, { headers: { "Cache-Control": "public, s-maxage=10" } });
  } catch (err) {
    console.error(`[/api/quotes] ${symbols.join(",")} failed:`, err);
    return NextResponse.json({ source: "unavailable", reason: "feed error" }, { headers: { "Cache-Control": "no-store" } });
  }
}
