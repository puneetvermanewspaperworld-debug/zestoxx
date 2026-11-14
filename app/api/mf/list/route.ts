import { NextResponse } from "next/server";
import { allSchemes } from "@/lib/mf/read";
import { isTileId, rowsForTile } from "@/lib/mf/overview";

/**
 *   GET /api/mf/list?tile=large-cap -> { status, rows }   every stored scheme in that tile; the page sorts them
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tile = new URL(request.url).searchParams.get("tile") ?? "";
  if (!isTileId(tile)) return NextResponse.json({ error: "unknown tile" }, { status: 400 });
  try {
    const rows = rowsForTile(await allSchemes(), tile);
    return NextResponse.json({ status: rows.length ? "ok" : "empty", rows }, { headers: { "Cache-Control": "public, s-maxage=300" } });
  } catch {
    return NextResponse.json({ status: "unavailable", rows: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
