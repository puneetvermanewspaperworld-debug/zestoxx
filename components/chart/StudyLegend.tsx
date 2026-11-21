"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { IChartApi } from "lightweight-charts";
import { fmtPrice } from "@/lib/chart/price";
import type { TimedCandle } from "@/lib/chart/series";
import { outputColor, studyTitle, type Num, type StudyResult } from "@/lib/chart/studies";
import { fmtOi } from "@/lib/helpers";
import type { AssetType } from "@/lib/types";

/** the bar under the crosshair, else the latest */
function useLegendIndex(chart: IChartApi | null, bars: readonly TimedCandle[]): number {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  useEffect(() => {
    if (!chart) return;
    const onMove = (param: { time?: unknown; point?: unknown }) => setHoverTime(param.time === undefined || !param.point ? null : (param.time as number));
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [chart]);
  let index = bars.length - 1;
  if (hoverTime !== null) {
    let lo = 0;
    let hi = bars.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].t === hoverTime) {
        index = mid;
        break;
      }
      if (bars[mid].t < hoverTime) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return index;
}
const legendFormat = (type: AssetType) => (key: string, v: Num | undefined) => (v === null || v === undefined ? "–" : key === "volume" ? fmtOi(v) : Math.abs(v) >= 1000 ? fmtPrice(v, type) : v.toFixed(2));

/**
 * The phone's legend: a small block of text at the top-left corner of the plot, a line for each study with its name and its values on the
 * bar under the crosshair (or the latest bar). One tap target as a whole (44 px at least): it opens the Studies sheet, where a study's
 * parameters are edited and it is removed. It is narrow and short, so it never reaches the price axis, and it takes no touches elsewhere.
 */
export function LegendCorner({ results, bars, chart, type, onOpen, maxLines = 4 }: { results: StudyResult[]; bars: readonly TimedCandle[]; chart: IChartApi | null; type: AssetType; onOpen: () => void; maxLines?: number }) {
  const index = useLegendIndex(chart, bars);
  if (results.length === 0) return null;
  const fmt = legendFormat(type);
  const shown = results.slice(0, maxLines);
  const more = results.length - shown.length;
  return (
    <button type="button" onClick={onOpen} data-testid="study-legend" data-line="corner" aria-label={`Studies on the chart: ${results.length}. Tap to edit or remove`} className="pointer-events-auto flex min-h-[44px] max-w-full flex-col items-start justify-start rounded-md bg-white/80 px-1.5 py-1 text-left font-mono text-[10.5px] leading-[14px] backdrop-blur-[1px]">
      {shown.map((r) => {
        const title = studyTitle(r.def, r.instance.params);
        return (
          <span key={r.instance.uid} data-testid={`legend-${r.instance.uid}`} data-study={r.def.id} className="flex max-w-full gap-1.5 whitespace-nowrap">
            <span className="truncate font-medium text-slate-600">{title}</span>
            {r.availability.ok ? (
              r.def.outputs.map((o) => (
                <span key={o.key} data-testid={`legend-value-${r.instance.uid}-${o.key}`} style={{ color: outputColor(r.instance, r.def, o) }}>
                  {fmt(o.key, r.values[o.key]?.[index])}
                </span>
              ))
            ) : (
              <span data-testid={`legend-reason-${r.instance.uid}`} className="truncate text-amber-700">
                {r.availability.reason}
              </span>
            )}
          </span>
        );
      })}
      {more > 0 && (
        <span data-testid="legend-more" className="text-slate-400">
          and {more} more
        </span>
      )}
    </button>
  );
}

/**
 * One chip for each study on the chart, with its values on the bar under the crosshair (or the latest bar when there is no crosshair). A
 * study that cannot be shown says why instead of a value. Tapping the name opens its parameters; the cross removes it. 44 px targets.
 */
export default function StudyLegend({ results, bars, chart, type, onEdit, onRemove, line = false }: { line?: boolean; results: StudyResult[]; bars: readonly TimedCandle[]; chart: IChartApi | null; type: AssetType; onEdit: (uid: number) => void; onRemove: (uid: number) => void }) {
  const index = useLegendIndex(chart, bars);
  if (results.length === 0) return null;
  const fmt = legendFormat(type);
  return (
    <div className={line ? "flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain" : "mb-1.5 flex flex-wrap gap-1.5"} data-testid="study-legend" data-line={line ? "1" : "0"} aria-label="Studies on the chart">
      {results.map((r) => {
        const title = studyTitle(r.def, r.instance.params);
        return (
          <div key={r.instance.uid} data-testid={`legend-${r.instance.uid}`} data-study={r.def.id} className={"flex shrink-0 items-center rounded-lg border bg-white/95 text-[11.5px] " + (r.availability.ok ? "border-slate-200" : "border-amber-200 bg-amber-50/50")}>
            <button type="button" onClick={() => onEdit(r.instance.uid)} data-testid={`legend-edit-${r.instance.uid}`} aria-label={`${title}: change parameters`} className="flex min-h-[44px] items-center gap-1.5 rounded-l-lg px-2.5 text-left hover:bg-slate-50">
              <span className="font-medium text-slate-700">{title}</span>
              {r.availability.ok ? (
                r.def.outputs.map((o) => (
                  <span key={o.key} className="font-mono" data-testid={`legend-value-${r.instance.uid}-${o.key}`} style={{ color: outputColor(r.instance, r.def, o) }}>
                    {fmt(o.key, r.values[o.key]?.[index])}
                  </span>
                ))
              ) : (
                <span data-testid={`legend-reason-${r.instance.uid}`} className="text-amber-700">
                  {r.availability.reason}
                </span>
              )}
              {r.def.note && r.availability.ok && (
                <span className="text-[10.5px] text-slate-400" data-testid={`legend-note-${r.instance.uid}`}>
                  educational, not signals
                </span>
              )}
              {r.def.experimental && <span className="rounded border border-amber-300 px-1 text-[9.5px] font-semibold uppercase text-amber-700">exp.</span>}
            </button>
            <button type="button" onClick={() => onRemove(r.instance.uid)} data-testid={`legend-remove-${r.instance.uid}`} aria-label={`Remove ${title}`} className="flex h-11 w-11 items-center justify-center rounded-r-lg text-slate-400 hover:text-rose-500">
              <X size={16} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
