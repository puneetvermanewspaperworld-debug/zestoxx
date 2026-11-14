"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { RotateCcw } from "lucide-react";
import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { ORDINAL_BASE, displayBars, drawingsAllowed, type ChartType, type DisplayBar } from "@/lib/chart/charttypes";
import { fmtBarDate } from "@/lib/chart/readout";
import { ATTRIBUTION_LINK_TEXT, ATTRIBUTION_NOTICE, TRADINGVIEW_URL } from "@/lib/chart/notice";
import { defaultView } from "@/lib/chart/view";
import { VOLUME_NOT_AVAILABLE, buildChartSeries, volumeAvailable, withTimes, type LinePoint, type TimedCandle } from "@/lib/chart/series";
import type { AssetType, Candle } from "@/lib/types";

/**
 * The Trade page's price chart, drawn by TradingView's Lightweight Charts. This component only draws: every value it plots comes
 * from lib/chart/series.ts, which uses the same indicator functions the old SVG chart used. Candles carry a time so that drawings can
 * be anchored by (time, price).
 */
export interface TradeChartProps {
  symbol: string;
  timeframe: "D" | "W" | "M";
  type: AssetType;
  /** how the bars are drawn (see lib/chart/charttypes.ts) */
  chartType: ChartType;
  /** the Renko brick size the user confirmed for this symbol, or null */
  renkoSize: number | null;
  /** the whole history for the timeframe, oldest first; the chart opens on its last `keep` bars and can be panned back */
  candles: Candle[];
  keep: number;
  showMA: boolean;
  showEMA: boolean;
  showBB: boolean;
  showVolume: boolean;
  showRSI: boolean;
  rsi: (number | null)[] | null;
  compare: Candle[] | null;
  custom: (number | null)[] | null;
  /** called with the chart once it exists (and null when it is torn down) */
  onChart?: (chart: IChartApi | null, series: ISeriesApi<SeriesType> | null) => void;
  /** called with the bars as charted and the real bars they come from (each with its time) whenever the data is fed */
  onBars?: (bars: DisplayBar[], real: TimedCandle[]) => void;
  /** drawn inside the chart's box, over the plot (the drawing layer) */
  layer?: React.ReactNode;
}

const COLORS = { up: "#34D399", down: "#F87171", ma10: "#D4A94E", ma30: "#6FA8DC", ema: "#B87FE0", bb: "#6FA8DC", custom: "#22D3EE", compare: "#F0A84E", rsi: "#B87FE0" };

type LineName = "ma10" | "ma30" | "ema20" | "bbUpper" | "bbLower" | "custom" | "compare" | "rsi";
const LINE_STYLE: Record<LineName, { color: string; lineWidth: 1 | 2; lineStyle?: LineStyle; pane?: number }> = {
  ma10: { color: COLORS.ma10, lineWidth: 2 },
  ma30: { color: COLORS.ma30, lineWidth: 2 },
  ema20: { color: COLORS.ema, lineWidth: 2 },
  bbUpper: { color: COLORS.bb, lineWidth: 1, lineStyle: LineStyle.Dashed },
  bbLower: { color: COLORS.bb, lineWidth: 1, lineStyle: LineStyle.Dashed },
  custom: { color: COLORS.custom, lineWidth: 2 },
  compare: { color: COLORS.compare, lineWidth: 1, lineStyle: LineStyle.Dotted },
  rsi: { color: COLORS.rsi, lineWidth: 2, pane: 1 },
};

/** the chart types whose main series takes open, high, low and close */
const MAIN_OHLC: ChartType[] = ["candle", "hollow", "bar", "ha", "renko", "linebreak"];

/** The real time behind a time the chart library was given: a brick's position stands for the time of the bar that made it. */
function realTime(time: Time, labels: number[] | null): number {
  const t = typeof time === "number" ? time : 0;
  if (!labels) return t;
  const k = Math.round((t - ORDINAL_BASE) / 86_400);
  return labels[k] ?? t;
}

const lineOpts = { priceLineStyle: LineStyle.Dotted, lastValueVisible: true } as const;

