"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import DataBadge from "@/components/DataBadge";
import { useMovers } from "@/lib/useMovers";
import { useMarketStatus } from "@/lib/useMarketStatus";
import { moversNote } from "@/lib/closed-notes";
import { SYMBOL_MAP } from "@/lib/symbols";
import { fmtCr } from "@/lib/format-cr";
import { fmtINR, fmtIsoDate, fmtSigned } from "@/lib/helpers";
import { FII_DII_EMPTY, NO_GAINERS, NO_LOSERS, equityMoversCard, fiiDiiSummary, futuresGainers } from "@/lib/dashboard-cards";
import type { FiiDiiDayRow } from "@/lib/fiidii/types";
import type { FutureMovers, StockMover, StockMovers } from "@/lib/movers";

const tone = (v: number) => (v >= 0 ? "text-emerald-500" : "text-rose-500");

/** One mover row: the stock (a link to its chart when the terminal charts it), its price and its day change. */
function MoverRow({ m }: { m: StockMover }) {
  const up = m.changePct > 0;
  return (
    <div data-testid="mover-row" className="flex items-center justify-between gap-2 py-1 text-[12px]">
      <span className="min-w-0 truncate">
        {SYMBOL_MAP[m.symbol] ? (
          <Link href={`/app/trade/${m.symbol}`} className="font-medium text-blue-600 hover:underline">
            {m.symbol}
          </Link>
        ) : (
          <span className="font-medium text-slate-900">{m.symbol}</span>
        )}
      </span>
      <span className="shrink-0 text-right font-mono">
        <span className="text-slate-500">{fmtINR(m.ltp)}</span>
        <span className={"ml-2 " + (up ? "text-emerald-500" : "text-rose-500")}>{fmtSigned(m.changePct, 2, "%")}</span>
      </span>
    </div>
  );
}

/**
 * Market Movers: the top three gainers and losers among all NSE stocks, from the same feed as the Movers page, with the same
 * "Live data" / "Last close" badge and, once the market is shut, the same "Market closed, last close shown" note.
 */
export function MarketMoversCard() {
  const { res, loading } = useMovers<StockMovers>("view=equity");
  const open = useMarketStatus()?.open ?? null;
  const view = equityMoversCard(loading ? null : res);
  const note = view.kind === "ok" ? moversNote(open, [...view.gainers, ...view.losers]) : null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="market-movers-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-1.5 font-display text-[13px] font-semibold text-slate-900">
          Market Movers
          {view.kind === "ok" && <DataBadge source="live" />}
        </h3>
        <Link href="/app/movers" className="shrink-0 text-[11.5px] font-medium text-blue-600 hover:underline">
          More →
        </Link>
      </div>
      {view.kind === "loading" ? (
        <div className="h-[150px] animate-pulse rounded bg-slate-50" aria-busy="true" />
      ) : view.kind === "unavailable" ? (
        <p data-testid="movers-unavailable" className="py-3 text-[12px] text-slate-400">
          {view.text}
        </p>
      ) : (
        <>
          {note && (
            <p data-testid="movers-note" className="mb-1 text-[11px] text-slate-500">
              {note}
            </p>
          )}
          <div className="mb-1 text-[10.5px] uppercase tracking-wide text-emerald-500">Top Gainers</div>
          {view.gainers.length === 0 ? <p className="py-1 text-[12px] text-slate-400">{NO_GAINERS}</p> : view.gainers.map((m) => <MoverRow key={m.symbol} m={m} />)}
          <div className="mb-1 mt-3 text-[10.5px] uppercase tracking-wide text-rose-500">Top Losers</div>
          {view.losers.length === 0 ? <p className="py-1 text-[12px] text-slate-400">{NO_LOSERS}</p> : view.losers.map((m) => <MoverRow key={m.symbol} m={m} />)}
        </>
      )}
    </div>
  );
}

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

/** FII/DII: the latest stored day's net buying or selling, from the stored NSE figures. */
export function FiiDiiSummaryCard() {
  const [rows, setRows] = useState<FiiDiiDayRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/fiidii")
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .catch(() => ({ rows: [] }))
      .then((j) => !cancelled && setRows(Array.isArray(j.rows) ? j.rows : []));
    return () => {
      cancelled = true;
    };
  }, []);
  const s = fiiDiiSummary(rows);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="fii-dii-card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-[13px] font-semibold text-slate-900">FII / DII</h3>
        <Link href="/app/fiidii" className="text-[11.5px] font-medium text-blue-600 hover:underline">
          Details →
        </Link>
      </div>
      {rows === null ? (
        <div className="h-[72px] animate-pulse rounded bg-slate-50" aria-busy="true" />
      ) : s ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["FII net", s.cash.fii.net],
                ["DII net", s.cash.dii.net],
              ] as const
            ).map(([label, v]) => (
              <div key={label}>
                <div className="text-[10.5px] uppercase tracking-wide text-slate-400">{label}</div>
                <div className={"mt-0.5 font-mono text-[15px] font-semibold " + tone(v)}>{fmtCr(v)}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] text-slate-400">
            Cash market, {fmtIsoDate(s.date)}
            {s.provisional ? " · provisional" : ""} · NSE
          </p>
        </>
      ) : (
        <p className="py-3 text-[12px] text-slate-400">{FII_DII_EMPTY}</p>
      )}
    </div>
  );
}
