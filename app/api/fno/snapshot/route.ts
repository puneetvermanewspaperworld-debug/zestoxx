import { NextResponse } from "next/server";
import { upstoxToken } from "@/lib/upstox";
import { memoized } from "@/lib/upstox-movers";
import { liveSnapshot, simulatedSnapshot } from "@/lib/upstox-fno";
import { UNDERLYING_IDS } from "@/lib/fno/lots";
import type { FnoSnapshot } from "@/lib/fno/snapshot";
import { UNDERLYING_INDEX, buildIndexPE } from "@/lib/indexpe/maths";
import { prismaIndexStore } from "@/lib/indexpe/store";
import type { IndexPE } from "@/lib/indexpe/types";

/**
 * Everything the F&O analyzer needs for one underlying + expiry, in one response.
 *
 *   GET /api/fno/snapshot?u=NIFTY&expiry=2026-11-10   (expiry optional → the nearest)
 *
 * `source` says how trustworthy the numbers are: "live" (Upstox, market open), "delayed" (Upstox,
 * market shut — last session's closing figures) or "simulated" (Upstox didn't answer; generated
 * numbers, to be labelled as such). Upstox is called from the server only; the token never reaches
 * the browser. Results are shared for 4 s per underlying + expiry to stay inside rate limits.
 */
const TTL = 4_000;

const simulated = (u: string, expiry: string | null) => NextResponse.json(simulatedSnapshot(u, expiry), { headers: { "Cache-Control": "no-store" } });

/** The stored index valuation is read at most every ten minutes; the live P/E is worked out from it at the snapshot's own spot. */
const INDEX_PE_TTL = 10 * 60_000;
async function indexPEFor(underlying: string, spot: number): Promise<IndexPE | null> {
  const name = UNDERLYING_INDEX[underlying];
  if (!name) return null;
  try {
    const [latest, history] = await memoized(`index-pe:${name}`, INDEX_PE_TTL, () => Promise.all([prismaIndexStore.latest(name), prismaIndexStore.peHistory(name, 800)]));
    return buildIndexPE(latest, history, spot, new Date());
  } catch {
    return null; // no database, or nothing stored yet: the analyzer then shows Manual
  }
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const u = (p.get("u") ?? "NIFTY").toUpperCase();
  if (!UNDERLYING_IDS.includes(u)) return NextResponse.json({ error: "unknown underlying" }, { status: 400 });
  const expiryParam = p.get("expiry");
  if (expiryParam !== null && !/^\d{4}-\d{2}-\d{2}$/.test(expiryParam)) {
    return NextResponse.json({ error: "bad expiry" }, { status: 400 });
  }

  const token = upstoxToken();
  if (!token) {
    console.warn("[/api/fno/snapshot] UPSTOX_ANALYTICS_TOKEN is not set — serving a simulated snapshot");
    return simulated(u, expiryParam);
  }
  try {
    const snap: FnoSnapshot | null = await memoized(`fno:${u}:${expiryParam ?? ""}`, TTL, () => liveSnapshot(token, u, expiryParam));
    if (!snap) return simulated(u, expiryParam);
    return NextResponse.json({ ...snap, indexPE: await indexPEFor(u, snap.spot) }, { headers: { "Cache-Control": "public, s-maxage=4" } });
  } catch (err) {
    console.error(`[/api/fno/snapshot] ${u} failed:`, err);
    return simulated(u, expiryParam);
  }
}
