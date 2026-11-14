import { NextResponse } from "next/server";
import { cronAuthError, cronLog } from "@/lib/cronAuth";
import { ingestLatest, type IngestDeps } from "@/lib/fiidii/ingest";
import { prismaStore } from "@/lib/fiidii/store";
import { ingestIndexLatest, type IndexIngestDeps } from "@/lib/indexpe/ingest";
import { prismaIndexStore } from "@/lib/indexpe/store";
import { fetchAmfiText, ingestNavLatest, type MfOutcome } from "@/lib/mf/ingest";
import { makeMfStore } from "@/lib/mf/store";
import { nseFetcher } from "@/lib/nse/http";

/**
 * The one route Vercel Cron calls (see vercel.json): it runs every daily ingest, so adding a job never adds a cron entry.
 * The Hobby plan allows two cron jobs, each at most once a day; both entries point here and each run does everything that is
 * still missing:
 *   - the FII/DII cash figures and futures positions (lib/fiidii/ingest.ts), out by about 17:00 and 19:00 IST
 *   - the index P/E, P/B and dividend yield (lib/indexpe/ingest.ts), out by about 18:00 IST
 *   - the mutual fund NAVs (lib/mf/ingest.ts), published by AMFI through the evening; only when MF_INGEST_ENABLED=true (see below)
 * The two entries run at 19:30 IST (14:00 UTC) and 23:30 IST (18:00 UTC), Monday to Friday. Both IST times fall on the same calendar
 * day as the UTC run, so every "latest trading day" rule sees the date it expects; the later run catches what was not out yet at 19:30.
 * The ingests run side by side and independently: one failing (or the database being down for one) never stops the others. A source
 * already stored for the day is never fetched again, so the second run of the day only retries what is still missing.
 *
 * Protected by CRON_SECRET (see lib/cronAuth.ts). Only plain GETs to public files, with ordinary request headers.
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

  // Mutual fund NAVs are stored only once MF_INGEST_ENABLED is set to "true". Until then merging this code starts nothing: AMFI's terms
  // of use ask for written permission before its data is stored or shown, and that is for the site owner to settle first.
  const mfEnabled = process.env.MF_INGEST_ENABLED === "true";
  const mf = (): Promise<MfOutcome | { status: "disabled" }> =>
    mfEnabled ? ingestNavLatest({ fetchText: fetchAmfiText, store: makeMfStore(), now, log: cronLog("mutual-funds") }) : Promise.resolve({ status: "disabled" as const });

  const [a, b, c] = await Promise.allSettled([ingestLatest(fii), ingestIndexLatest(idx), mf()]);

  const crashed = (r: PromiseSettledResult<unknown>, tag: string) => {
    if (r.status === "rejected") console.error(`[${tag}] ingest crashed`, r.reason instanceof Error ? r.reason.name : "error");
    return r.status === "rejected";
  };
  const mfFailed = c.status === "fulfilled" && c.value.status === "failed";
  const failed = [crashed(a, "fiidii"), crashed(b, "index-pe"), crashed(c, "mutual-funds"), mfFailed];
  return NextResponse.json(
    {
      ok: !failed.some(Boolean),
      fiidii: a.status === "fulfilled" ? a.value : { error: "ingest failed (see the function log)" },
      indexPe: b.status === "fulfilled" ? b.value : { error: "ingest failed (see the function log)" },
      mutualFunds: c.status === "fulfilled" ? c.value : { error: "ingest failed (see the function log)" },
    },
    { status: failed.some(Boolean) ? 500 : 200 }
  );
}
