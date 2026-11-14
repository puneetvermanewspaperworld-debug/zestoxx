import { NextResponse } from "next/server";
import { schemeWithSeries } from "@/lib/mf/read";
import { buildDetail } from "@/lib/mf/overview";

/**
 *   GET /api/mf/scheme/<AMFI code> -> { status: "ok", scheme, series, returns } | { status: "notfound" | "unavailable" }
 * `series` is the stored NAVs, oldest first (daily for about a year, weekly before that); `returns` is worked out from it.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!/^\d{1,9}$/.test(code)) return NextResponse.json({ status: "notfound" }, { status: 404 });
  try {
    const found = await schemeWithSeries(Number(code));
    if (!found) return NextResponse.json({ status: "notfound" }, { status: 404 });
    return NextResponse.json({ status: "ok", ...buildDetail(found.scheme, found.series) }, { headers: { "Cache-Control": "public, s-maxage=300" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { headers: { "Cache-Control": "no-store" } });
  }
}
