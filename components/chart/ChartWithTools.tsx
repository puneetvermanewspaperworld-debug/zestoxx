"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { drawingsAllowed, type DisplayBar } from "@/lib/chart/charttypes";
import { cloneOffset, type Drawing } from "@/lib/chart/drawings";
import type { TimedCandle } from "@/lib/chart/series";
import type { ChartSettings } from "@/lib/chart/settings";
import ChartControls, { type FeedInfo } from "./ChartControls";
import ChartToolbox, { ChartProperties } from "./ChartToolbox";
import CrosshairReadout from "./CrosshairReadout";
import { QuickBar, ToolRail } from "./ChartOverlays";
import DrawingLayer from "./DrawingLayer";
import TradeChart, { type TradeChartProps } from "./TradeChart";
import type { SettingsUpdate } from "./useChartSettings";
import { useDrawings } from "./useDrawings";
import { useIndexLot } from "./useIndexLot";
import { useLevelAlerts } from "./useLevelAlerts";

/**
 * The Trade page's chart with its drawing tools: the chart, the drawing layer over it, and the toolbox. Drawings belong to the symbol
 * and are kept in this browser (see lib/chart/storage.ts).
 */
export default function ChartWithTools({ heightClass, settings, update, feed, ...chartProps }: Omit<TradeChartProps, "onChart" | "onBars" | "layer" | "chartType" | "renkoSize"> & { heightClass: string; settings: ChartSettings; update: SettingsUpdate; feed: FeedInfo }) {
  const api = useDrawings(chartProps.symbol);
  const chartType = settings.type;
  const renkoSize = settings.renko[chartProps.symbol] ?? null;
  const drawable = drawingsAllowed(chartType);
  const [ctx, setCtx] = useState<{ chart: IChartApi; series: ISeriesApi<SeriesType> } | null>(null);
  /** the bars as plotted (Heikin Ashi, bricks...) and the real bars they come from */
  const [bars, setBars] = useState<DisplayBar[]>([]);
  const [realBars, setRealBars] = useState<TimedCandle[]>([]);
  const [sizingRequest, setSizingRequest] = useState(0);
  const lot = useIndexLot(chartProps.symbol, chartProps.type);
  const { alerted, viewFor } = useLevelAlerts(chartProps.symbol, api.committed, api.loaded);
  // the tool rail starts open on a wide screen and collapsed on a phone, where it would cover too much of the chart
  const [railOpen, setRailOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 640);
  const times = useMemo(() => bars.map((b) => b.t), [bars]);

  // Opening the property bar below the chart pushes the page content under it down; the browser's scroll anchoring would answer by
  // scrolling the page to keep that content still, which moves the chart under the finger. Anchoring is turned off on the page's
  // scroller while the chart is here.
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let n: HTMLElement | null = root.current;
    while (n) {
      const s = getComputedStyle(n);
      if (s.overflowY === "auto" || s.overflowY === "scroll") break;
      n = n.parentElement;
    }
    const scroller = n ?? document.documentElement;
    const before = scroller.style.overflowAnchor;
    scroller.style.overflowAnchor = "none";
    return () => {
      scroller.style.overflowAnchor = before;
    };
  }, []);

  const onBars = useCallback((b: DisplayBar[], real: TimedCandle[]) => {
    setBars(b);
    setRealBars(real);
  }, []);
  const onChart = useCallback((chart: IChartApi | null, series: ISeriesApi<SeriesType> | null) => setCtx(chart && series ? { chart, series } : null), []);
  const cloneBy = useCallback((d: Drawing) => cloneOffset(d, times), [times]);

  return (
    <div ref={root} className="flex flex-col" data-testid="chart-with-tools" data-tool={api.tool}>
      <ChartControls symbol={chartProps.symbol} settings={settings} update={update} feed={feed} bars={realBars} sizingRequest={sizingRequest} />
      {drawable ? (
        <ChartToolbox api={api} />
      ) : (
        <p data-testid="drawings-off-note" className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-[11.5px] text-slate-500">
          The drawing tools are off on {chartType === "renko" ? "Renko" : "Line Break"} charts: bricks are not drawn on a time axis. Switch to another chart type to draw.
        </p>
      )}
      {chartType === "renko" && renkoSize === null && (
        <p data-testid="renko-needs-size" className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
          Renko needs a brick size for {chartProps.symbol}.
          <button type="button" onClick={() => setSizingRequest((n) => n + 1)} className="min-h-[44px] rounded-lg border border-amber-300 bg-white px-3 font-medium">
            Set brick size
          </button>
        </p>
      )}
      <div className={heightClass + (feed.status === "loading" ? " opacity-60" : "")} aria-busy={feed.status === "loading"}>
        <TradeChart
          {...chartProps}
          chartType={chartType}
          renkoSize={renkoSize}
          onChart={onChart}
          onBars={onBars}
          layer={
            <>
              {drawable && <ToolRail api={api} open={railOpen} onToggle={() => setRailOpen((v) => !v)} />}
              {drawable && <QuickBar api={api} />}
              {ctx ? <CrosshairReadout chart={ctx.chart} series={ctx.series} bars={bars} type={chartProps.type} intraday={chartProps.intraday} /> : null}
              {drawable && ctx && api.loaded ? (
              <DrawingLayer
                chart={ctx.chart}
                series={ctx.series}
                bars={bars}
                drawings={api.drawings}
                selectedId={api.selectedId}
                tool={api.tool}
                magnet={api.magnet}
                hidden={api.hidden}
                alerted={alerted}
                lot={lot}
                isIndex={chartProps.type === "index"}
                assetType={chartProps.type}
                onAdd={api.add}
                onSelect={api.select}
                onLive={api.setLive}
                onCommitLive={api.commitLive}
                onUpdate={api.update}
              />
              ) : null}
            </>
          }
        />
      </div>
      <ChartProperties api={api} cloneBy={cloneBy} levelAlert={api.selected?.kind === "hline" ? viewFor(api.selected) : undefined} />
    </div>
  );
}
