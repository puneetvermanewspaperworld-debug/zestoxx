"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PiggyBank } from "lucide-react";
import { CoverageChip, FundsFooter } from "@/components/FundsNotes";
import { MF_EMPTY } from "@/lib/mf/disclaimer";
import { MIXES, evaluateMix } from "@/lib/mf/mixes";
import { TILE_BY_ID } from "@/lib/mf/categories";
import { monthlyNeeded } from "@/lib/mf/sip";
import { fmtIsoDate, fmtINR } from "@/lib/helpers";
import type { TileSummary } from "@/lib/mf/overview";

type Loaded = { state: "loading" } | { state: "none" } | { state: "ok"; asOf: string; tiles: TileSummary[] };

const pct = (v: number | null) => (v === null ? "--" : `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);

export default function FundsView() {
  const [data, setData] = useState<Loaded>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/mf/overview")
      .then((r) => (r.ok ? r.json() : { status: "unavailable" }))
      .catch(() => ({ status: "unavailable" }))
      .then((j) => {
        if (cancelled) return;
        setData(j.status === "ok" && Array.isArray(j.tiles) ? { state: "ok", asOf: j.asOf, tiles: j.tiles } : { state: "none" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-4">
        <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-slate-900">
          <PiggyBank size={16} className="text-blue-600" /> Mutual Funds
        </h2>
        <p className="mt-1 text-[12px] text-slate-500">Browse funds by category and see their past returns. Informational only: nothing here buys a fund or sets up a SIP.</p>
        <div className="mt-2">
          <CoverageChip />
        </div>
      </div>

      {data.state === "loading" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-[84px] animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : data.state === "none" ? (
        <div data-testid="mf-empty" className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-[13px] text-slate-500">
          {MF_EMPTY}
        </div>
      ) : (
        <>
          <p className="text-[11.5px] text-slate-400">NAVs as of {fmtIsoDate(data.asOf)}. Median returns are over the funds stored in each category.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {data.tiles.map((t) => (
              <Link
                key={t.id}
                href={`/app/funds/category/${t.id}`}
                data-testid={`tile-${t.id}`}
                className="flex min-h-[84px] min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-200"
              >
                <div>
                  <div className="text-[13px] font-semibold text-slate-900">{t.label}</div>
                  <div className="text-[10.5px] text-slate-400">{t.blurb}</div>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-1 text-[11px] text-slate-500">
                  <span>{t.count} {t.count === 1 ? "fund" : "funds"}</span>
                  <span className="font-mono">1Y {pct(t.median1y)}</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="mf-mixes">
            <h3 className="font-display text-[13px] font-semibold text-slate-900">Sample mixes</h3>
            <p className="mt-0.5 text-[11.5px] text-slate-400">
              Illustrations of how a goal could be split across categories. No fund is named and none is recommended. Figures use the median past 3-year return of each category, which may not repeat.
            </p>
            <div className="mt-3 space-y-3">
              {MIXES.map((m) => {
                const r = evaluateMix(m, data.tiles);
                const need = r.mixReturn === null ? null : monthlyNeeded(m.goal, m.years, r.mixReturn);
                return (
                  <div key={m.id} data-testid={`mix-${m.id}`} className="rounded-lg border border-slate-100 p-3">
                    <div className="text-[13px] font-medium text-slate-900">{m.title}</div>
                    <ul className="mt-1.5 space-y-0.5 text-[12px]">
                      {m.parts.map((p, i) => (
                        <li key={p.tile} className="flex justify-between gap-2">
                          <span className="text-slate-600">
                            {p.pct}% <Link href={`/app/funds/category/${p.tile}`} className="text-blue-600 hover:underline">{TILE_BY_ID[p.tile].label}</Link>
                          </span>
                          <span className="font-mono text-slate-500">3Y {pct(r.partReturns[i])}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11.5px] text-slate-500">
                      {r.mixReturn === null || need === null
                        ? "Return figures need more stored history for these categories."
                        : `At the mix's past 3-year return of ${pct(r.mixReturn)} a year, about ${fmtINR(Math.round(need / 100) * 100)} a month for ${m.years} years would reach ${fmtINR(m.goal)}.`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      <FundsFooter />
    </div>
  );
}
