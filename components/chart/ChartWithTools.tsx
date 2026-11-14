"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { cloneOffset, type Drawing } from "@/lib/chart/drawings";
import type { TimedCandle } from "@/lib/chart/series";
import ChartToolbox, { ChartProperties } from "./ChartToolbox";
import CrosshairReadout from "./CrosshairReadout";
import { QuickBar, ToolRail } from "./ChartOverlays";
import DrawingLayer from "./DrawingLayer";
import TradeChart, { type TradeChartProps } from "./TradeChart";
import { useDrawings } from "./useDrawings";
import { useIndexLot } from "./useIndexLot";
import { useLevelAlerts } from "./useLevelAlerts";

/**
 * The Trade page's chart with its drawing tools: the chart, the drawing layer over it, and the toolbox. Drawings belong to the symbol
 * and are kept in this browser (see lib/chart/storage.ts).
 */
export default function ChartWithTools({ heightClass, ...chartProps }: Omit<TradeChartProps, "onChart" | "onBars" | "layer"> & { heightClass: string }) {
  const api = useDrawings(chartProps.symbol);
  const [ctx, setCtx] = useState<{ chart: IChartApi; series: ISeriesApi<"Candlestick"> } | null>(null);
  const [bars, setBars] = useState<TimedCandle[]>([]);
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

  const onBars = useCallback((b: TimedCandle[]) => setBars(b), []);
  const onChart = useCallback((chart: IChartApi | null, series: ISeriesApi<"Candlestick"> | null) => setCtx(chart && series ? { chart, series } : null), []);
  const cloneBy = useCallback((d: Drawing) => cloneOffset(d, times), [times]);

  return (
    <div ref={root} className="flex flex-col" data-testid="chart-with-tools" data-tool={api.tool}>
      <ChartToolbox api={api} />
      <div className={heightClass}>
        <TradeChart
          {...chartProps}
          onChart={onChart}
          onBars={onBars}
          layer={
            <>
              <ToolRail api={api} open={railOpen} onToggle={() => setRailOpen((v) => !v)} />
              <QuickBar api={api} />
              {ctx ? <CrosshairReadout chart={ctx.chart} series={ctx.series} bars={bars} type={chartProps.type} /> : null}
              {ctx && api.loaded ? (
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
