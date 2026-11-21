"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bell, CalendarRange, ChevronDown, Ellipsis, GitCompareArrows, Scan } from "lucide-react";
import { RANGES, type IntervalId, type RangeId, pickInterval, pickRange } from "@/lib/chart/intervals";
import type { ChartSettings } from "@/lib/chart/settings";
import { ATTRIBUTION_LINK_TEXT, ATTRIBUTION_NOTICE, TRADINGVIEW_URL } from "@/lib/chart/notice";
import { IntervalSheet, SettingsMenu, TypeMenu, ViewControls, type ChartControlsProps } from "./ChartControls";
import Sheet, { controlBtn, rowClass } from "./Sheet";
import StudiesMenu from "./StudiesMenu";

/**
 * The phone layout of the chart's controls. The desktop layout (ChartControls) puts every control in a wrapping row above the chart; on a
 * phone that was about 700 px of controls before the plot. Here there is: an interval bar on top, one toolbar row, and a slim status bar
 * under the plot. Everything else is in the More sheet. Every control is 44 px.
 */

/** What the trade page hands the chart for the controls that belong to the page, not the chart. */
export interface PhoneExtras {
  /** the symbols that can be compared with the one on the chart */
  compareOptions: { id: string; name: string }[];
  compareWith: string | null;
  setCompareWith: (id: string | null) => void;
  onAlert: () => void;
  formula: string;
  setFormula: (v: string) => void;
  formulaError: string | null;
  /** the Pulse pill, built by the page */
  pulse: React.ReactNode;
  /** extra rows for the More sheet (the index Call and Put buttons in landscape) */
  more?: React.ReactNode;
}

/** The intervals that have a button of their own; the rest are in the dropdown. */
export const QUICK_INTERVALS: { id: IntervalId; label: string }[] = [
  { id: "1m", label: "1m" },
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "30m", label: "30m" },
  { id: "1h", label: "1h" },
  { id: "1D", label: "D" },
];

