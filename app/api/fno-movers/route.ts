import { NextResponse } from "next/server";
import { upstoxToken } from "@/lib/upstox";
import { equityMovers, futuresMovers, memoized, optionsMovers } from "@/lib/upstox-movers";
import type { FutureMovers, MoversResponse, OptionKind, OptionMovers, StockMovers } from "@/lib/movers";

/**
 * Market movers from Upstox bulk quotes.
 *
 *   GET /api/fno-movers?view=equity               all NSE stocks (liquidity-filtered)
 *   GET /api/fno-movers?view=fno-equity           the F&O-eligible stocks
 *   GET /api/fno-movers?view=futures              near-month stock + index futures
 *   GET /api/fno-movers?view=options&kind=OPTIDX  most-traded index option contracts
 *   GET /api/fno-movers?view=options&kind=OPTSTK  ...and stock option contracts
 *
 * Responses are `{source:"live", asOf, data}` or `{source:"unavailable"}` (HTTP 200 —
 * the UI shows an honest empty state rather than inventing a market-wide ranking).
 *
 * Each result is computed at most once per 15 s per server instance and the response is
 * CDN-cacheable for 15 s, so many viewers don't multiply calls against Upstox's shared
 * rate limit (500/min per token).
 */
const TTL = 15_000;

const unavailable = (): NextResponse =>
  NextResponse.json({ source: "unavailable" } satisfies MoversResponse<never>, {
    headers: { "Cache-Control": "no-store" },
  });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") ?? "equity";
  const kind = (searchParams.get("kind") ?? "OPTIDX") as OptionKind;

  if (!["equity", "fno-equity", "futures", "options"].includes(view)) {
    return NextResponse.json({ error: "unknown view" }, { status: 400 });
  }
  if (view === "options" && kind !== "OPTIDX" && kind !== "OPTSTK") {
    return NextResponse.json({ error: "unknown kind" }, { status: 400 });
  }

  const token = upstoxToken();
  if (!token) {
    console.warn("[/api/fno-movers] UPSTOX_ANALYTICS_TOKEN is not set — serving unavailable");
    return unavailable();
  }

  try {
    const data = await memoized<StockMovers | FutureMovers | OptionMovers>(`${view}:${kind}`, TTL, () => {
      switch (view) {
        case "equity":
          return equityMovers(token, "all");
        case "fno-equity":
          return equityMovers(token, "fno");
        case "futures":
          return futuresMovers(token);
        default:
          return optionsMovers(token, kind);
      }
    });
    return NextResponse.json(
      { source: "live", asOf: new Date().toISOString(), data } satisfies MoversResponse<typeof data>,
      { headers: { "Cache-Control": "public, s-maxage=15" } }
    );
  } catch (err) {
    console.error(`[/api/fno-movers] ${view}/${kind} failed:`, err);
    return unavailable();
  }
}
