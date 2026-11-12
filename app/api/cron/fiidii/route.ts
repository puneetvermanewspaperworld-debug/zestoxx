import { NextResponse } from "next/server";
import { cronAuthError, cronLog } from "@/lib/cronAuth";
import { backfillOi, ingestLatest, type IngestDeps } from "@/lib/fiidii/ingest";
import { prismaStore } from "@/lib/fiidii/store";
import { nseFetcher } from "@/lib/nse/http";

/**
 * Run the FII/DII ingest by hand (the daily cron runs it through /api/cron/daily).
 *
 *   GET /api/cron/fiidii                 fetch whatever is not yet stored for the latest trading day
 *   GET /api/cron/fiidii?backfill=30     also fill earlier days from the participant open interest files (at most 30 fetches a call)
 *
 * Protected by CRON_SECRET (see lib/cronAuth.ts). Only plain GETs to NSE's public files, with ordinary request headers.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = cronAuthError(request);
  if (denied) return denied;

  const deps: IngestDeps = { fetcher: nseFetcher, store: prismaStore, now: new Date(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log: cronLog("fiidii") };
  try {
    const report = await ingestLatest(deps);
    const days = Number(new URL(request.url).searchParams.get("backfill"));
    const backfill = Number.isFinite(days) && days > 0 ? await backfillOi(deps, { days }) : undefined;
    return NextResponse.json({ ok: true, report, backfill });
  } catch (e) {
    // most likely the database: say so in the log and to the caller, without any connection detail
    console.error("[fiidii] ingest crashed", e instanceof Error ? e.name : "error");
    return NextResponse.json({ ok: false, error: "ingest failed (see the function log)" }, { status: 500 });
  }
}
