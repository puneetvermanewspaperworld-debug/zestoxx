"use client";

import React, { useMemo, useState } from "react";
import { fmtCr } from "@/lib/format-cr";
import { useElementWidth } from "@/lib/useElementWidth";

export interface FlowPoint {
  key: string;
  label: string;
  net: number;
}

const GREEN = "#047857";
const RED = "#be123c";
const H = 260;

/** A "nice" tick step (1, 2, 2.5, 5 × 10ⁿ) that gives about `want` ticks over `span`. */
function niceStep(span: number, want = 4): number {
  const raw = span / want;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? mag * 10);
}

/**
 * Net buying (green, above the zero line) and net selling (red, below it), one bar per row — the same rows
 * the table lists. Drawn at the real container width so the 12px labels stay 12px. Tap or hover a bar for its
 * value.
 */
export default function FlowChart({ rows, title }: { rows: FlowPoint[]; title: string }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(340);
  const [picked, setPicked] = useState<string | null>(null);

  const g = useMemo(() => {
    const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
    const step = niceStep(maxAbs * 2, 4);
    const top = Math.ceil(maxAbs / step) * step;
    const ticks: number[] = [];
    for (let t = -top; t <= top + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
    return { top, ticks };
  }, [rows]);

  const padL = width < 420 ? 76 : 84;
  const padR = 8;
  const padT = 10;
  const padB = 26;
  const innerW = Math.max(1, width - padL - padR);
  const innerH = H - padT - padB;
  const y = (v: number) => padT + ((g.top - v) / (2 * g.top)) * innerH;
  const slot = innerW / Math.max(1, rows.length);
  const barW = Math.max(2, Math.min(18, slot * 0.7));
  const x = (i: number) => padL + slot * i + slot / 2;
  const zero = y(0);

  // About 3–4 date labels, spaced so they can't collide at 12px.
  const labelEvery = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(innerW / 74))));
  const shown = rows.filter((_, i) => i % labelEvery === 0 || i === rows.length - 1);
  const lastShown = shown[shown.length - 1];
  // Don't draw the second-to-last label if it would sit on top of the last one.
  const labelled = shown.filter((r, i) => !(r !== lastShown && i === shown.length - 2 && (rows.length - 1 - rows.indexOf(r)) < labelEvery * 0.6));

  const sel = rows.find((r) => r.key === picked) ?? null;

  return (
    <div>
      <p className="mb-1 min-h-[20px] text-[12px] text-slate-600" aria-live="polite">
        {sel ? (
          <>
            <span className="font-medium text-slate-900">{sel.label}</span>:{" "}
            <span className="font-semibold tabular-nums" style={{ color: sel.net >= 0 ? GREEN : RED }}>
              {fmtCr(sel.net)}
            </span>
          </>
        ) : (
          "Tap a bar to see its amount."
        )}
      </p>
      <div ref={ref} className="w-full">
        <svg
          width={width}
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={`${title}: ${rows.length} periods, green bars above zero are net buying, red bars below zero are net selling, in rupees crore`}
          className="block touch-pan-y select-none"
        >
          {g.ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#64748b" : "#e2e8f0"} strokeWidth={t === 0 ? 1.4 : 1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#475569">
                {t === 0 ? "₹0" : fmtCr(t)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const h = Math.max(1, Math.abs(y(r.net) - zero));
            const up = r.net >= 0;
            return (
              <g key={r.key} onClick={() => setPicked(r.key)} onMouseEnter={() => setPicked(r.key)} style={{ cursor: "pointer" }}>
                <title>{`${r.label}: ${fmtCr(r.net)}`}</title>
                {/* wide invisible target so a thin bar is still easy to tap */}
                <rect x={x(i) - slot / 2} y={padT} width={slot} height={innerH} fill="transparent" />
                <rect x={x(i) - barW / 2} y={up ? zero - h : zero} width={barW} height={h} rx={1} fill={up ? GREEN : RED} opacity={picked && picked !== r.key ? 0.45 : 1} />
              </g>
            );
          })}
          {labelled.map((r) => {
            const i = rows.indexOf(r);
            const first = i === 0;
            const last = i === rows.length - 1;
            return (
              <text key={r.key} x={x(i)} y={H - 6} textAnchor={first ? "start" : last ? "end" : "middle"} fontSize="12" fill="#475569">
                {r.label}
              </text>
            );
          })}
        </svg>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600">
        <li className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GREEN }} /> Net buying (above zero)
        </li>
        <li className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: RED }} /> Net selling (below zero)
        </li>
        <li>₹ crore (Cr)</li>
      </ul>
    </div>
  );
}
