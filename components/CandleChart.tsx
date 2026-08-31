"use client";

import React, { useMemo, useRef, useState } from "react";
import { maSeries, emaSeries, bollingerBands } from "@/lib/indicators";
import type { Candle, Drawing } from "@/lib/types";

interface CandleChartProps {
  candles: Candle[];
  showMA?: boolean;
  showVolume?: boolean;
  showBB?: boolean;
  showEMA?: boolean;
  compareSeries?: Candle[] | null;
  customSeries?: (number | null)[] | null;
  drawMode?: string;
  drawings?: Drawing[];
  onAddDrawing?: (d: Drawing) => void;
}

export default function CandleChart({
  candles,
  showMA,
  showVolume,
  showBB,
  showEMA,
  compareSeries,
  customSeries,
  drawMode,
  drawings,
  onAddDrawing,
}: CandleChartProps) {
  const width = 900,
    height = showVolume ? 340 : 300;
  const padL = 8,
    padR = 58,
    padT = 14;
  const volH = showVolume ? 60 : 0;
  const padB = 20 + volH;
  const highs = candles.map((c) => c.high),
    lows = candles.map((c) => c.low);
  let max = Math.max(...highs),
    min = Math.min(...lows);
  const bb = showBB ? bollingerBands(candles, 20, 2) : null;
  if (bb) {
    const bbVals = [...bb.upper, ...bb.lower].filter((v): v is number => v != null);
    if (bbVals.length) {
      max = Math.max(max, ...bbVals);
      min = Math.min(min, ...bbVals);
    }
  }
  if (customSeries) {
    const csVals = customSeries.filter((v): v is number => v != null);
    if (csVals.length) {
      max = Math.max(max, ...csVals);
      min = Math.min(min, ...csVals);
    }
  }
  const range = max - min || 1;
  const chartW = width - padL - padR,
    chartH = height - padT - padB;
  const n = candles.length,
    step = chartW / n,
    candleW = Math.max(2, step * 0.56);
  const xFor = (i: number) => padL + i * step + step / 2;
  const yFor = (v: number) => padT + chartH - ((v - min) / range) * chartH;
  const priceFor = (y: number) => min + ((padT + chartH - y) / chartH) * range;
  const gridVals = Array.from({ length: 5 }, (_, i) => min + (range * i) / 4);
  const ma10 = showMA ? maSeries(candles, 10) : null;
  const ma30 = showMA ? maSeries(candles, 30) : null;
  const ema20 = showEMA ? emaSeries(candles, 20) : null;
  const maxVol = Math.max(...candles.map((c) => c.volume));
  const volY = height - volH;

  const pathFor = (series: (number | null)[]) =>
    series
      .map((v, i) => (v == null ? null : `${series[i - 1] == null ? "M" : "L"} ${xFor(i)} ${yFor(v)}`))
      .filter(Boolean)
      .join(" ");

  const cmpPath = useMemo(() => {
    if (!compareSeries || compareSeries.length !== candles.length) return null;
    const base = compareSeries[0]?.close;
    if (!base) return null;
    const normalized = compareSeries.map(
      (c) => min + ((c.close / base - 1) * 8 + 0.5) * range * 0.5 + range * 0.25
    );
    return pathFor(normalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareSeries, candles.length, min, range]);

  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const toViewBox = (e: React.MouseEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!drawMode || drawMode === "none") return;
    const loc = toViewBox(e);
    if (drawMode === "hline") {
      onAddDrawing?.({ type: "hline", price: priceFor(loc.y) });
      return;
    }
    if (drawMode === "trend") {
      if (!pending) setPending({ x: loc.x, y: loc.y });
      else {
        onAddDrawing?.({ type: "trend", x1: pending.x, y1: pending.y, x2: loc.x, y2: loc.y });
        setPending(null);
      }
    }
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      onClick={handleClick}
      style={{ cursor: drawMode && drawMode !== "none" ? "crosshair" : "default" }}
    >
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR + 8} y1={yFor(v)} y2={yFor(v)} stroke="#1A2740" strokeWidth="1" />
          <text
            x={width - padR + 12}
            y={yFor(v) + 3}
            fontSize="10"
            fill="#586179"
            fontFamily="ui-monospace, monospace"
          >
            {v >= 1000 ? v.toFixed(0) : v.toFixed(2)}
          </text>
        </g>
      ))}
      {bb && (
        <>
          <path d={pathFor(bb.upper)} fill="none" stroke="#6FA8DC" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
          <path d={pathFor(bb.lower)} fill="none" stroke="#6FA8DC" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
        </>
      )}
      {candles.map((c, i) => {
        const isUp = c.close >= c.open;
        const color = isUp ? "#34D399" : "#F87171";
        const x = xFor(i);
        const bodyTop = yFor(Math.max(c.open, c.close));
        const bodyH = Math.max(1, Math.abs(yFor(c.open) - yFor(c.close)));
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yFor(c.high)} y2={yFor(c.low)} stroke={color} strokeWidth="1" />
            <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} />
          </g>
        );
      })}
      {showMA && ma10 && <path d={pathFor(ma10)} fill="none" stroke="#D4A94E" strokeWidth="1.4" />}
      {showMA && ma30 && <path d={pathFor(ma30)} fill="none" stroke="#6FA8DC" strokeWidth="1.4" />}
      {showEMA && ema20 && <path d={pathFor(ema20)} fill="none" stroke="#B87FE0" strokeWidth="1.4" />}
      {customSeries && <path d={pathFor(customSeries)} fill="none" stroke="#22D3EE" strokeWidth="1.6" />}
      {cmpPath && (
        <path d={cmpPath} fill="none" stroke="#F0A84E" strokeWidth="1.2" strokeDasharray="2 2" opacity="0.85" />
      )}
      {showVolume && (
        <g>
          <line x1={padL} x2={width - padR + 8} y1={volY} y2={volY} stroke="#1A2740" strokeWidth="1" />
          {candles.map((c, i) => {
            const isUp = c.close >= c.open;
            const h = (c.volume / maxVol) * (volH - 8);
            const x = xFor(i);
            return (
              <rect
                key={i}
                x={x - candleW / 2}
                y={height - h}
                width={candleW}
                height={h}
                fill={isUp ? "#34D39955" : "#F8717155"}
              />
            );
          })}
        </g>
      )}
      {(drawings || []).map((d, i) =>
        d.type === "hline" ? (
          <g key={i}>
            <line
              x1={padL}
              x2={width - padR + 8}
              y1={yFor(d.price)}
              y2={yFor(d.price)}
              stroke="#D4A94E"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
            <text
              x={padL + 4}
              y={yFor(d.price) - 3}
              fontSize="9.5"
              fill="#D4A94E"
              fontFamily="ui-monospace, monospace"
            >
              {d.price.toFixed(2)}
            </text>
          </g>
        ) : (
          <line key={i} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#D4A94E" strokeWidth="1.6" />
        )
      )}
      {pending && <circle cx={pending.x} cy={pending.y} r="3" fill="#D4A94E" />}
    </svg>
  );
}
