"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Flame } from "lucide-react";
import { fmtINR, fmtIsoDate, fmtOi } from "@/lib/helpers";
import { SYMBOL_MAP } from "@/lib/symbols";
import { useMovers } from "@/lib/useMovers";
import {
  EQUITY_FILTER,
  contractLabel,
  titleCase,
  type FutureMover,
  type FutureMovers,
  type OptionContract,
  type OptionKind,
  type OptionMovers,
  type StockMover,
  type StockMovers,
} from "@/lib/movers";

/* ------------------------------------------------------------ small parts ---- */

interface TabOption<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
  note?: string;
}

function Tabs<T extends string>({
  label,
  value,
  options,
  onChange,
  small,
}: {
  label: string;
  value: T;
  options: TabOption<T>[];
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 rounded-md border border-slate-200 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          type="button"
          aria-selected={value === o.id}
          aria-disabled={o.disabled || undefined}
          disabled={o.disabled}
          title={o.disabled ? o.note : undefined}
          onClick={() => onChange(o.id)}
          className={
            (small ? "px-2.5 py-1 text-[11.5px] " : "px-3 py-1.5 text-[12.5px] ") +
            "flex items-center gap-1.5 rounded font-medium " +
            (value === o.id
              ? "bg-blue-600 text-slate-50"
              : o.disabled
                ? "cursor-not-allowed text-slate-300"
                : "text-slate-500 hover:text-slate-900")
          }
        >
          {o.label}
          {o.disabled && (
            <span className="rounded bg-slate-100 px-1 text-[9px] font-semibold uppercase text-slate-400">Soon</span>
          )}
        </button>
      ))}
    </div>
  );
}

const tone = (v: number) => (v > 0 ? "text-emerald-500" : v < 0 ? "text-rose-500" : "text-slate-400");
const signed = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;
const rupees = (v: number) => `₹${fmtOi(v)}`;

function Th({ children, right = true, hide }: { children: React.ReactNode; right?: boolean; hide?: boolean }) {
  return (
    <th className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"} ${hide ? "hidden sm:table-cell" : ""}`}>
      {children}
    </th>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-14 text-center text-[12.5px] text-slate-400">{children}</div>;
}

function Skeleton() {
  return (
    <div className="space-y-2 p-4" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />
      ))}
    </div>
  );
}

const NO_TRADES = "No trades yet today — these lists fill in once the market opens.";

/* ----------------------------------------------------------------- tables ---- */

