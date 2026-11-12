import { NextResponse } from "next/server";
import { prismaStore } from "@/lib/fiidii/store";

/**
 * Stored FII/DII days, oldest first, for the page.
 *
 *   GET /api/fiidii  ->  { status: "ok" | "empty" | "unavailable", rows: FiiDiiDayRow[] }
 *
 * Real NSE data only (see lib/fiidii/ingest.ts and the cron route). "empty" means nothing has been stored yet and "unavailable"
 * means the database could not be read; in both cases `rows` is empty and the page says "Data not available yet". Nothing is
 * ever generated here.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await prismaStore.list(300);
    return NextResponse.json({ status: rows.length ? "ok" : "empty", rows }, { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch {
    return NextResponse.json({ status: "unavailable", rows: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
