import { NextResponse } from "next/server";
import { cronAuthError, cronLog } from "@/lib/cronAuth";
import { ingestLatest, type IngestDeps } from "@/lib/fiidii/ingest";
import { prismaStore } from "@/lib/fiidii/store";
import { ingestIndexLatest, type IndexIngestDeps } from "@/lib/indexpe/ingest";
import { prismaIndexStore } from "@/lib/indexpe/store";
import { nseFetcher } from "@/lib/nse/http";
import { purgeInactiveGuests } from "@/lib/guest";

/**
 * The one route Vercel Cron calls (see vercel.json): it runs every daily NSE ingest, so adding a job never adds a cron entry.
 * The Hobby plan allows two cron jobs, each at most once a day; both entries point here and each run does everything that is
 * still missing:
 *   - the FII/DII cash figures and futures positions (lib/fiidii/ingest.ts), out by about 17:00 and 19:00 IST
 *   - the index P/E, P/B and dividend yield (lib/indexpe/ingest.ts), out by about 18:00 IST
 *   - the cleanup of guest accounts unseen for 90 days, and of old guest-creation records (lib/guest.ts)
 * The ingests run side by side and independently: one failing (or the database being down for one) never stops the other. A source
 * already stored for the day is never fetched again, so the second run of the day only retries what is still missing.
 *
 * Protected by CRON_SECRET (see lib/cronAuth.ts). Only plain GETs to NSE's public files, with ordinary request headers.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function GET(request: Request) {
  const denied = cronAuthError(request);
  if (denied) return denied;

  const now = new Date();
  const fii: IngestDeps = { fetcher: nseFetcher, store: prismaStore, now, sleep, log: cronLog("fiidii") };
  const idx: IndexIngestDeps = { fetcher: nseFetcher, store: prismaIndexStore, now, sleep, log: cronLog("index-pe") };
  const [a, b, c] = await Promise.allSettled([ingestLatest(fii), ingestIndexLatest(idx), purgeInactiveGuests(now)]);

  const crashed = (r: PromiseSettledResult<unknown>, tag: string) => {
    if (r.status === "rejected") console.error(`[${tag}] ingest crashed`, r.reason instanceof Error ? r.reason.name : "error");
    return r.status === "rejected";
  };
  const failed = [crashed(a, "fiidii"), crashed(b, "index-pe"), crashed(c, "guest-cleanup")];
  return NextResponse.json(
    {
      ok: !failed.some(Boolean),
      fiidii: a.status === "fulfilled" ? a.value : { error: "ingest failed (see the function log)" },
      indexPe: b.status === "fulfilled" ? b.value : { error: "ingest failed (see the function log)" },
      guestCleanup: c.status === "fulfilled" ? c.value : { error: "cleanup failed (see the function log)" },
    },
    { status: failed.some(Boolean) ? 500 : 200 }
  );
}
