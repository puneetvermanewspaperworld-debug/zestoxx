"use client";

import React from "react";
import { rsiSeries } from "@/lib/indicators";
import type { Candle } from "@/lib/types";

export default function RSIPanel({ candles }: { candles: Candle[] }) {
  const width = 900,
    height = 90,
    padL = 8,
    padR = 58,
    padT = 10,
    padB = 10;
  const series = rsiSeries(candles, 14);
  const chartW = width - padL - padR,
    chartH = height - padT - padB;
  const n = candles.length,
    step = chartW / n;
  const xFor = (i: number) => padL + i * step + step / 2;
  const yFor = (v: number) => padT + chartH - (v / 100) * chartH;
  const path = series
    .map((v, i) => (v == null ? null : `${series[i - 1] == null ? "M" : "L"} ${xFor(i)} ${yFor(v)}`))
    .filter(Boolean)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      {[30, 50, 70].map((v) => (
        <line
          key={v}
          x1={padL}
          x2={width - padR + 8}
          y1={yFor(v)}
          y2={yFor(v)}
          stroke="#1A2740"
          strokeDasharray={v === 50 ? "0" : "3 3"}
          strokeWidth="1"
        />
      ))}
      <text x={width - padR + 12} y={yFor(70) + 3} fontSize="9" fill="#586179" fontFamily="ui-monospace, monospace">
        70
      </text>
      <text x={width - padR + 12} y={yFor(30) + 3} fontSize="9" fill="#586179" fontFamily="ui-monospace, monospace">
        30
      </text>
      <path d={path} fill="none" stroke="#B87FE0" strokeWidth="1.4" />
    </svg>
  );
}
