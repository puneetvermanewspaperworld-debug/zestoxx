import { NextResponse } from "next/server";
import { prismaStore } from "@/lib/fiidii/store";
import { prismaIndexStore } from "@/lib/indexpe/store";
import { buildFiiDiiPayload } from "@/lib/fiidii/payload";

/**
 * Stored FII/DII days, oldest first, for the page, with Nifty 50's stored closes for the same days.
 *
 *   GET /api/fiidii  ->  { status: "ok" | "empty" | "unavailable", rows: FiiDiiDayRow[], nifty: { date, close }[] }
 *
 * Real NSE data only (see lib/fiidii/ingest.ts, lib/indexpe/ingest.ts and the cron route). "empty" means nothing has been stored yet and
 * "unavailable" means the database could not be read; in both cases `rows` is empty and the page says "Data not available yet". If only
 * the closes cannot be read, `nifty` is empty and the Nifty % column shows "--". Nothing is ever generated here.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const body = await buildFiiDiiPayload({ listDays: (n) => prismaStore.list(n), listCloses: (i, from, to) => prismaIndexStore.closes(i, from, to) }, 300);
  return NextResponse.json(body, { headers: { "Cache-Control": body.status === "ok" ? "public, s-maxage=60" : "no-store" } });
}
