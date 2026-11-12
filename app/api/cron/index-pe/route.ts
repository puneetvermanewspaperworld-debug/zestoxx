import { NextResponse } from "next/server";
import { cronAuthError, cronLog } from "@/lib/cronAuth";
import { backfillIndexClose, ingestIndexLatest, type IndexIngestDeps } from "@/lib/indexpe/ingest";
import { prismaIndexStore } from "@/lib/indexpe/store";
import { nseFetcher } from "@/lib/nse/http";

/**
 * Run the index valuation ingest by hand (the daily cron runs it through /api/cron/daily).
 *
 *   GET /api/cron/index-pe                  fetch the latest trading day's index closing file if it is not stored yet
 *   GET /api/cron/index-pe?backfill=400     also fill earlier days from the dated files (at most 40 fetches a call; repeat to go further)
 *
 * Protected by CRON_SECRET (see lib/cronAuth.ts). Only plain GETs to NSE's public files, with ordinary request headers.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = cronAuthError(request);
  if (denied) return denied;

  const deps: IndexIngestDeps = { fetcher: nseFetcher, store: prismaIndexStore, now: new Date(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log: cronLog("index-pe") };
  try {
    const report = await ingestIndexLatest(deps);
    const days = Number(new URL(request.url).searchParams.get("backfill"));
    const backfill = Number.isFinite(days) && days > 0 ? await backfillIndexClose(deps, { days }) : undefined;
    return NextResponse.json({ ok: true, report, backfill });
  } catch (e) {
    console.error("[index-pe] ingest crashed", e instanceof Error ? e.name : "error");
    return NextResponse.json({ ok: false, error: "ingest failed (see the function log)" }, { status: 500 });
  }
}
