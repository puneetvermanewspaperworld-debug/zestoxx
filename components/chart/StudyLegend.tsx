"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { IChartApi } from "lightweight-charts";
import { fmtPrice } from "@/lib/chart/price";
import type { TimedCandle } from "@/lib/chart/series";
import { outputColor, studyTitle, type Num, type StudyResult } from "@/lib/chart/studies";
import { fmtOi } from "@/lib/helpers";
import type { AssetType } from "@/lib/types";

/**
 * One chip for each study on the chart, with its values on the bar under the crosshair (or the latest bar when there is no crosshair). A
 * study that cannot be shown says why instead of a value. Tapping the name opens its parameters; the cross removes it. 44 px targets.
 */
export default function StudyLegend({ results, bars, chart, type, onEdit, onRemove }: { results: StudyResult[]; bars: readonly TimedCandle[]; chart: IChartApi | null; type: AssetType; onEdit: (uid: number) => void; onRemove: (uid: number) => void }) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  useEffect(() => {
    if (!chart) return;
    const onMove = (param: { time?: unknown; point?: unknown }) => setHoverTime(param.time === undefined || !param.point ? null : (param.time as number));
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [chart]);
  if (results.length === 0) return null;
  // the bar under the crosshair, else the latest
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
  const fmt = (key: string, v: Num | undefined) => (v === null || v === undefined ? "–" : key === "volume" ? fmtOi(v) : Math.abs(v) >= 1000 ? fmtPrice(v, type) : v.toFixed(2));
  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5" data-testid="study-legend" aria-label="Studies on the chart">
      {results.map((r) => {
        const title = studyTitle(r.def, r.instance.params);
        return (
          <div key={r.instance.uid} data-testid={`legend-${r.instance.uid}`} data-study={r.def.id} className={"flex items-center rounded-lg border bg-white text-[11.5px] " + (r.availability.ok ? "border-slate-200" : "border-amber-200 bg-amber-50/50")}>
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
