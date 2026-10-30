import { NextResponse } from "next/server";
import { OPTION_UNDERLYINGS, upstoxToken } from "@/lib/upstox";
import { buildupWindow } from "@/lib/upstox-buildup";
import { fromHHMM, type BuildupWindowResponse } from "@/lib/buildup-window";

/**
 * Buildup (premium change × OI change per option contract) over an intraday window.
 *
 *   GET /api/buildup-window?underlying=NIFTY&expiry=2026-11-03&back=10          last 10 minutes
 *   GET /api/buildup-window?underlying=NIFTY&from=09:45&to=10:30                 a chosen span (IST)
 *
 * Answers with the strikes around the money classified over the window, as synthetic legs the
 * buildup UI already understands, or `{source:"unavailable", reason}` (HTTP 200). See
 * lib/upstox-buildup.ts for why this endpoint is deliberately gentle with Upstox.
 */
const MAX_BACK = 24 * 60;

const unavailable = (reason: string): NextResponse =>
  NextResponse.json({ source: "unavailable", reason } satisfies BuildupWindowResponse, {
    headers: { "Cache-Control": "no-store" },
  });

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const underlying = p.get("underlying") ?? "NIFTY";
  if (!OPTION_UNDERLYINGS[underlying]) return NextResponse.json({ error: "unknown underlying" }, { status: 400 });

  const back = p.get("back");
  const from = p.get("from");
  const to = p.get("to");
  let query: { back?: number; from?: number; to?: number };
  if (back !== null) {
    const n = Number(back);
    if (!Number.isInteger(n) || n < 1 || n > MAX_BACK) return NextResponse.json({ error: "bad back" }, { status: 400 });
    query = { back: n };
  } else if (from !== null && to !== null) {
    const f = fromHHMM(from);
    const t = fromHHMM(to);
    if (f == null || t == null || f >= t) return NextResponse.json({ error: "bad from/to" }, { status: 400 });
    query = { from: f, to: t };
  } else {
    return NextResponse.json({ error: "back or from+to required" }, { status: 400 });
  }

  const token = upstoxToken();
  if (!token) {
    console.warn("[/api/buildup-window] UPSTOX_ANALYTICS_TOKEN is not set — serving unavailable");
    return unavailable("live data isn't configured");
  }

  try {
    const data = await buildupWindow(token, underlying, p.get("expiry"), query);
    return NextResponse.json(data, {
      headers: { "Cache-Control": data.source === "live" ? "public, s-maxage=10" : "no-store" },
    });
  } catch (err) {
    console.error(`[/api/buildup-window] ${underlying} failed:`, err);
    return unavailable("couldn't read minute data right now");
  }
}