/** The main series for a chart type. */
function createMain(chart: IChartApi, type: ChartType): ISeriesApi<SeriesType> {
  switch (type) {
    case "hollow":
      // hollow when the bar closed up (close at or above open), filled when it closed down
      return chart.addSeries(CandlestickSeries, { upColor: "rgba(255,255,255,0)", downColor: COLORS.down, borderUpColor: COLORS.up, borderDownColor: COLORS.down, wickUpColor: COLORS.up, wickDownColor: COLORS.down, borderVisible: true, ...lineOpts });
    case "bar":
      return chart.addSeries(BarSeries, { upColor: COLORS.up, downColor: COLORS.down, ...lineOpts });
    case "line":
      return chart.addSeries(LineSeries, { color: "#2563eb", lineWidth: 2, ...lineOpts });
    case "area":
      return chart.addSeries(AreaSeries, { lineColor: "#2563eb", topColor: "rgba(37,99,235,0.28)", bottomColor: "rgba(37,99,235,0.02)", lineWidth: 2, ...lineOpts });
    case "baseline":
      return chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: 0 },
        topLineColor: COLORS.up,
        bottomLineColor: COLORS.down,
        topFillColor1: "rgba(52,211,153,0.28)",
        topFillColor2: "rgba(52,211,153,0.02)",
        bottomFillColor1: "rgba(248,113,113,0.02)",
        bottomFillColor2: "rgba(248,113,113,0.28)",
        lineWidth: 2,
        ...lineOpts,
      });
    default:
      return chart.addSeries(CandlestickSeries, { upColor: COLORS.up, downColor: COLORS.down, borderVisible: false, wickUpColor: COLORS.up, wickDownColor: COLORS.down, ...lineOpts });
  }
}

const toLine = (pts: LinePoint[]): LineData<UTCTimestamp>[] => pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));

