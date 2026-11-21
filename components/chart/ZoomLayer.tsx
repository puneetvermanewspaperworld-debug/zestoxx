"use client";

import React, { useRef, useState } from "react";
import type { IChartApi } from "lightweight-charts";

/**
 * Zoom: drag across the part of the chart that should fill the screen. It zooms the time axis to the bars between the two ends of the drag
 * and lets the price scale fit what is then in sight. A tap, or a drag under 12 px, does nothing. It covers the plot only while the zoom
 * tool is on, and turns itself off after one zoom.
 */
export default function ZoomLayer({ chart, onDone }: { chart: IChartApi | null; onDone: () => void }) {
  const [drag, setDrag] = useState<{ x0: number; x1: number } | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const xOf = (e: React.PointerEvent) => e.clientX - (box.current?.getBoundingClientRect().left ?? 0);
  return (
    <div
      ref={box}
      data-testid="zoom-layer"
      className="absolute inset-0 z-[25] cursor-zoom-in touch-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const x = xOf(e);
        setDrag({ x0: x, x1: x });
      }}
      onPointerMove={(e) => drag && setDrag({ ...drag, x1: xOf(e) })}
      onPointerUp={(e) => {
        const d = drag ? { ...drag, x1: xOf(e) } : null;
        setDrag(null);
        if (!d || !chart || Math.abs(d.x1 - d.x0) < 12) return;
        const a = chart.timeScale().coordinateToLogical(Math.min(d.x0, d.x1));
        const b = chart.timeScale().coordinateToLogical(Math.max(d.x0, d.x1));
        if (a === null || b === null) return;
        // at least a handful of bars, so a very short drag does not blow one candle up to the whole screen
        const from = a as number;
        const to = Math.max(b as number, from + 4);
        chart.priceScale("right").applyOptions({ autoScale: true });
        chart.timeScale().setVisibleLogicalRange({ from, to });
        onDone();
      }}
      onPointerCancel={() => setDrag(null)}
    >
      {drag && Math.abs(drag.x1 - drag.x0) >= 2 && (
        <div data-testid="zoom-box" className="pointer-events-none absolute inset-y-0 border-x-2 border-blue-500 bg-blue-500/15" style={{ left: Math.min(drag.x0, drag.x1), width: Math.abs(drag.x1 - drag.x0) }} />
      )}
      {!drag && (
        <p className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-slate-900/85 px-3 py-1 text-[11.5px] text-white" data-testid="zoom-hint">
          Drag across the part to zoom in on.
        </p>
      )}
    </div>
  );
}
