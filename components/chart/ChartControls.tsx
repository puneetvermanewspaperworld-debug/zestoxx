"use client";

import React, { useState } from "react";
import { BarChart3, CandlestickChart, ChevronDown, LineChart, Mountain, RefreshCw, TrendingUp, Waves } from "lucide-react";
import { CHART_TYPES, MAX_BRICKS, chartTypeInfo, suggestBrickSize, toRenko, type ChartType } from "@/lib/chart/charttypes";
import { INTERVALS, RANGES, intervalInfo, pickInterval, pickRange, type IntervalId, type RangeId, type Selection } from "@/lib/chart/intervals";
import type { TimedCandle } from "@/lib/chart/series";
import type { ChartSettings } from "@/lib/chart/settings";
import Sheet, { Badge, rowClass } from "./Sheet";
import type { SettingsUpdate } from "./useChartSettings";

const TYPE_ICON: Record<ChartType, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  candle: CandlestickChart,
  hollow: CandlestickChart,
  bar: BarChart3,
  line: LineChart,
  area: Mountain,
  baseline: Waves,
  ha: CandlestickChart,
  renko: BarChart3,
  linebreak: TrendingUp,
};

export const controlBtn = (on = false) =>
  "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors " +
  (on ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:text-slate-900");

/** What the interval and range controls need to know about the data. */
export interface FeedInfo {
  selection: Selection;
  /** an interval or range was chosen (until then the chart shows the app's usual daily view) */
  explicit: boolean;
  /** each interval, and why it cannot be chosen now (null: it can) */
  intervals: { id: IntervalId; reason: string | null }[];
  /** the range buttons are for live Indian data only */
  showRanges: boolean;
  /** times are on the Indian clock */
  indian: boolean;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  reload: () => void;
}

export interface ChartControlsProps {
  symbol: string;
  feed: FeedInfo;
  settings: ChartSettings;
  update: SettingsUpdate;
  /** the real bars, for a brick size to be suggested and checked against */
  bars: TimedCandle[];
  /** open the type menu straight on the brick size (set from outside when Renko has no size yet) */
  sizingRequest: number;
}

/** The row of chart controls above the chart. */
export default function ChartControls(p: ChartControlsProps) {
  return (
    <div className="mb-2 space-y-1.5" data-testid="chart-controls">
      <div role="toolbar" aria-label="Chart controls" className="flex flex-wrap items-center gap-1.5">
        <TypeMenu {...p} />
        <IntervalMenu {...p} />
        {p.feed.indian && (
          <span data-testid="tz-note" className="text-[10.5px] text-slate-400">
            Times in IST
          </span>
        )}
      </div>
      {p.feed.showRanges && <RangeRow {...p} />}
      <FeedStatus {...p} />
    </div>
  );
}

const pickIn = (feed: FeedInfo, interval: IntervalId): Selection => pickInterval(feed.selection, interval);

function IntervalMenu({ update, feed }: ChartControlsProps) {
  const [open, setOpen] = useState(false);
  const cur = feed.selection.interval;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Interval: ${intervalInfo(cur).label}`} data-testid="interval-button" className={controlBtn()}>
        <span className="font-mono">{cur}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <Sheet title="Interval" onClose={() => setOpen(false)} testId="interval-sheet">
          <div role="radiogroup" aria-label="Interval">
            {INTERVALS.map((i) => {
              const a = feed.intervals.find((x) => x.id === i.id);
              const off = !!a?.reason;
              return (
                <button
                  key={i.id}
                  type="button"
                  role="radio"
                  aria-checked={cur === i.id}
                  aria-disabled={off}
                  disabled={off}
                  data-testid={`interval-${i.id}`}
                  onClick={() => {
                    const next = pickIn(feed, i.id);
                    update({ interval: next.interval, range: next.range });
                    setOpen(false);
                  }}
                  className={rowClass(cur === i.id) + (off ? " opacity-50" : "")}
                >
                  <span className="w-10 font-mono">{i.id}</span>
                  <span className="flex-1">{i.label}</span>
                  {a?.reason && <span className="text-[11px] text-slate-400">{a.reason}</span>}
                </button>
              );
            })}
          </div>
          <p className="px-3 pb-2 pt-1 text-[11px] leading-relaxed text-slate-400">Minute and hourly candles go back to January 2022; daily, weekly and monthly back to January 2000. Times are Indian Standard Time.</p>
        </Sheet>
      )}
    </>
  );
}

function RangeRow({ update, feed }: ChartControlsProps) {
  return (
    <div role="group" aria-label="Range" className="flex flex-wrap gap-1" data-testid="range-row">
      {RANGES.map((r) => {
        const on = feed.explicit && feed.selection.range === r.id;
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={on}
            data-testid={`range-${r.id}`}
            onClick={() => {
              const next = pickRange(feed.selection, r.id as RangeId);
              update({ interval: next.interval, range: next.range });
            }}
            className={controlBtn(on) + " px-3"}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

function FeedStatus({ feed }: ChartControlsProps) {
  if (feed.status === "loading")
    return (
      <p role="status" data-testid="chart-loading" className="flex min-h-[28px] items-center gap-2 text-[12px] text-slate-500">
        <RefreshCw size={14} className="animate-spin" aria-hidden /> Loading {intervalInfo(feed.selection.interval).label} candles…
      </p>
    );
  if (feed.status === "error")
    return (
      <p role="alert" data-testid="chart-error" className="flex flex-wrap items-center gap-2 text-[12px] text-rose-600">
        {feed.error}
        <button type="button" onClick={feed.reload} data-testid="chart-retry" className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-700">
          Try again
        </button>
      </p>
    );
  return null;
}

function TypeMenu({ symbol, settings, update, bars, sizingRequest }: ChartControlsProps) {
  const [open, setOpen] = useState(false);
  const [lastRequest, setLastRequest] = useState(sizingRequest);
  const [sizing, setSizing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const current = chartTypeInfo(settings.type);
  const Icon = TYPE_ICON[settings.type];
  const stored = settings.renko[symbol];

  // asked from outside (Renko is on but this symbol has no brick size yet): open straight on the brick size
  if (sizingRequest !== lastRequest) {
    setLastRequest(sizingRequest);
    openSizing();
  }

  function openSizing() {
    const suggestion = stored ?? suggestBrickSize(bars);
    setText(suggestion ? String(suggestion) : "");
    setError(null);
    setSizing(true);
    setOpen(true);
  }
  const close = () => {
    setOpen(false);
    setSizing(false);
  };
  const choose = (id: ChartType) => {
    if (id === "renko") {
      if (stored) {
        update({ type: "renko" });
        close();
      } else openSizing();
      return;
    }
    update({ type: id });
    close();
  };
  const confirmSize = () => {
    const v = Number(text);
    if (!text.trim() || !Number.isFinite(v) || v <= 0) {
      setError("Brick size must be a number above 0.");
      return;
    }
    if (toRenko(bars, v).length >= MAX_BRICKS) {
      setError(`That size would make more than ${MAX_BRICKS} bricks for this data. Use a larger one.`);
      return;
    }
    update((prev) => ({ type: "renko", renko: { ...prev.renko, [symbol]: v } }));
    close();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Chart type: ${current.label}`} data-testid="chart-type-button" className={controlBtn()}>
        <Icon size={18} aria-hidden />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <Sheet title={sizing ? "Renko brick size" : "Chart type"} onClose={close} testId="chart-type-sheet">
          {sizing ? (
            <div className="space-y-3 p-2" data-testid="renko-size-form">
              <p className="text-[12px] leading-relaxed text-slate-500">
                Each brick covers this much price. It is set once, here, and stays as you set it when new data comes in. A first value is suggested from the average true range of the bars on the chart now.
              </p>
              <label className="flex items-center gap-2 text-[12px] text-slate-600">
                Brick size for {symbol}
                <input
                  data-testid="renko-size"
                  inputMode="decimal"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && confirmSize()}
                  className="min-h-[44px] w-32 rounded-md border border-slate-200 bg-white px-2 font-mono text-[13px] outline-none focus:border-blue-400"
                />
              </label>
              {error && (
                <p role="alert" data-testid="renko-size-error" className="text-[12px] text-rose-500">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={confirmSize} data-testid="renko-size-save" className="min-h-[44px] rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white">
                  Use this size
                </button>
                <button type="button" onClick={() => setSizing(false)} className="min-h-[44px] rounded-lg border border-slate-200 px-4 text-[13px] text-slate-600">
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div role="radiogroup" aria-label="Chart type">
              {(["standard", "aggregated"] as const).map((group) => (
                <div key={group}>
                  <div className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">{group === "standard" ? "Chart types" : "Aggregated types"}</div>
                  {CHART_TYPES.filter((t) => t.group === group).map((t) => {
                    const I = TYPE_ICON[t.id];
                    return (
                      <button key={t.id} type="button" role="radio" aria-checked={settings.type === t.id} data-testid={`type-${t.id}`} onClick={() => choose(t.id)} className={rowClass(settings.type === t.id)}>
                        <I size={20} aria-hidden />
                        <span className="flex-1">{t.label}</span>
                        {t.experimental && <Badge>Experimental</Badge>}
                      </button>
                    );
                  })}
                </div>
              ))}
              {settings.type === "renko" && (
                <button type="button" onClick={openSizing} data-testid="renko-change-size" className={rowClass()}>
                  <span className="flex-1">Brick size: {stored ?? "not set"}</span>
                  <span className="text-[12px] text-blue-600">Change</span>
                </button>
              )}
              <p className="px-3 pb-2 pt-1 text-[11px] leading-relaxed text-slate-400">Renko and Line Break are experimental: their rules are the usual ones but there is no published example to check them against. The drawing tools are off on them.</p>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
