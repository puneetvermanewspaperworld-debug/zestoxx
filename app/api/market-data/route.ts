import { NextResponse } from "next/server";
import { COINGECKO_IDS } from "@/lib/symbols";

/**
 * Market-data proxy. See the handoff brief §4:
 *
 * - Crypto (BTC/ETH/SOL) genuinely can be live and key-less via CoinGecko. Proxying it
 *   here (rather than calling CoinGecko from the browser) sidesteps CORS and keeps the
 *   client on one origin. The client still falls back to the seeded simulation if this
 *   route fails.
 * - NSE/BSE equities & indices need a real vendor (Zerodha Kite Connect, Upstox,
 *   Angel One SmartAPI, TrueData…). Wire the chosen vendor's calls in here and read
 *   the key from `process.env.MARKET_DATA_API_KEY` — never expose it to the browser.
 *
 * GET /api/market-data?asset=crypto        -> { [symId]: usdPrice }
 * GET /api/market-data?asset=crypto-ohlc   -> { [symId]: [[t,o,h,l,c], ...] }  (30d)
 * GET /api/market-data?asset=equity&...    -> 501 until a vendor is wired up
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const asset = searchParams.get("asset") ?? "crypto";

  if (asset === "crypto") {
    try {
      const ids = Object.values(COINGECKO_IDS).join(",");
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        { next: { revalidate: 15 } }
      );
      if (!res.ok) return NextResponse.json({ error: "upstream error" }, { status: 502 });
      const data = await res.json();
      const out: Record<string, number> = {};
      for (const [symId, cgId] of Object.entries(COINGECKO_IDS)) {
        const p = data[cgId]?.usd;
        if (typeof p === "number") out[symId] = p;
      }
      return NextResponse.json(out);
    } catch {
      return NextResponse.json({ error: "fetch failed" }, { status: 502 });
    }
  }

  if (asset === "crypto-ohlc") {
    try {
      const entries = Object.entries(COINGECKO_IDS);
      const results = await Promise.all(
        entries.map(([, cgId]) =>
          fetch(`https://api.coingecko.com/api/v3/coins/${cgId}/ohlc?vs_currency=usd&days=30`, {
            next: { revalidate: 300 },
          }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        )
      );
      const out: Record<string, number[][]> = {};
      entries.forEach(([symId], i) => {
        if (Array.isArray(results[i])) out[symId] = results[i];
      });
      return NextResponse.json(out);
    } catch {
      return NextResponse.json({ error: "fetch failed" }, { status: 502 });
    }
  }

  return NextResponse.json(
    {
      error: "not_implemented",
      detail:
        "Live NSE/BSE data requires a real vendor (Kite Connect / Upstox / Angel One SmartAPI / TrueData). Wire it into app/api/market-data/route.ts and set MARKET_DATA_API_KEY.",
    },
    { status: 501 }
  );
}
