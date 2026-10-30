import { NextResponse } from "next/server";
import {
  OPTION_UNDERLYINGS,
  upstoxToken,
  fetchOptionExpiries,
  fetchOptionChain,
  fetchIndiaVix,
} from "@/lib/upstox";
import type { OptionChain } from "@/lib/options";

/**
 * Real option chain from Upstox: per-strike LTP, previous close, OI, previous OI,
 * volume and IV for calls and puts, plus the expiry list and India VIX.
 *
 * GET /api/options-chain?underlying=NIFTY&expiry=2026-11-03
 *   -> OptionChain with source "live", or { source: "unavailable" }
 *
 * `expiry` is optional (defaults to the nearest). "unavailable" is a 200, not an error:
 * the client falls back to a clearly-labelled simulated chain, same as the quote feeds.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const underlying = searchParams.get("underlying") ?? "NIFTY";
  const key = OPTION_UNDERLYINGS[underlying];
  if (!key) return NextResponse.json({ error: "unknown underlying" }, { status: 400 });

  const token = upstoxToken();
  if (!token) {
    console.warn("[/api/options-chain] UPSTOX_ANALYTICS_TOKEN is not set — serving unavailable");
    return NextResponse.json({ source: "unavailable" });
  }

  try {
    const expiries = await fetchOptionExpiries(token, key);
    if (expiries.length === 0) return NextResponse.json({ source: "unavailable" });

    const requested = searchParams.get("expiry");
    const expiry = requested && expiries.includes(requested) ? requested : expiries[0];

    const [chain, vix] = await Promise.all([
      fetchOptionChain(token, key, expiry),
      fetchIndiaVix(token).catch(() => null),
    ]);
    if (chain.rows.length === 0 || chain.spot <= 0) {
      return NextResponse.json({ source: "unavailable" });
    }

    const body: OptionChain = {
      underlying,
      spot: chain.spot,
      expiry,
      expiries,
      rows: chain.rows,
      vix,
      source: "live",
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error(`[/api/options-chain] upstox ${underlying} failed:`, err);
    return NextResponse.json({ source: "unavailable" });
  }
}
