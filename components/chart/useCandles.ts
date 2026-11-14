"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyTick, intervalInfo, isIntraday, rowsToCandles, type BarRow, type Selection } from "@/lib/chart/intervals";
import { isMarketOpen } from "@/lib/market-calendar";
import type { Candle } from "@/lib/types";

/**
 * Candles for the chart's interval and range, fetched on demand from /api/candles and kept in memory for a short time so that going back
 * to an interval already seen is instant. The last candle is moved by the live price while the market is open, and an intraday chart is
 * fetched again every minute so that the real candles replace the ones built from ticks.
 */
export interface CandleFeed {
  status: "idle" | "loading" | "ready" | "error";
  bars: Candle[];
  error: string | null;
  reload: () => void;
}

const TTL_INTRADAY = 60_000;
const TTL_HISTORY = 600_000;
const cache = new Map<string, { at: number; rows: BarRow[] }>();
const inflight = new Map<string, Promise<BarRow[]>>();

async function load(symbol: string, sel: Selection, fresh: boolean): Promise<BarRow[]> {
  const key = `${symbol}|${sel.interval}|${sel.range}`;
  const hit = cache.get(key);
  const ttl = isIntraday(sel.interval) ? TTL_INTRADAY : TTL_HISTORY;
  if (hit && !fresh && Date.now() - hit.at < ttl) return hit.rows;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const res = await fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${sel.interval}&range=${sel.range}`);
    if (!res.ok) throw new Error(res.status === 400 ? "That interval is not available for this range." : "The candle feed did not answer.");
    const json = (await res.json()) as { source?: string; bars?: BarRow[]; reason?: string };
    if (json.source !== "live" || !Array.isArray(json.bars)) throw new Error("Candles are not available right now.");
    cache.set(key, { at: Date.now(), rows: json.bars });
    return json.bars;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function useCandles(opts: { enabled: boolean; symbol: string; selection: Selection; price: number | undefined }): CandleFeed {
  const { enabled, symbol, selection, price } = opts;
  const { interval, range } = selection;
  const key = `${symbol}|${interval}|${range}`;
  const [state, setState] = useState<{ key: string; status: "ready" | "error"; bars: Candle[]; error: string | null }>({ key: "", status: "ready", bars: [], error: null });
  const [attempt, setAttempt] = useState(0);
  const priceRef = useRef(price);
  useEffect(() => {
    priceRef.current = price;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const sel = { interval, range } as Selection;
    const fetchNow = (fresh: boolean) =>
      load(symbol, sel, fresh).then(
        (rows) => {
          if (!cancelled) setState({ key, status: "ready", bars: rowsToCandles(rows), error: null });
        },
        (e: unknown) => {
          if (!cancelled) setState((prev) => ({ key, status: "error", bars: prev.key === key ? prev.bars : [], error: e instanceof Error ? e.message : "Candles are not available right now." }));
        }
      );
    void fetchNow(attempt > 0);
    // an intraday chart during the session: the real candles again every minute, over the ones built from ticks
    const refresh = isIntraday(interval) ? setInterval(() => isMarketOpen(new Date()) && void fetchNow(true), TTL_INTRADAY) : null;
    // the live price moves the last candle
    const tick = setInterval(() => {
      const p = priceRef.current;
      if (p === undefined) return;
      setState((prev) => (prev.key === key && prev.status === "ready" ? { ...prev, bars: applyTick(prev.bars, p, Date.now(), interval, isMarketOpen(new Date())) } : prev));
    }, 2000);
    return () => {
      cancelled = true;
      if (refresh) clearInterval(refresh);
      clearInterval(tick);
    };
  }, [enabled, symbol, interval, range, key, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (!enabled) return { status: "idle", bars: [], error: null, reload };
  // while a new interval or range is loading the previous bars stay on screen, marked as loading
  const current = state.key === key;
  return { status: current ? state.status : "loading", bars: state.bars, error: current && state.status === "error" ? state.error : null, reload };
}

/** Whether an interval's bars are shorter than a day (the chart then shows the time of day). */
export const isIntradaySelection = (s: Selection): boolean => intervalInfo(s.interval).intraday;
