"use client";

import React, { useMemo, useRef } from "react";
import { useElementWidth } from "@/lib/useElementWidth";
import { evaluate, type Market, type Outcome, type PreparedLeg, type StaticResult } from "@/lib/fno/engine";
import { compact, nf } from "@/lib/fno/format";

const PL = 54;
const PR = 12;
const PT = 12;
const PB = 28;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export interface PayoffChartProps {
  P: PreparedLeg[];
  m: Market;
  st: StaticResult;
  /** outcome at the user's chosen exit */
  sc: Outcome;
  exitSpot: number;
  /** days held, and volatility shift (points), for the dashed "exit day" curve */
  days: number;
  dIV: number;
  /** x-range of the chart, so the parent's slider can use the same one */
  onRange?: (lo: number, hi: number) => void;
  onPick: (spot: number) => void;
}

/** The chart's x-range: roughly the market's 2.4-sigma band, widened to show every strike. */
export function chartRange(P: PreparedLeg[], m: Market): { lo: number; hi: number } {
  const sigT = (m.iv / 100) * Math.sqrt(m.dte / 365);
  const k = clamp(2.4 * sigT, 0.03, 0.3);
  let lo = m.spot * (1 - k);
  let hi = m.spot * (1 + k);
  for (const L of P) if (L.isOpt) { lo = Math.min(lo, L.strike - m.step); hi = Math.max(hi, L.strike + m.step); }
  return { lo: Math.max(lo, m.spot * 0.5), hi: Math.min(hi, m.spot * 1.5) };
}

