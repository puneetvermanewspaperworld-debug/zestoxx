import { NextResponse } from "next/server";
import { allSchemes } from "@/lib/mf/read";
import { buildOverview } from "@/lib/mf/overview";

/**
 * Category grid: how many stored schemes are in each tile and their median returns.
 *   GET /api/mf/overview -> { status: "ok" | "empty" | "unavailable", asOf, tiles }
 * Stored AMFI data only (Direct plans, Growth option). "empty" and "unavailable" carry no figures; the page says "Data not available yet".
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await allSchemes();
    if (rows.length === 0) return NextResponse.json({ status: "empty", asOf: null, tiles: [] });
    const asOf = rows.reduce((m, r) => (r.navDate > m ? r.navDate : m), "");
    return NextResponse.json({ status: "ok", asOf, tiles: buildOverview(rows) }, { headers: { "Cache-Control": "public, s-maxage=300" } });
  } catch {
    return NextResponse.json({ status: "unavailable", asOf: null, tiles: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