function StockTable({ rows, showLot }: { rows: StockMover[]; showLot?: boolean }) {
  if (rows.length === 0) return <Empty>{NO_TRADES}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse sm:min-w-[520px] text-[12.5px]">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <Th right={false}>Symbol</Th>
            <Th>LTP</Th>
            <Th hide>Chg</Th>
            <Th>Chg %</Th>
            <Th hide>Volume</Th>
            <Th hide>Value</Th>
            {showLot && <Th hide>Lot</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} className="border-b border-blue-50 hover:bg-slate-50">
              <td className="px-3 py-2.5">
                {SYMBOL_MAP[r.symbol] ? (
                  <Link href={`/app/trade/${r.symbol}`} className="font-medium text-blue-600 hover:underline">
                    {r.symbol}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-900">{r.symbol}</span>
                )}
                <div className="max-w-[220px] truncate text-[10.5px] text-slate-400">{titleCase(r.name)}</div>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-900">{fmtINR(r.ltp)}</td>
              <td className={"hidden px-3 py-2.5 text-right font-mono sm:table-cell " + tone(r.change)}>{signed(r.change)}</td>
              <td className={"px-3 py-2.5 text-right font-mono " + tone(r.changePct)}>{signed(r.changePct)}%</td>
              <td className="hidden px-3 py-2.5 text-right font-mono text-slate-500 sm:table-cell">{fmtOi(r.volume)}</td>
              <td className="hidden px-3 py-2.5 text-right font-mono text-slate-500 sm:table-cell">{rupees(r.value)}</td>
              {showLot && (
                <td className="hidden px-3 py-2.5 text-right font-mono text-slate-500 sm:table-cell">{r.lot ?? "--"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FutureTable({ rows }: { rows: FutureMover[] }) {
  if (rows.length === 0) return <Empty>{NO_TRADES}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse sm:min-w-[520px] text-[12.5px]">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <Th right={false}>Contract</Th>
            <Th>Price</Th>
            <Th hide>Chg</Th>
            <Th>Chg %</Th>
            <Th hide>Volume</Th>
            <Th hide>Lot</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol + r.expiry} className="border-b border-blue-50 hover:bg-slate-50">
              <td className="px-3 py-2.5">
                <span className="font-medium text-slate-900">{r.symbol}</span>
                {r.isIndex && (
                  <span className="ml-1.5 rounded bg-blue-50 px-1 text-[9px] font-semibold uppercase text-blue-600">Index</span>
                )}
                <div className="text-[10.5px] text-slate-400">FUT · {fmtIsoDate(r.expiry)}</div>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-900">{fmtINR(r.ltp)}</td>
              <td className={"hidden px-3 py-2.5 text-right font-mono sm:table-cell " + tone(r.change)}>{signed(r.change)}</td>
              <td className={"px-3 py-2.5 text-right font-mono " + tone(r.changePct)}>{signed(r.changePct)}%</td>
              <td className="hidden px-3 py-2.5 text-right font-mono text-slate-500 sm:table-cell">{fmtOi(r.volume)}</td>
              <td className="hidden px-3 py-2.5 text-right font-mono text-slate-500 sm:table-cell">{r.lot}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OptionTable({ rows }: { rows: OptionContract[] }) {
  if (rows.length === 0) return <Empty>{NO_TRADES}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse sm:min-w-[560px] text-[12.5px]">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <Th right={false}>Contract</Th>
            <Th>LTP</Th>
            <Th hide>Chg</Th>
            <Th>Chg %</Th>
            <Th hide>Volume</Th>
            <Th hide>Value</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.symbol}${r.expiry}${r.strike}${r.type}`} className="border-b border-blue-50 hover:bg-slate-50">
              <td className="px-3 py-2.5 font-mono text-[12px] font-medium text-slate-900">{contractLabel(r)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-900">{r.ltp.toFixed(2)}</td>
              <td className={"hidden px-3 py-2.5 text-right font-mono sm:table-cell " + tone(r.change)}>{signed(r.change)}</td>
              <td className={"px-3 py-2.5 text-right font-mono " + (r.changePct == null ? "text-slate-300" : tone(r.changePct))}>
                {r.changePct == null ? "--" : `${signed(r.changePct)}%`}
              </td>
              <td className="hidden px-3 py-2.5 text-right font-mono text-slate-500 sm:table-cell">{fmtOi(r.volume)}</td>
              <td className="hidden px-3 py-2.5 text-right font-mono text-slate-500 sm:table-cell">{rupees(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------- view ---- */

type Top = "equity" | "fno" | "mf";
type FnoSub = "equity" | "futures" | "options";
type StockSeg = "gainers" | "losers" | "active";
type FutSeg = "gainers" | "losers";
type Basis = "volume" | "price";
type VolSeg = "volume" | "value";

const STOCK_SEGS: TabOption<StockSeg>[] = [
  { id: "gainers", label: "Top Gainers" },
  { id: "losers", label: "Top Losers" },
  { id: "active", label: "Most Active" },
];

const TOP_SHOWN = 20;

export default function MoversView() {
  const [top, setTop] = useState<Top>("equity");
  const [fnoSub, setFnoSub] = useState<FnoSub>("equity");
  const [stockSeg, setStockSeg] = useState<StockSeg>("gainers");
  const [futSeg, setFutSeg] = useState<FutSeg>("gainers");
  const [optKind, setOptKind] = useState<OptionKind>("OPTIDX");
  const [basis, setBasis] = useState<Basis>("volume");
  const [volSeg, setVolSeg] = useState<VolSeg>("volume");
  const [priceSeg, setPriceSeg] = useState<FutSeg>("gainers");

  const query =
    top === "equity"
      ? "view=equity"
      : fnoSub === "equity"
        ? "view=fno-equity"
        : fnoSub === "futures"
          ? "view=futures"
          : `view=options&kind=${optKind}`;

  const { res, loading } = useMovers<StockMovers | FutureMovers | OptionMovers>(query, { enabled: top !== "mf" });
  const data = res?.source === "live" ? res.data : null;

  const optionRows = useMemo(() => {
    if (!data || !("contracts" in data)) return [];
    const c = data.contracts;
    const sorted =
      basis === "volume"
        ? [...c].sort((a, b) => (volSeg === "volume" ? b.volume - a.volume : b.value - a.value))
        : priceSeg === "gainers"
          ? c.filter((x) => (x.changePct ?? 0) > 0).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
          : c.filter((x) => (x.changePct ?? 0) < 0).sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
    return sorted.slice(0, TOP_SHOWN);
  }, [data, basis, volSeg, priceSeg]);

  const asOf =
    res?.source === "live"
      ? new Date(res.asOf).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })
      : null;

  let body: React.ReactNode;
  let footnote: React.ReactNode = null;

  if (top === "mf") {
    body = <Empty>Mutual fund movers need a fund-data source, which isn&apos;t connected yet.</Empty>;
  } else if (loading) {
    body = <Skeleton />;
  } else if (!data) {
    body = (
      <Empty>
        Live market data is unavailable right now, so there&apos;s nothing honest to rank. Movers use the Upstox
        feed — if this persists, check that <code className="font-mono">UPSTOX_ANALYTICS_TOKEN</code> is set.
      </Empty>
    );
  } else if ("contracts" in data) {
    body = <OptionTable rows={optionRows} />;
    footnote = `Ranked among the ${data.contracts.length} most-traded ${
      optKind === "OPTIDX" ? "index" : "stock"
    } option contracts in the nearest expiry (${data.underlyings.length} underlyings, ${data.scanned.toLocaleString("en-IN")} contracts scanned). Change is vs the previous close.`;
  } else if ("ranked" in data) {
    body = <StockTable rows={data[stockSeg]} showLot={top === "fno"} />;
    footnote =
      top === "equity"
        ? `All NSE stocks priced ≥ ₹${EQUITY_FILTER.minPrice} that have traded ≥ ₹${EQUITY_FILTER.minTurnoverCr} Cr today (${data.ranked.toLocaleString("en-IN")} of ${data.scanned.toLocaleString("en-IN")}). Most Active ranks by traded value.`
        : `The ${data.scanned} F&O-eligible stocks. Most Active ranks by traded value.`;
  } else {
    body = <FutureTable rows={futSeg === "gainers" ? data.gainers : data.losers} />;
    footnote = `Near-month stock and index futures (${data.scanned} scanned). Change is vs the previous close.`;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-slate-900">
              <Flame size={16} className="text-blue-600" /> Market Movers
            </h2>
            <p className="text-[12px] text-slate-400">What&apos;s moving most across equities, futures and options.</p>
          </div>
          {asOf ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live data · {asOf} IST
            </span>
          ) : (
            !loading &&
            top !== "mf" && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500">
                Unavailable
              </span>
            )
          )}
        </div>

        <div className="space-y-2.5 px-4 pt-4">
          <Tabs<Top>
            label="Market"
            value={top}
            onChange={setTop}
            options={[
              { id: "equity", label: "Equity" },
              { id: "fno", label: "F&O" },
              { id: "mf", label: "Mutual Funds", disabled: true, note: "Needs a fund-data source — coming later" },
            ]}
          />

          {top === "equity" && <Tabs label="Ranking" value={stockSeg} onChange={setStockSeg} options={STOCK_SEGS} small />}

          {top === "fno" && (
            <>
              <Tabs<FnoSub>
                label="F&O segment"
                value={fnoSub}
                onChange={setFnoSub}
                small
                options={[
                  { id: "equity", label: "Equity" },
                  { id: "futures", label: "Futures" },
                  { id: "options", label: "Options" },
                ]}
              />
              {fnoSub === "equity" && <Tabs label="Ranking" value={stockSeg} onChange={setStockSeg} options={STOCK_SEGS} small />}
              {fnoSub === "futures" && (
                <Tabs<FutSeg>
                  label="Ranking"
                  value={futSeg}
                  onChange={setFutSeg}
                  small
                  options={[
                    { id: "gainers", label: "Today's Gainers" },
                    { id: "losers", label: "Today's Losers" },
                  ]}
                />
              )}
              {fnoSub === "options" && (
                <div className="flex flex-wrap items-center gap-2">
                  <Tabs<OptionKind>
                    label="Option type"
                    value={optKind}
                    onChange={setOptKind}
                    small
                    options={[
                      { id: "OPTIDX", label: "OPTIDX" },
                      { id: "OPTSTK", label: "OPTSTK" },
                    ]}
                  />
                  <select
                    aria-label="Ranking basis"
                    value={basis}
                    onChange={(e) => setBasis(e.target.value as Basis)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11.5px] text-slate-900 outline-none"
                  >
                    <option value="volume">Volume Based</option>
                    <option value="price">Price Based</option>
                  </select>
                  {basis === "volume" ? (
                    <Tabs<VolSeg>
                      label="Ranking"
                      value={volSeg}
                      onChange={setVolSeg}
                      small
                      options={[
                        { id: "volume", label: "Most Active Volume" },
                        { id: "value", label: "Most Active Value" },
                      ]}
                    />
                  ) : (
                    <Tabs<FutSeg>
                      label="Ranking"
                      value={priceSeg}
                      onChange={setPriceSeg}
                      small
                      options={[
                        { id: "gainers", label: "Top Gainers" },
                        { id: "losers", label: "Top Losers" },
                      ]}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-3 border-t border-slate-100">{body}</div>
        {footnote && <p className="border-t border-slate-100 px-4 py-2.5 text-[10.5px] text-slate-400">{footnote}</p>}
      </div>
    </div>
  );
}
