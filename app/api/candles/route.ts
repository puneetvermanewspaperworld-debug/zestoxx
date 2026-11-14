import { NextResponse } from "next/server";
import { MAX_REQUESTS, VALID_INTERVALS, intervalInfo, isIntervalId, isRangeId, istDate, parseUpstoxRows, planRequests, rangeInfo, rangeWindow, toChartSeconds, trimToSessions, type BarRow } from "@/lib/chart/intervals";
import { UPSTOX_KEYS, fetchChartToday, fetchChartWindow, upstoxToken } from "@/lib/upstox";

/**
 * Candles for the Trade page chart, on demand: one symbol, one interval, one range.
 *
 * GET /api/candles?symbol=RELIANCE&interval=15m&range=5D  ->  { source: "live", bars: [[epochMs, o, h, l, c, volume], ...] }   oldest first
 *
 * The endpoint behind it accepts a limited span per request (a month for 1, 5 and 15 minute bars, a quarter for 30 minute and hourly, ten
 * years for daily), so a range is cut into windows (lib/chart/intervals.ts planRequests) and the windows are joined. For an intraday interval
 * today's candles so far are added. Only pairings that have real data are accepted. Answers are cached: briefly while a session may be in
 * progress, longer for history. Without a token, or when the feed fails, the answer is { source: "unavailable" }: nothing is made up.
 */
export const dynamic = "force-dynamic";

const unavailable = (reason: string, status = 200) => NextResponse.json({ source: "unavailable", reason }, { status });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const symbol = q.get("symbol") ?? "";
  const interval = q.get("interval");
  const range = q.get("range");
  const key = UPSTOX_KEYS[symbol];
  if (!key) return NextResponse.json({ error: "unknown symbol" }, { status: 400 });
  if (!isIntervalId(interval) || !isRangeId(range)) return NextResponse.json({ error: "unknown interval or range" }, { status: 400 });
  if (!VALID_INTERVALS[range].includes(interval)) return NextResponse.json({ error: `${interval} is not offered for ${range}` }, { status: 400 });

  const token = upstoxToken();
  if (!token) return unavailable("no token");

  const info = intervalInfo(interval);
  const now = Date.now();
  const today = istDate(now);
  const w = rangeWindow(range, interval, today);
  const windows = planRequests(interval, w.from, w.to);
  if (windows.length === 0 || windows.length > MAX_REQUESTS) return NextResponse.json({ error: "too many requests for this range" }, { status: 400 });

  try {
    const rows: unknown[] = [];
    // three at a time: well inside the feed's rate limits (50 a second, 500 a minute)
    for (let i = 0; i < windows.length; i += 3) {
      const batch = windows.slice(i, i + 3);
      const parts = await Promise.all(batch.map((x) => fetchChartWindow(token, key, info.unit, info.n, x.from, x.to, x.to < today ? 3600 : info.intraday ? 30 : 600)));
      for (const p of parts) rows.push(...p);
    }
    if (info.intraday) {
      try {
        rows.push(...(await fetchChartToday(token, key, info.unit, info.n)));
      } catch {
        // the session in progress is a bonus; the history is what was asked for
      }
    }
    let bars: BarRow[] = parseUpstoxRows(rows);
    const sessions = rangeInfo(range).sessions;
    if (sessions) {
      const keep = trimToSessions(bars.map((b) => ({ t: toChartSeconds(b[0]), b })), sessions);
      bars = keep.map((x) => x.b);
    }
    if (bars.length === 0) return unavailable("no candles");
    return NextResponse.json({ source: "live", symbol, interval, range, bars }, { headers: { "Cache-Control": `public, s-maxage=${info.intraday ? 30 : 600}, stale-while-revalidate=60` } });
  } catch (err) {
    console.error(`[/api/candles] ${symbol} ${interval} ${range} failed:`, err);
    return unavailable("feed error", 502);
  }
}

