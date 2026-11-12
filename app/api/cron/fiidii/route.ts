import { NextResponse } from "next/server";
import { backfillOi, ingestLatest, type Fetcher, type IngestDeps } from "@/lib/fiidii/ingest";
import { prismaStore } from "@/lib/fiidii/store";

/**
 * The daily FII/DII ingest, run by Vercel Cron on weekdays after 19:30 IST (see vercel.json) and callable by hand.
 *
 *   GET /api/cron/fiidii                 fetch whatever is not yet stored for the latest trading day
 *   GET /api/cron/fiidii?backfill=30     also fill earlier days from the participant open interest files (at most 30 fetches a call)
 *
 * Protected by CRON_SECRET: Vercel sends it as `Authorization: Bearer <CRON_SECRET>` when the variable is set. With no secret
 * configured the route refuses to run (except in local development), so a preview or production deployment can never be
 * triggered by anyone who finds the URL. Only plain GETs to NSE's public files, with ordinary request headers.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json,text/csv,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

const fetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(15_000) });
  return { status: res.status, body: await res.text() };
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "development") {
      console.error("[fiidii] CRON_SECRET is not set; refusing to run");
      return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
    }
  } else if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const deps: IngestDeps = {
    fetcher,
    store: prismaStore,
    now: new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (level, message, data) => console[level === "info" ? "log" : level](`[fiidii] ${message}`, data ? JSON.stringify(data) : ""),
  };

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