export function IntervalBar({ feed, update }: Pick<ChartControlsProps, "feed" | "update">) {
  const [more, setMore] = useState(false);
  const cur = feed.selection.interval;
  const quick = QUICK_INTERVALS.some((q) => q.id === cur);
  const strip = useRef<HTMLDivElement | null>(null);
  // the strip scrolls on a narrow screen: keep the chosen interval in sight
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-checked="true"], [data-chosen="1"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [cur]);
  return (
    <div ref={strip} role="radiogroup" aria-label="Interval" data-testid="interval-bar" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overscroll-x-contain">
      {QUICK_INTERVALS.map((q) => {
        const reason = feed.intervals.find((x) => x.id === q.id)?.reason ?? null;
        const on = cur === q.id;
        return (
          <button
            key={q.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={q.id}
            disabled={!!reason}
            title={reason ?? undefined}
            data-testid={`ibar-${q.id}`}
            onClick={() => {
              const next = pickInterval(feed.selection, q.id);
              update({ interval: next.interval, range: next.range });
            }}
            className={"flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg px-1 font-mono text-[12.5px] font-semibold transition-colors disabled:opacity-40 " + (on ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:text-slate-900")}
          >
            {q.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setMore(true)}
        aria-haspopup="dialog"
        aria-label={quick ? "More intervals" : `Interval: ${cur}. More intervals`}
        data-testid="interval-button"
        data-chosen={quick ? "0" : "1"}
        className={"flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-0.5 rounded-lg px-1 font-mono text-[12.5px] font-semibold " + (quick ? "text-slate-600" : "bg-blue-50 text-blue-700")}
      >
        {!quick && <span>{cur}</span>}
        <ChevronDown size={15} aria-hidden />
      </button>
      {more && <IntervalSheet update={update} feed={feed} onClose={() => setMore(false)} />}
    </div>
  );
}

/** Compare with another symbol: a sheet with the symbols to pick from. */
function CompareButton({ extras }: { extras: PhoneExtras }) {
  const [open, setOpen] = useState(false);
  const on = extras.compareWith !== null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={on ? `Compare: ${extras.compareWith}` : "Compare with another symbol"} data-testid="compare-button" className={controlBtn(on)}>
        <GitCompareArrows size={18} aria-hidden />
        <span>{on ? `Compare: ${extras.compareWith}` : "Compare"}</span>
      </button>
      {open && (
        <Sheet title="Compare with" onClose={() => setOpen(false)} testId="compare-sheet">
          <div role="radiogroup" aria-label="Compare with">
            <button
              type="button"
              role="radio"
              aria-checked={!on}
              data-testid="compare-none"
              onClick={() => {
                extras.setCompareWith(null);
                setOpen(false);
              }}
              className={rowClass(!on)}
            >
              Nothing
            </button>
            {extras.compareOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={extras.compareWith === o.id}
                data-testid={`compare-${o.id}`}
                onClick={() => {
                  extras.setCompareWith(o.id);
                  setOpen(false);
                }}
                className={rowClass(extras.compareWith === o.id)}
              >
                <span className="w-24 font-mono font-medium">{o.id}</span>
                <span className="flex-1 truncate text-[12px] text-slate-400">{o.name}</span>
              </button>
            ))}
          </div>
          <p className="px-3 pb-2 pt-1 text-[11px] leading-relaxed text-slate-400">The other symbol is drawn as a dashed amber line, scaled to start where this one does.</p>
        </Sheet>
      )}
    </>
  );
}

/** The More sheet: what is left of the old control rows. */
function MoreSheet({ p, extras, onClose }: { p: ChartControlsProps; extras: PhoneExtras; onClose: () => void }) {
  return (
    <Sheet title="More" onClose={onClose} testId="more-sheet">
      <section aria-label="Chart" className="pb-2">
        <h3 className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Chart</h3>
        <div className="flex flex-wrap gap-1.5 px-3">
          <CompareButton extras={extras} />
          <button type="button" onClick={extras.onAlert} aria-label="Add a price alert" data-testid="alert-button" className={controlBtn()}>
            <Bell size={18} aria-hidden /> Alert
          </button>
        </div>
      </section>
      <section aria-label="View" className="border-t border-slate-100 pb-2">
        <h3 className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">View</h3>
        <div className="flex flex-wrap gap-1.5 px-3">
          <ViewControls {...p} />
          <SettingsMenu {...p} />
        </div>
      </section>
      <section aria-label="Custom formula" className="border-t border-slate-100 pb-2">
        <h3 className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Custom formula</h3>
        <div className="px-3">
          <input
            data-testid="formula-input"
            aria-label="Custom formula"
            value={extras.formula}
            onChange={(e) => extras.setFormula(e.target.value)}
            placeholder="e.g. sma(20) or (high+low)/2"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-[13px] text-cyan-600 placeholder-slate-400 outline-none focus:border-cyan-400"
          />
          {extras.formulaError && (
            <p role="alert" data-testid="formula-error" className="pt-1 text-[11.5px] text-rose-500">
              {extras.formulaError}
            </p>
          )}
        </div>
      </section>
      <section aria-label="Pulse" className="border-t border-slate-100 px-3 pb-2 pt-2">
        <h3 className="pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Pulse</h3>
        {extras.pulse}
      </section>
      {extras.more}
    </Sheet>
  );
}

/**
 * The interval bar with the chart type, the studies and More as icons at its end: one row, no second row of buttons. On a narrow screen the
 * intervals scroll sideways and the three icons stay put.
 */
export function PhoneTopBar({ p, extras, lead }: { p: ChartControlsProps; extras: PhoneExtras; /** landscape: the back button and symbol, at the start of the same row */ lead?: React.ReactNode }) {
  const [more, setMore] = useState(false);
  return (
    <div role="toolbar" aria-label="Chart controls" data-testid="chart-controls" className="flex shrink-0 items-center gap-0.5 border-b border-slate-100 bg-white px-0.5">
      {lead}
      <IntervalBar feed={p.feed} update={p.update} />
      <div className="flex shrink-0 items-center gap-0.5 border-l border-slate-100 pl-0.5">
        <TypeMenu {...p} compact />
        <StudiesMenu api={p.studies} openFor={p.studyRequest} onClosed={p.onStudyMenuClosed} compact />
        <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-label="More chart options" data-testid="more-button" className={controlBtn(more)}>
          <Ellipsis size={18} aria-hidden />
        </button>
      </div>
      {more && <MoreSheet p={p} extras={extras} onClose={() => setMore(false)} />}
    </div>
  );
}

/** Today's time on the Indian clock, to the second. */
function IstClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const text = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
  return (
    <span data-testid="ist-clock" className="shrink-0 font-mono text-[11.5px] text-slate-500" title="Indian Standard Time">
      {text} <span className="text-[10px] text-slate-400">IST</span>
    </span>
  );
}

/** The ranges, in a sheet: what the Date Range button opens. */
function RangeSheet({ feed, update, onClose }: { feed: ChartControlsProps["feed"]; update: ChartControlsProps["update"]; onClose: () => void }) {
  return (
    <Sheet title="Date Range" onClose={onClose} testId="range-sheet">
      <div role="radiogroup" aria-label="Date Range" data-testid="range-row">
        {RANGES.map((r) => {
          const on = feed.explicit && feed.selection.range === r.id;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`range-${r.id}`}
              onClick={() => {
                const next = pickRange(feed.selection, r.id as RangeId);
                update({ interval: next.interval, range: next.range });
                onClose();
              }}
              className={rowClass(on)}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      <p className="px-3 pb-2 pt-1 text-[11px] leading-relaxed text-slate-400">Choosing a range picks the interval that suits it; choose an interval after it to change that.</p>
    </Sheet>
  );
}

/** The slim bar under the plot: the Date Range, the time in IST, log scale, and auto (fit the price scale and jump to the latest candle). */
export function StatusBar({ feed, settings, update, reset }: { feed: ChartControlsProps["feed"]; settings: ChartSettings; update: ChartControlsProps["update"]; reset: () => void }) {
  const [ranges, setRanges] = useState(false);
  const current = feed.explicit ? RANGES.find((r) => r.id === feed.selection.range)?.label : null;
  return (
    <div data-testid="chart-status-bar" className="flex min-w-0 shrink-0 items-center gap-1 border-t border-slate-100 bg-white px-1">
      <button
        type="button"
        onClick={() => setRanges(true)}
        disabled={!feed.showRanges}
        aria-haspopup="dialog"
        title={feed.showRanges ? undefined : "Date ranges are for live Indian symbols"}
        data-testid="date-range-button"
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-[11.5px] font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40"
      >
        <CalendarRange size={14} aria-hidden /> Date Range
        {current && <span className="rounded bg-blue-50 px-1 font-mono text-[10.5px] text-blue-700">{current}</span>}
      </button>
      <span className="min-w-0 flex-1" />
      <IstClock />
      <button type="button" aria-pressed={settings.scale === "log"} aria-label="Logarithmic price scale" data-testid="log-button" onClick={() => update({ scale: settings.scale === "log" ? "normal" : "log" })} className={"flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg px-1.5 text-[12px] font-semibold " + (settings.scale === "log" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:text-slate-900")}>
        log
      </button>
      <button type="button" aria-label="Auto: fit the price scale and jump to the latest candle" data-testid="auto-button" onClick={reset} className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-0.5 rounded-lg px-1.5 text-[12px] font-semibold text-slate-500 hover:text-slate-900">
        <Scan size={13} aria-hidden />
        auto
      </button>
      {ranges && <RangeSheet feed={feed} update={update} onClose={() => setRanges(false)} />}
    </div>
  );
}

/** What the licence asks for, under the chart where it is always on screen: the link to TradingView and the notice, in full. */
export function PhoneAttribution({ right }: { /** at the right end of the line (landscape: where the price comes from) */ right?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-2 py-0.5">
      <p data-testid="chart-attribution" className="min-w-0 text-[10px] leading-[13px] text-slate-400">
        <a href={TRADINGVIEW_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-500 underline-offset-2 hover:underline">
          {ATTRIBUTION_LINK_TEXT}
        </a>
        <span> · {ATTRIBUTION_NOTICE}</span>
      </p>
      {right}
    </div>
  );
}