/** Profit and loss against the index at expiry, with an adjustable exit marker. Drag to move it. */
export default function PayoffChart({ P, m, st, sc, exitSpot, days, dIV, onPick }: PayoffChartProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [boxRef, W] = useElementWidth<HTMLDivElement>(640);
  const H = W < 640 ? 260 : 290;
  const dragging = useRef(false);
  const start = useRef<{ x: number; y: number; scrub: boolean } | null>(null);
  const { lo, hi } = useMemo(() => chartRange(P, m), [P, m]);
  const showExit = m.exitStyle === "square" && days < m.dte - 1e-9;

  const g = useMemo(() => {
    const N = 170;
    const xs: number[] = [];
    const yN: number[] = [];
    const yG: number[] = [];
    const yX: number[] = [];
    for (let i = 0; i <= N; i++) {
      const x = lo + ((hi - lo) * i) / N;
      xs.push(x);
      const e = evaluate(P, m, x, m.dte, 0, m.exitStyle);
      yN.push(e.pre);
      yG.push(e.gross);
      if (showExit) yX.push(evaluate(P, m, x, days, dIV, "square").pre);
    }
    const all = [...yN, ...(showExit ? yX : []), 0];
    let ymin = Math.min(...all);
    let ymax = Math.max(...all);
    if (ymax - ymin < 1) { ymax += 1; ymin -= 1; }
    const pad = (ymax - ymin) * 0.1;
    return { xs, yN, yG, yX, ymin: ymin - pad, ymax: ymax + pad };
  }, [P, m, lo, hi, days, dIV, showExit]);

  const sx = (x: number) => PL + ((x - lo) / (hi - lo)) * (W - PL - PR);
  const sy = (y: number) => PT + ((g.ymax - y) / (g.ymax - g.ymin)) * (H - PT - PB);
  const zy = clamp(sy(0), PT, H - PB);
  const path = (arr: number[]) => arr.map((y, j) => `${j ? "L" : "M"}${sx(g.xs[j]).toFixed(1)} ${sy(y).toFixed(1)}`).join("");
  const sigT = (m.iv / 100) * Math.sqrt(m.dte / 365);
  const area = `${path(g.yN)}L${sx(g.xs[g.xs.length - 1]).toFixed(1)} ${zy.toFixed(1)}L${sx(g.xs[0]).toFixed(1)} ${zy.toFixed(1)}Z`;

  // Y gridlines at "nice" steps.
  const rawStep = (g.ymax - g.ymin) / 5.5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const stp = ([1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= rawStep) ?? mag * 10);
  const ticks: number[] = [];
  for (let t = Math.ceil(g.ymin / stp) * stp; t <= g.ymax; t += stp) if (Math.abs(t) > 1e-9) ticks.push(t);

  const pick = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    const x = ((clientX - rect.left) * W) / rect.width;
    const f = clamp((x - PL) / (W - PL - PR), 0, 1);
    const stepV = Math.max(0.05, m.step / 10);
    onPick(Math.round((lo + f * (hi - lo)) / stepV) * stepV);
  };

  const bx1 = sx(clamp(m.spot * (1 - sigT), lo, hi));
  const bx2 = sx(clamp(m.spot * (1 + sigT), lo, hi));
  const exX = sx(exitSpot);
  const inRange = exitSpot >= lo && exitSpot <= hi;
  const exY = evaluate(P, m, exitSpot, m.dte, 0, m.exitStyle).pre;

  return (
    <div ref={boxRef}>
      <svg
        ref={ref}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Profit and loss at expiry for the trade. Drag to move the exit level."
        className="block touch-pan-y select-none"
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY, scrub: e.pointerType === "mouse" };
          dragging.current = true;
          // A mouse picks at once. A finger doesn't: it may be starting a scroll, which must never move the exit.
          if (e.pointerType === "mouse") { try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} pick(e.clientX); }
        }}
        onPointerMove={(e) => {
          const st = start.current;
          if (!dragging.current || !st) return;
          if (!st.scrub) {
            const dx = Math.abs(e.clientX - st.x), dy = Math.abs(e.clientY - st.y);
            if (dx < 8 || dx < dy) return; // not (yet) a deliberate sideways drag
            st.scrub = true;
          }
          pick(e.clientX);
        }}
        onPointerUp={(e) => {
          const st = start.current;
          // a tap (finger lifted almost where it landed) picks that spot
          if (st && !st.scrub && Math.abs(e.clientX - st.x) < 8 && Math.abs(e.clientY - st.y) < 8) pick(e.clientX);
          dragging.current = false;
          start.current = null;
        }}
        onPointerCancel={() => { dragging.current = false; start.current = null; }}
      >
        <defs>
          <clipPath id="fno-cu"><rect x={PL} y={PT} width={W - PL - PR} height={Math.max(0, zy - PT)} /></clipPath>
          <clipPath id="fno-cd"><rect x={PL} y={zy} width={W - PL - PR} height={Math.max(0, H - PB - zy)} /></clipPath>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={sy(t)} y2={sy(t)} stroke="#e2e8f0" />
            <text x={PL - 6} y={sy(t) + 3.5} textAnchor="end" fontSize="12" fill="#64748b">{compact(t)}</text>
          </g>
        ))}
        <line x1={PL} x2={W - PR} y1={zy} y2={zy} stroke="#94a3b8" strokeWidth="1.2" />
        <text x={PL - 6} y={zy + 3.5} textAnchor="end" fontSize="12" fill="#64748b">0</text>
        <rect x={bx1} y={PT} width={Math.max(0, bx2 - bx1)} height={H - PT - PB} fill="#2563eb" opacity=".08" />
        <path d={area} fill="#10b981" opacity=".16" clipPath="url(#fno-cu)" />
        <path d={area} fill="#f43f5e" opacity=".16" clipPath="url(#fno-cd)" />
        <path d={path(g.yG)} fill="none" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="2 3" />
        {showExit && <path d={path(g.yX)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 4" />}
        <path d={path(g.yN)} fill="none" stroke="#2563eb" strokeWidth="2.6" strokeLinejoin="round" />
        <line x1={sx(m.spot)} x2={sx(m.spot)} y1={PT} y2={H - PB} stroke="#94a3b8" strokeDasharray="3 3" />
        {st.beNet.filter((b) => b >= lo && b <= hi).map((b) => (
          <circle key={b} cx={sx(b)} cy={zy} r="4.5" fill="#fff" stroke="#0f172a" strokeWidth="2" />
        ))}
        {inRange && (
          <>
            <line x1={exX} x2={exX} y1={PT} y2={H - PB} stroke="#f59e0b" strokeWidth="1.6" />
            <circle cx={exX} cy={sy(exY)} r="4" fill="#2563eb" />
            {showExit && <circle cx={exX} cy={sy(sc.pre)} r="4.5" fill="#f59e0b" />}
          </>
        )}
        {[0, 1, 2, 3, 4].map((i) => {
          const v = lo + ((hi - lo) * i) / 4;
          return (
            <text key={i} x={sx(v)} y={H - 8} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} fontSize="12" fill="#64748b">
              {nf(v)}
            </text>
          );
        })}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600">
        <li className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-blue-600" />At expiry, after charges</li>
        {showExit && <li className="flex items-center gap-1.5"><i className="inline-block h-0 w-4 border-t-2 border-dashed border-amber-500" />On your exit day</li>}
        <li className="flex items-center gap-1.5"><i className="inline-block h-0 w-4 border-t-2 border-dotted border-slate-400" />Before charges</li>
        <li className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full border-2 border-slate-900 bg-white" />Breakeven</li>
        <li>Shaded band: expected range (about 2 days in 3)</li>
      </ul>
    </div>
  );
}
