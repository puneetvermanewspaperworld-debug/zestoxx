"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CoverageChip, FundsFooter } from "@/components/FundsNotes";
import { MF_EMPTY } from "@/lib/mf/disclaimer";
import { TILE_BY_ID, type TileId } from "@/lib/mf/categories";
import { RETURN_COLUMNS, sortByReturn, type FundRow, type ReturnKey } from "@/lib/mf/overview";
import { fmtINR, fmtIsoDate } from "@/lib/helpers";

type Loaded = { state: "loading" } | { state: "none" } | { state: "ok"; rows: FundRow[] };

const pct = (v: number | null) => (v === null ? "--" : `${v < 0 ? "−" : v > 0 ? "+" : ""}${Math.abs(v).toFixed(2)}%`);
const tone = (v: number | null) => (v === null || v === 0 ? "text-slate-400" : v > 0 ? "text-emerald-600" : "text-rose-500");

export default function FundCategoryView({ tile }: { tile: TileId }) {
  const info = TILE_BY_ID[tile];
  const [data, setData] = useState<Loaded>({ state: "loading" });
  const [sort, setSort] = useState<ReturnKey>("ret1y");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mf/list?tile=${encodeURIComponent(tile)}`)
      .then((r) => (r.ok ? r.json() : { status: "unavailable" }))
      .catch(() => ({ status: "unavailable" }))
      .then((j) => !cancelled && setData(j.status === "ok" && Array.isArray(j.rows) ? { state: "ok", rows: j.rows } : { state: "none" }));
    return () => {
      cancelled = true;
    };
  }, [tile]);

  const rows = useMemo(() => {
    if (data.state !== "ok") return [];
    const term = q.trim().toLowerCase();
    const filtered = term ? data.rows.filter((r) => r.name.toLowerCase().includes(term) || r.amc.toLowerCase().includes(term)) : data.rows;
    return sortByReturn(filtered, sort);
  }, [data, q, sort]);
  const asOf = data.state === "ok" ? data.rows.reduce((m, r) => (r.navDate > m ? r.navDate : m), "") : "";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <Link href="/app/funds" className="inline-flex min-h-[44px] items-center gap-1 text-[12px] font-medium text-blue-600 hover:underline">
          <ArrowLeft size={13} /> All categories
        </Link>
        <h2 className="font-display text-[15px] font-semibold text-slate-900">{info.label}</h2>
        <p className="text-[12px] text-slate-400">{info.blurb}</p>
        <div className="mt-2">
          <CoverageChip />
        </div>
      </div>

      {data.state === "loading" ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : data.state === "none" ? (
        <div data-testid="mf-empty" className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-[13px] text-slate-500">
          {MF_EMPTY}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="space-y-2 border-b border-slate-100 p-3">
            <div role="group" aria-label="Sort by return" className="flex flex-wrap gap-1">
              {RETURN_COLUMNS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={sort === c.key}
                  onClick={() => setSort(c.key)}
                  className={"min-h-[36px] rounded px-3 py-1 text-[12px] font-medium " + (sort === c.key ? "bg-blue-600 text-slate-50" : "border border-slate-200 text-slate-600 hover:text-slate-900")}
                >
                  {c.label}
                </button>
              ))}
              <span className="self-center pl-1 text-[11px] text-slate-400">best first</span>
            </div>
            <input
              aria-label="Search funds"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by fund or fund house"
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12.5px] text-slate-900 outline-none focus:border-blue-400"
            />
            <p className="text-[11px] text-slate-400">
              {rows.length} funds · NAVs as of {fmtIsoDate(asOf)} · 3 and 5 year returns are annualised
            </p>
          </div>
          <ul data-testid="mf-list">
            {rows.map((r) => (
              <li key={r.code} className="border-b border-slate-50 last:border-0">
                <Link href={`/app/funds/${r.code}`} className="flex min-h-[56px] items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block break-words text-[12.5px] font-medium text-slate-900">{r.name}</span>
                    <span className="block truncate text-[10.5px] text-slate-400">{r.amc}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={"block font-mono text-[13px] font-semibold " + tone(r[sort])}>{pct(r[sort])}</span>
                    <span className="block font-mono text-[10.5px] text-slate-400">NAV {fmtINR(r.nav)}</span>
                  </span>
                </Link>
              </li>
            ))}
            {rows.length === 0 && <li className="px-4 py-10 text-center text-[12.5px] text-slate-400">No fund matches that search.</li>}
          </ul>
        </div>
      )}
      <FundsFooter />
    </div>
  );
}
