import { NextResponse } from "next/server";
import { buildFiiDii } from "@/lib/fiidii";

/**
 * FII/DII activity — cash market and derivatives, plus the Nifty move and FII
 * index-futures long/short share per day.
 *
 * ⚠ Still SIMULATED (`source: "simulated"`). NSE publishes real figures at
 * nseindia.com/reports/fii-dii but blocks direct scraping without proper headers and
 * session handling. To go live: a scheduled function (Vercel Cron) that fetches and
 * caches the daily report into the database, with this route reading from there — the
 * response shape below is what that ingest should produce.
 *
 * GET /api/fiidii?days=20  ->  { source, rows: FiiDiiDay[] }  (oldest first)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(300, Math.max(1, Number(searchParams.get("days")) || 20));
  const rows = buildFiiDii().slice(-days);
  return NextResponse.json({ source: "simulated", rows });
}
