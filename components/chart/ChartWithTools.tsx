"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { drawingsAllowed, type DisplayBar } from "@/lib/chart/charttypes";
import { cloneOffset, type Drawing } from "@/lib/chart/drawings";
import type { TimedCandle } from "@/lib/chart/series";
import { MAX_STUDIES, nextUid, type ChartSettings } from "@/lib/chart/settings";
import { STUDY_MAP, defaultParams, nextColor, type StudyResult } from "@/lib/chart/studies";
import ChartControls, { type FeedInfo, type FullscreenApi } from "./ChartControls";
import StudyLegend from "./StudyLegend";
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
/** Heights of the chart in pixels, on a phone and on a wide screen, before any oscillator pane: each pane adds PANE_PX. */
const BASE_PX = { phone: 320, wide: 360 };
const PANE_PX = 120;

export default function ChartWithTools({ settings, update, feed, ...chartProps }: Omit<TradeChartProps, "onChart" | "onBars" | "onStudies" | "layer" | "chartType" | "renkoSize" | "studies" | "scale" | "grid" | "magnet"> & { settings: ChartSettings; update: SettingsUpdate; feed: FeedInfo }) {
  const api = useDrawings(chartProps.symbol);
  const chartType = settings.type;
  const renkoSize = settings.renko[chartProps.symbol] ?? null;
  const drawable = drawingsAllowed(chartType);
  const [ctx, setCtx] = useState<{ chart: IChartApi; series: ISeriesApi<SeriesType> } | null>(null);
  /** the bars as plotted (Heikin Ashi, bricks...) and the real bars they come from */
  const [bars, setBars] = useState<DisplayBar[]>([]);
  const [realBars, setRealBars] = useState<TimedCandle[]>([]);
  const [sizingRequest, setSizingRequest] = useState(0);
  const [studyState, setStudyState] = useState<{ results: StudyResult[]; hasVolume: boolean }>({ results: [], hasVolume: true });
  const [studyRequest, setStudyRequest] = useState<{ uid: number; n: number } | null>(null);
  const studiesApi = {
    studies: settings.studies,
    results: studyState.results,
    context: { hasVolume: studyState.hasVolume, intraday: chartProps.intraday, bricks: !drawable },
    add: (id: string) =>
      update((prev) => {
        const def = STUDY_MAP[id];
        if (!def || prev.studies.length >= MAX_STUDIES) return {};
        const single = def.outputs.length === 1 && def.outputs[0].kind === "line";
        return { studies: [...prev.studies, { uid: nextUid(prev.studies), id, params: defaultParams(def), ...(single ? { color: nextColor(prev.studies) } : {}) }] };
      }),
    remove: (uid: number) => update((prev) => ({ studies: prev.studies.filter((s) => s.uid !== uid) })),
    clear: () => update({ studies: [] }),
    setParams: (uid: number, params: Record<string, number>) => update((prev) => ({ studies: prev.studies.map((s) => (s.uid === uid ? { ...s, params } : s)) })),
  };
  // Fullscreen: the chart takes the whole screen (a fixed overlay, so it works where the Fullscreen API does not, as on an iPhone), and the
  // browser's own fullscreen is asked for as well. Landscape: the same, and the screen is asked to turn sideways; where the browser cannot
  // lock rotation a note says so.
  const [full, setFull] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [fsNote, setFsNote] = useState<string | null>(null);
  const apiFull = useRef(false);
  /** the same element as `root`, for the fullscreen request (kept apart so the scroll-anchoring effect does not touch what the callbacks use) */
  const stage = useRef<HTMLDivElement | null>(null);
  const leave = useCallback(async () => {
    setFull(false);
    setLandscape(false);
    setFsNote(null);
    const was = apiFull.current;
    apiFull.current = false;
    try {
      if (was && document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // not in the browser's fullscreen any more
    }
    try {
      screen.orientation?.unlock?.();
    } catch {
      // nothing was locked
    }
  }, []);
  const enter = useCallback(async () => {
    setFull(true);
    try {
      await stage.current?.requestFullscreen?.();
      apiFull.current = true;
    } catch {
      // the overlay is already full screen; the browser just would not go further
    }
  }, []);
  const fullscreen: FullscreenApi = {
    on: full,
    toggle: () => void (full ? leave() : enter()),
    landscape,
    toggleLandscape: () => {
      if (landscape) {
        void leave();
        return;
      }
      setLandscape(true);
      void enter().then(async () => {
        try {
          await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
          setFsNote(null);
        } catch {
          setFsNote("This browser cannot turn the screen for you. Turn your phone sideways.");
        }
      });
    },
    note: fsNote,
  };
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) void leave();
    };
    // the browser's own fullscreen was left (Escape, a back gesture): so is ours
    const onChange = () => {
      if (apiFull.current && !document.fullscreenElement) void leave();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, [full, leave]);

  const onStudies = useCallback((results: StudyResult[], hasVolume: boolean) => setStudyState({ results, hasVolume }), []);
  // each oscillator is a pane of its own: the chart is taller by that much
  const paneCount = studyState.results.filter((r) => r.availability.ok && r.def.placement === "pane").length;
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
    <div
      ref={(el) => {
        root.current = el;
        stage.current = el;
      }}
      className={full ? "fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-white p-2" : "flex flex-col"} data-testid="chart-with-tools"
      data-tool={api.tool}
      data-fullscreen={full ? "1" : "0"}
      data-landscape={landscape ? "1" : "0"}
    >
      <ChartControls symbol={chartProps.symbol} fullscreen={fullscreen} settings={settings} update={update} feed={feed} bars={realBars} sizingRequest={sizingRequest} studies={studiesApi} studyRequest={studyRequest} onStudyMenuClosed={() => setStudyRequest(null)} />
      <StudyLegend results={studyState.results} bars={bars} chart={ctx?.chart ?? null} type={chartProps.type} onEdit={(uid) => setStudyRequest({ uid, n: (studyRequest?.n ?? 0) + 1 })} onRemove={studiesApi.remove} />
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
      <div
        className={(full ? "min-h-[240px] flex-1" : "h-[var(--chart-h)] md:h-[var(--chart-h-wide)]") + (feed.status === "loading" ? " opacity-60" : "")}
        style={{ "--chart-h": `${BASE_PX.phone + paneCount * PANE_PX}px`, "--chart-h-wide": `${BASE_PX.wide + paneCount * PANE_PX}px` } as React.CSSProperties}
        aria-busy={feed.status === "loading"}
      >
        <TradeChart
          {...chartProps}
          studies={settings.studies}
          scale={settings.scale}
          grid={settings.grid}
          magnet={settings.magnet}
          onStudies={onStudies}
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
