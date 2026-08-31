import { NextResponse } from "next/server";
import { FIIDII } from "@/lib/history";

/**
 * FII/DII cash-market net flows. See the handoff brief §4:
 *
 * NSE publishes this at nseindia.com/reports/fii-dii but blocks direct scraping without
 * proper headers/session handling. Realistic options:
 *   - a scheduled serverless function that fetches + caches it daily (a Vercel Cron
 *     hitting this route, persisting into Postgres/Supabase), or
 *   - a paid aggregator API.
 *
 * For now this returns the same seeded mock the UI already uses, so the shape is stable
 * for whoever wires the real ingest.
 *
 * GET /api/fiidii?days=20
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(260, Math.max(1, Number(searchParams.get("days")) || 20));
  const rows = FIIDII.slice(-days).map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    fiiBuy: Math.round(r.fiiBuy),
    fiiSell: Math.round(r.fiiSell),
    fiiNet: Math.round(r.fiiNet),
    diiBuy: Math.round(r.diiBuy),
    diiSell: Math.round(r.diiSell),
    diiNet: Math.round(r.diiNet),
  }));
  return NextResponse.json({ source: "simulated", rows });
}
