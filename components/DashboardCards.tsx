"use client";

import React from "react";
import Link from "next/link";
import { useMovers } from "@/lib/useMovers";
import { fmtINR, fmtIsoDate, fmtSigned } from "@/lib/helpers";
import { futuresGainers } from "@/lib/dashboard-cards";
import type { FutureMovers } from "@/lib/movers";

/** Futures gainers: the top futures that are up, from the same live feed as the Movers page. */
export function FuturesGainersCard() {
  const { res, loading } = useMovers<FutureMovers>("view=futures");
  const view = futuresGainers(loading ? null : res);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="futures-gainers-card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-[13px] font-semibold text-slate-900">Futures gainers</h3>
        <Link href="/app/movers" className="text-[11.5px] font-medium text-blue-600 hover:underline">
          More →
        </Link>
      </div>
      {view.kind === "loading" ? (
        <div className="h-[72px] animate-pulse rounded bg-slate-50" aria-busy="true" />
      ) : view.kind === "rows" ? (
        view.rows.map((f) => (
          <div key={f.symbol + f.expiry} className="flex items-center justify-between gap-2 py-1 text-[12px]">
            <span className="min-w-0 truncate">
              <span className="font-medium text-slate-900">{f.symbol}</span>
              <span className="ml-1.5 text-[10.5px] text-slate-400">FUT · {fmtIsoDate(f.expiry, false)}</span>
            </span>
            <span className="shrink-0 text-right font-mono">
              <span className="text-slate-500">{fmtINR(f.ltp)}</span>
              <span className="ml-2 text-emerald-500">{fmtSigned(f.changePct, 2, "%")}</span>
            </span>
          </div>
        ))
      ) : (
        <p className="py-3 text-[12px] text-slate-400">{view.text}</p>
      )}
    </div>
  );
}
