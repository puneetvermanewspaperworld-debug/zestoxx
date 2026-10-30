"use client";

import React from "react";
import { Clock } from "lucide-react";
import { SESSION_CLOSE, SESSION_OPEN, fromHHMM, toHHMM } from "@/lib/buildup-window";
import { fmtIsoDate } from "@/lib/helpers";
import type { RangeSel } from "@/lib/useBuildupWindow";

const PRESETS: { label: string; minutes: number }[] = [
  { label: "1m", minutes: 1 },
  { label: "5m", minutes: 5 },
  { label: "10m", minutes: 10 },
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "100m", minutes: 100 },
];

export interface RangeSpan {
  firstMin: number;
  lastMin: number;
  /** YYYY-MM-DD of the session the minute data belongs to */
  date: string;
  liveSession: boolean;
}

const THUMB =
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] " +
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 " +
  "[&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:shadow-md " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] " +
  "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white " +
  "[&::-moz-range-thumb]:bg-blue-600";

/** Two thumbs on one track: start and end, at least one minute apart. */
function DualRange({
  min,
  max,
  from,
  to,
  onChange,
}: {
  min: number;
  max: number;
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
}) {
  const span = Math.max(1, max - min);
  const pct = (v: number) => ((v - min) / span) * 100;
  // Whichever thumb sits nearer the track's far end stays on top, so two thumbs bunched up at
  // an edge can both still be grabbed.
  const startOnTop = from > min + span / 2;
  const base =
    "pointer-events-none absolute inset-0 h-8 w-full appearance-none bg-transparent focus:outline-none " + THUMB;
  return (
    <div className="relative h-8">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-500"
        style={{ left: `${pct(from)}%`, width: `${Math.max(0, pct(to) - pct(from))}%` }}
      />
      <input
        type="range"
        aria-label="Start time"
        aria-valuetext={toHHMM(from)}
        min={min}
        max={max}
        step={1}
        value={from}
        onChange={(e) => onChange(Math.min(Number(e.target.value), to - 1), to)}
        className={base + (startOnTop ? " z-30" : " z-20")}
      />
      <input
        type="range"
        aria-label="End time"
        aria-valuetext={toHHMM(to)}
        min={min}
        max={max}
        step={1}
        value={to}
        onChange={(e) => onChange(from, Math.max(Number(e.target.value), from + 1))}
        className={base + (startOnTop ? " z-20" : " z-30")}
      />
    </div>
  );
}

const chip = (on: boolean, disabled: boolean) =>
  "shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium whitespace-nowrap " +
  (disabled
    ? "cursor-not-allowed text-slate-300"
    : on
      ? "bg-blue-600 text-slate-50"
      : "text-slate-500 hover:text-slate-900");

const dayLabel = (iso: string) =>
  `${new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })} ${fmtIsoDate(iso)}`;

/**
 * "Time liner": pick the span the buildup is measured over — since the previous close, the last
 * 1/5/10/30/60/100 minutes, or any start and end time (slider or typed).
 */
export default function TimeRangeBar({
  value,
  onChange,
  span,
  resolved,
  loading,
  disabledReason,
}: {
  value: RangeSel;
  onChange: (v: RangeSel) => void;
  /** what the minute data covers, once a window has been fetched */
  span: RangeSpan | null;
  /** the [from, to) the server actually used */
  resolved: { from: number; to: number } | null;
  loading: boolean;
  /** when set, only "Since prev close" is usable and this says why */
  disabledReason?: string;
}) {
  const disabled = !!disabledReason;
  const min = span?.firstMin ?? SESSION_OPEN;
  const max = span?.lastMin ?? SESSION_CLOSE;

  // The span a custom range starts from when the user switches to it.
  const customFrom = resolved?.from ?? Math.max(min, max - 60);
  const customTo = resolved?.to ?? max;

  const setCustom = (from: number, to: number) => onChange({ kind: "custom", from, to });
  const typed = (which: "from" | "to") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const m = fromHHMM(e.target.value);
    if (m == null || value.kind !== "custom") return;
    const clamped = Math.min(max, Math.max(min, m));
    if (which === "from") setCustom(Math.min(clamped, value.to - 1), value.to);
    else setCustom(value.from, Math.max(clamped, value.from + 1));
  };

  const readout =
    value.kind === "prev"
      ? "Premium and OI change since the previous session's close."
      : resolved
        ? `${toHHMM(resolved.from)} → ${toHHMM(resolved.to)} IST · ${resolved.to - resolved.from} min`
        : "Reading minute data…";

  return (
    <section aria-label="Time window" className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <Clock size={13} /> Time window
        </span>
        <div role="group" aria-label="Window length" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-slate-200 p-0.5">
          <button
            type="button"
            aria-pressed={value.kind === "prev"}
            onClick={() => onChange({ kind: "prev" })}
            className={chip(value.kind === "prev", false)}
          >
            Since prev close
          </button>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={disabled}
              aria-pressed={value.kind === "back" && value.minutes === p.minutes}
              onClick={() => onChange({ kind: "back", minutes: p.minutes })}
              title={disabled ? disabledReason : `The last ${p.minutes} minute${p.minutes === 1 ? "" : "s"}`}
              className={chip(value.kind === "back" && value.minutes === p.minutes, disabled)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            disabled={disabled}
            aria-pressed={value.kind === "custom"}
            onClick={() => setCustom(customFrom, customTo)}
            title={disabled ? disabledReason : "Choose any start and end time"}
            className={chip(value.kind === "custom", disabled)}
          >
            Custom
          </button>
        </div>
      </div>

      {value.kind === "custom" && (
        <div className="mt-3">
          <DualRange min={min} max={max} from={value.from} to={value.to} onChange={setCustom} />
          <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-400">
            <label className="flex items-center gap-1.5">
              Start
              <input
                type="time"
                value={toHHMM(value.from)}
                min={toHHMM(min)}
                max={toHHMM(max)}
                onChange={typed("from")}
                className="rounded-md border border-slate-200 bg-white px-1.5 py-1 font-mono text-[12px] text-slate-900 outline-none focus:border-blue-400"
              />
            </label>
            <span className="hidden sm:inline">
              {toHHMM(min)} – {toHHMM(max)}
            </span>
            <label className="flex items-center gap-1.5">
              End
              <input
                type="time"
                value={toHHMM(value.to)}
                min={toHHMM(min)}
                max={toHHMM(max)}
                onChange={typed("to")}
                className="rounded-md border border-slate-200 bg-white px-1.5 py-1 font-mono text-[12px] text-slate-900 outline-none focus:border-blue-400"
              />
            </label>
          </div>
        </div>
      )}

      <p aria-live="polite" className="mt-2 flex flex-wrap items-center gap-x-2 text-[11.5px] text-slate-500">
        <span className={"font-mono " + (loading ? "text-slate-400" : "text-slate-700")}>{readout}</span>
        {loading && value.kind !== "prev" && <span className="text-slate-400">updating…</span>}
        {value.kind !== "prev" && span && (
          <span className="text-slate-400">
            · {dayLabel(span.date)}
            {span.liveSession ? " · live session" : " · latest session with minute data"}
          </span>
        )}
      </p>
      {disabled && <p className="mt-1 text-[11px] text-slate-400">{disabledReason}</p>}
    </section>
  );
}
