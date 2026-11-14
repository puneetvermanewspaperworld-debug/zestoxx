"use client";

import React, { useEffect, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { fmtPrice } from "@/lib/chart/price";
import { readoutFor, type Readout } from "@/lib/chart/readout";
import type { TimedCandle } from "@/lib/chart/series";
import { fmtSigned } from "@/lib/helpers";
import type { AssetType } from "@/lib/types";

/**
 * The open, high, low and close of the bar under the crosshair. On a phone the chart shows its crosshair on a long press (and moves it
 * while the finger moves); with a mouse it follows the pointer. The readout sits at the bottom left of the price pane, clear of the
 * tool rail, and takes no touches.
 */
export default function CrosshairReadout({ chart, series, bars, type }: { chart: IChartApi; series: ISeriesApi<"Candlestick">; bars: TimedCandle[]; type: AssetType }) {
  const [shown, setShown] = useState<{ r: Readout; paneH: number } | null>(null);

  useEffect(() => {
    const onMove = (param: { time?: unknown; point?: { x: number; y: number } }) => {
      if (param.time === undefined || !param.point) {
        setShown(null);
        return;
      }
      const r = readoutFor(bars, param.time as number);
      setShown(r ? { r, paneH: chart.panes()[0]?.getHeight() ?? 0 } : null);
    };
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      setShown(null);
    };
  }, [chart, series, bars]);

  if (!shown) return null;
  const { r, paneH } = shown;
  const col = r.up ? "text-emerald-600" : "text-rose-500";
  return (
    <div
      data-testid="crosshair-readout"
      className="pointer-events-none absolute left-14 z-20 rounded-lg bg-white/95 px-2 py-1 font-mono text-[11px] leading-[15px] shadow ring-1 ring-slate-200"
      style={{ top: Math.max(0, paneH - 66) }}
    >
      <div className="text-slate-500" data-testid="ro-date">
        {r.date}
        {r.change !== null && r.pct !== null && (
          <span className={"ml-2 " + (r.change >= 0 ? "text-emerald-600" : "text-rose-500")} data-testid="ro-change">
            {fmtSigned(r.change)} ({fmtSigned(r.pct, 2, "%")})
          </span>
        )}
      </div>
      <div className="flex gap-3">
        <span>
          O <b className={col} data-testid="ro-open">{fmtPrice(r.open, type)}</b>
        </span>
        <span>
          H <b className={col} data-testid="ro-high">{fmtPrice(r.high, type)}</b>
        </span>
      </div>
      <div className="flex gap-3">
        <span>
          L <b className={col} data-testid="ro-low">{fmtPrice(r.low, type)}</b>
        </span>
        <span>
          C <b className={col} data-testid="ro-close">{fmtPrice(r.close, type)}</b>
        </span>
      </div>
    </div>
  );
}
