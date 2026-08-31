import { NextResponse } from "next/server";
import { COINGECKO_IDS } from "@/lib/symbols";
import { upstoxToken, fetchUpstoxLtp, fetchUpstoxHistory } from "@/lib/upstox";

/**
 * Market-data proxy. Keeps vendor credentials server-side and the browser on one origin.
 *
 * - Crypto (BTC/ETH/SOL): CoinGecko, key-less, public.
 * - NSE/BSE equities & indices: Upstox, using the static Analytics Token in
 *   `UPSTOX_ANALYTICS_TOKEN` as a Bearer header (see lib/upstox.ts). If the token is
 *   absent or Upstox errors, these endpoints return `{}` and the client stays on the
 *   seeded simulation.
 *
 * GET /api/market-data?asset=crypto        -> { [symId]: usdPrice }
 * GET /api/market-data?asset=crypto-ohlc   -> { [symId]: [[t,o,h,l,c], ...] }        (30d)
 * GET /api/market-data?asset=equity        -> { [symId]: inrPrice }
 * GET /api/market-data?asset=equity-ohlc   -> { [symId]: [[t,o,h,l,c,v], ...] }      (~400d)
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

  if (asset === "equity" || asset === "equity-ohlc") {
    const token = upstoxToken();
    if (!token) {
      // No token configured — no live equities. Client keeps the simulation.
      return NextResponse.json({});
    }
    try {
      const data =
        asset === "equity" ? await fetchUpstoxLtp(token) : await fetchUpstoxHistory(token);
      return NextResponse.json(data);
    } catch (err) {
      console.error(`[/api/market-data] upstox ${asset} failed:`, err);
      return NextResponse.json({});
    }
  }

  return NextResponse.json({ error: "unknown asset" }, { status: 400 });
}