export default function TradeChart(p: TradeChartProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  /** the main series: candles, bars, a line... whichever the chart type draws */
  const candleRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const mainType = useRef<ChartType | "">("");
  /** for Renko and Line Break: the real time of each brick, by position, so the axis and the crosshair can show it */
  const labels = useRef<number[] | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lines = useRef<Partial<Record<LineName, ISeriesApi<SeriesType>>>>({});
  const shownKey = useRef("");
  /** the range to show once the chart has a size: setting it on a chart that is still 0 wide is lost */
  const pendingView = useRef<{ from: number; to: number } | null>(null);
  const applyPendingRef = useRef<(() => void) | null>(null);
  /** a fingerprint of the bars last reported, so the same bars are never reported twice (reporting re-renders the parent, which re-renders this) */
  const reported = useRef("");
  /** how many bars are charted, and how many the chart opens on: what "Reset view" goes back to */
  const barCount = useRef(0);
  const keepRef = useRef(p.keep);
  const onChart = useRef(p.onChart);
  const onBars = useRef(p.onBars);
  useEffect(() => {
    onChart.current = p.onChart;
    onBars.current = p.onBars;
    keepRef.current = p.keep;
  });

  /** The main series for the chart type, made again when the type changes (a series cannot change its kind). */
  const ensureMain = (chart: IChartApi, type: ChartType): ISeriesApi<SeriesType> => {
    if (candleRef.current && mainType.current === type) return candleRef.current;
    if (candleRef.current) {
      try {
        chart.removeSeries(candleRef.current);
      } catch {
        // already gone
      }
    }
    const s = createMain(chart, type);
    candleRef.current = s;
    mainType.current = type;
    onChart.current?.(chart, s);
    return s;
  };

  /** Jump to the latest candle and re-scale: the opening range of bars again, and the price scale fitted to what is in sight. */
  const resetView = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale("right").applyOptions({ autoScale: true });
    chart.timeScale().setVisibleLogicalRange(defaultView(barCount.current, keepRef.current));
  }, []);

  const volumeOk = volumeAvailable(p.candles, p.type);

  // Create the chart once.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#64748b", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: "#eef2f7" }, horzLines: { color: "#eef2f7" } },
      rightPriceScale: { borderColor: "#e2e8f0", scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: {
        borderColor: "#e2e8f0",
        rightOffset: 4,
        timeVisible: false,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => (labels.current ? fmtBarDate(realTime(time, labels.current)) : null),
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { timeFormatter: (time: Time) => fmtBarDate(realTime(time, labels.current)) },
      // A vertical swipe scrolls the page; horizontal drags pan the chart; two fingers pinch it.
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } },
    });
    chartRef.current = chart;
    const applyPending = () => {
      const v = pendingView.current;
      if (v && el.clientWidth > 0) {
        pendingView.current = null;
        chart.timeScale().setVisibleLogicalRange(v);
      }
    };
    // what is in sight, for tests and for anyone reading the page: the first and last visible bar (as positions in the data)
    const onRange = (r: { from: number; to: number } | null) => {
      if (r) el.dataset.view = JSON.stringify({ from: Math.round(r.from * 10) / 10, to: Math.round(r.to * 10) / 10 });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    // keep the floating quick-tool bar (about 56 px at the top of the plot) clear of the candles, so every price on screen can be tapped
    const reserveTop = () => {
      const h = el.clientHeight;
      if (h > 0) chart.priceScale("right").applyOptions({ scaleMargins: { top: Math.min(0.3, Math.max(0.08, 60 / h)), bottom: 0.08 } });
    };
    const ro = new ResizeObserver(() => {
      reserveTop();
      applyPending();
    });
    reserveTop();
    ro.observe(el);
    applyPendingRef.current = applyPending;
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      ro.disconnect();
      applyPendingRef.current = null;
      onChart.current?.(null, null);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      mainType.current = "";
      labels.current = null;
      volumeRef.current = null;
      lines.current = {};
      shownKey.current = "";
    };
  }, []);

  const input = useMemo(() => ({ ...p }), [p]);

  // Feed the data. The view (how many bars are in sight) is only reset when the dataset changes, so live ticks, and toggling
  // an indicator, never move what the user is looking at.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const today = new Date().toISOString().slice(0, 10);
    const real = withTimes(input.candles, today);
    const rebuilt = !drawingsAllowed(input.chartType);
    const compare = input.compare && !rebuilt ? withTimes(input.compare, today) : null;
    // what is plotted: the real bars, or Heikin Ashi, or Renko / Line Break bricks
    const timed = displayBars(input.chartType, real, input.renkoSize);
    labels.current = rebuilt ? timed.map((b) => b.realT as number) : null;
    const candleSeries = ensureMain(chart, input.chartType);
    const last = timed[timed.length - 1];
    const print = `${input.chartType}|${input.renkoSize}|${timed.length}|${timed[0]?.t}|${last?.t}|${last?.open}|${last?.high}|${last?.low}|${last?.close}`;
    if (print !== reported.current) {
      reported.current = print;
      onBars.current?.(timed, real);
    }
    const s = buildChartSeries({
      candles: timed,
      type: input.type,
      showMA: input.showMA,
      showEMA: input.showEMA,
      showBB: input.showBB,
      showVolume: input.showVolume,
      compare,
      // line inputs are one value per bar; if a bar was dropped for a non-increasing time they no longer line up, and are not plotted
      custom: input.custom && !rebuilt && input.custom.length === timed.length ? input.custom : null,
      // the page worked RSI out on the same bars, one value each
      rsi: input.showRSI && !rebuilt && input.rsi && input.rsi.length === timed.length ? input.rsi : null,
    });
    barCount.current = s.candles.length;
    if (MAIN_OHLC.includes(input.chartType)) candleSeries.setData(s.candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })) as never);
    else {
      // line, area and baseline draw the close; a baseline's base is the first close in view
      if (input.chartType === "baseline" && s.candles.length) candleSeries.applyOptions({ baseValue: { type: "price", price: s.candles[0].close } } as never);
      candleSeries.setData(s.candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })) as never);
    }

    // volume
    if (s.volume) {
      if (!volumeRef.current) {
        const v = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
        v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        volumeRef.current = v;
      }
      volumeRef.current.setData(s.volume.map((v) => ({ time: v.time as UTCTimestamp, value: v.value, color: v.up ? `${COLORS.up}66` : `${COLORS.down}66` })));
    } else if (volumeRef.current) {
      chart.removeSeries(volumeRef.current);
      volumeRef.current = null;
    }

    // lines
    const want: Record<LineName, LinePoint[] | null> = { ma10: s.ma10, ma30: s.ma30, ema20: s.ema20, bbUpper: s.bbUpper, bbLower: s.bbLower, custom: s.custom, compare: s.compare, rsi: s.rsi };
    (Object.keys(want) as LineName[]).forEach((name) => {
      const pts = want[name];
      const existing = lines.current[name];
      if (!pts) {
        if (existing) {
          chart.removeSeries(existing);
          delete lines.current[name];
        }
        return;
      }
      let series = existing as ISeriesApi<"Line"> | undefined;
      if (!series) {
        const st = LINE_STYLE[name];
        series = chart.addSeries(
          LineSeries,
          { color: st.color, lineWidth: st.lineWidth, lineStyle: st.lineStyle ?? LineStyle.Solid, priceLineVisible: false, lastValueVisible: name === "rsi", crosshairMarkerVisible: false },
          st.pane ?? 0
        );
        if (name === "rsi") {
          series.createPriceLine({ price: 70, color: "#cbd5e1", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
          series.createPriceLine({ price: 30, color: "#cbd5e1", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
          chart.panes()[1]?.setHeight(110);
        }
        lines.current[name] = series;
      }
      series.setData(toLine(pts));
    });

    // the view
    // a different dataset (another symbol or timeframe, or the real history replacing the starting series: its first bar differs) resets the view;
    // a live tick, or toggling an indicator, never does
    const key = `${input.symbol}|${input.timeframe}|${input.chartType}|${input.renkoSize}|${timed.length ? timed[0].t : 0}`;
    if (shownKey.current !== key) {
      shownKey.current = key;
      const n = s.candles.length;
      pendingView.current = defaultView(n, input.keep);
      applyPendingRef.current?.();
    }

    // a summary for tests and for anyone reading the page source: what is plotted
    const el = box.current;
    if (el) {
      const last = <T extends { value: number }>(a: T[] | null) => (a && a.length ? a[a.length - 1].value : null);
      el.dataset.chartType = input.chartType;
      el.dataset.series = JSON.stringify({
        chartType: input.chartType,
        bars: s.candles.length,
        volume: s.volume ? s.volume.length : 0,
        ma10: s.ma10?.length ?? 0,
        ma30: s.ma30?.length ?? 0,
        ema20: s.ema20?.length ?? 0,
        bb: s.bbUpper?.length ?? 0,
        custom: s.custom?.length ?? 0,
        compare: s.compare?.length ?? 0,
        rsi: s.rsi?.length ?? 0,
        lastClose: s.candles.length ? s.candles[s.candles.length - 1].close : null,
        lastMa10: last(s.ma10),
        lastRsi: last(s.rsi),
      });
    }
  }, [input]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={box} data-testid="trade-chart" className="h-full w-full" />
        {p.layer}
        <button
          type="button"
          aria-label="Reset view"
          title="Reset view: jump to the latest candle and re-scale"
          data-testid="reset-view"
          onClick={resetView}
          className="absolute bottom-9 right-[72px] z-20 flex h-11 min-w-[44px] items-center justify-center rounded-full bg-white/95 text-slate-600 shadow ring-1 ring-slate-200 hover:text-slate-900"
        >
          <RotateCcw size={16} aria-hidden />
        </button>
        {p.showVolume && !volumeOk && (
          <span data-testid="volume-note" className="pointer-events-none absolute bottom-1.5 left-2 rounded bg-white/80 px-1.5 py-0.5 text-[10.5px] text-slate-400">
            {VOLUME_NOT_AVAILABLE}
          </span>
        )}
      </div>
      <p data-testid="chart-attribution" className="mt-1 shrink-0 text-[10.5px] leading-snug text-slate-400">
        <a href={TRADINGVIEW_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-500 underline-offset-2 hover:underline">
          {ATTRIBUTION_LINK_TEXT}
        </a>
        <span> · {ATTRIBUTION_NOTICE}</span>
      </p>
    </div>
  );
}
