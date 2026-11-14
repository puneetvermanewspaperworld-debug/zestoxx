"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CoverageChip, FundsFooter } from "@/components/FundsNotes";
import { MF_EMPTY } from "@/lib/mf/disclaimer";
import { PERIODS } from "@/lib/mf/returns";
import { MAX_AMOUNT, MIN_AMOUNT, amountFromSlider, calculate, clampAmount, sliderFromAmount } from "@/lib/mf/sip";
import type { SchemeDetail } from "@/lib/mf/overview";
import { fmtINR, fmtIsoDate } from "@/lib/helpers";

type Loaded = { state: "loading" } | { state: "none"; notFound: boolean } | { state: "ok"; d: SchemeDetail };

const pct = (v: number | null) => (v === null ? "--" : `${v < 0 ? "−" : v > 0 ? "+" : ""}${Math.abs(v).toFixed(2)}%`);
const tone = (v: number | null) => (v === null || v === 0 ? "text-slate-400" : v > 0 ? "text-emerald-600" : "text-rose-500");

const RANGES = [
  { id: "1y", label: "1Y", days: 366 },
  { id: "3y", label: "3Y", days: 3 * 366 },
  { id: "5y", label: "5Y", days: 5 * 366 },
  { id: "all", label: "All", days: Infinity },
] as const;

function NavChart({ series }: { series: { date: string; nav: number }[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("1y");
  const pts = useMemo(() => {
    if (series.length === 0) return [];
    const last = Date.parse(`${series[series.length - 1].date}T00:00:00Z`);
    const days = RANGES.find((r) => r.id === range)!.days;
    return series.filter((p) => last - Date.parse(`${p.date}T00:00:00Z`) <= days * 86_400_000);
  }, [series, range]);
  if (pts.length < 2) return <p className="py-10 text-center text-[12.5px] text-slate-400">Not enough stored NAVs to draw a chart yet.</p>;
  const W = 320;
  const H = 130;
  const lo = Math.min(...pts.map((p) => p.nav));
  const hi = Math.max(...pts.map((p) => p.nav));
  const span = hi - lo || 1;
  const t0 = Date.parse(`${pts[0].date}T00:00:00Z`);
  const t1 = Date.parse(`${pts[pts.length - 1].date}T00:00:00Z`);
  const x = (d: string) => 4 + ((Date.parse(`${d}T00:00:00Z`) - t0) / Math.max(1, t1 - t0)) * (W - 8);
  const y = (v: number) => H - 6 - ((v - lo) / span) * (H - 12);
  const line = pts.map((p) => `${x(p.date).toFixed(1)},${y(p.nav).toFixed(1)}`).join(" ");
  const up = pts[pts.length - 1].nav >= pts[0].nav;
  const stroke = up ? "#10b981" : "#f43f5e";
  return (
    <div>
      <div role="group" aria-label="Chart range" className="mb-2 flex gap-1">
        {RANGES.map((r) => (
          <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)} className={"min-h-[36px] rounded px-3 py-1 text-[12px] font-medium " + (range === r.id ? "bg-blue-600 text-slate-50" : "border border-slate-200 text-slate-600")}>
            {r.label}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-full" role="img" aria-label={`NAV from ${fmtIsoDate(pts[0].date)} to ${fmtIsoDate(pts[pts.length - 1].date)}`} data-testid="nav-chart">
        <polygon points={`${x(pts[0].date)},${H - 6} ${line} ${x(pts[pts.length - 1].date)},${H - 6}`} fill={stroke} opacity="0.1" />
        <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-slate-400">
        <span>{fmtIsoDate(pts[0].date)} · {fmtINR(pts[0].nav)}</span>
        <span>{fmtIsoDate(pts[pts.length - 1].date)} · {fmtINR(pts[pts.length - 1].nav)}</span>
      </div>
    </div>
  );
}

function Calculator({ pastReturn }: { pastReturn: number | null }) {
  const [mode, setMode] = useState<"sip" | "lump">("sip");
  const [amountText, setAmountText] = useState("5000");
  const [years, setYears] = useState("5");
  const [rateText, setRateText] = useState<string | null>(null);
  const rate = rateText ?? (pastReturn !== null ? pastReturn.toFixed(1) : "10");
  const amount = clampAmount(Number(amountText));
  const r = calculate({ mode, amount, years: Number(years), yearlyReturnPct: Number(rate) });
  return (
    <div data-testid="mf-calc" className="space-y-3">
      <div role="group" aria-label="Calculator mode" className="flex gap-1 rounded-md border border-slate-200 p-0.5">
        {(["sip", "lump"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={"min-h-[40px] flex-1 rounded px-3 py-1.5 text-[12.5px] font-medium " + (mode === m ? "bg-blue-600 text-slate-50" : "text-slate-600")}>
            {m === "sip" ? "Monthly SIP" : "One time"}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="mf-amount" className="text-[11.5px] font-medium text-slate-600">
          {mode === "sip" ? "Amount per month" : "Amount"} (₹100 to ₹10,00,000)
        </label>
        <input
          id="mf-amount"
          type="number"
          inputMode="numeric"
          min={MIN_AMOUNT}
          max={MAX_AMOUNT}
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          className="mt-0.5 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-2 font-mono text-[13px] text-slate-900 outline-none focus:border-blue-400"
        />
        <input
          aria-label="Amount slider"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={sliderFromAmount(amount)}
          onChange={(e) => setAmountText(String(amountFromSlider(Number(e.target.value))))}
          className="mt-2 h-8 w-full"
        />
        <div className="flex justify-between font-mono text-[10.5px] text-slate-400">
          <span>₹100</span>
          <span>₹10,00,000</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="mf-years" className="text-[11.5px] font-medium text-slate-600">Years</label>
          <input id="mf-years" type="number" min={1} max={40} value={years} onChange={(e) => setYears(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-2 font-mono text-[13px] outline-none focus:border-blue-400" />
        </div>
        <div>
          <label htmlFor="mf-rate" className="text-[11.5px] font-medium text-slate-600">Assumed return a year (%)</label>
          <input id="mf-rate" type="number" step="0.1" value={rate} onChange={(e) => setRateText(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-2 font-mono text-[13px] outline-none focus:border-blue-400" />
        </div>
      </div>
      <p className="text-[10.5px] text-slate-400">
        {rateText !== null ? "Your own figure." : pastReturn !== null ? "Filled with this fund's past 3-year return, which may not repeat." : "An illustrative figure, not a forecast."}
      </p>
      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-[12px]" data-testid="mf-calc-result">
        <div>
          <dt className="text-[10.5px] text-slate-400">Invested</dt>
          <dd className="font-mono text-slate-900">{fmtINR(Math.round(r.invested))}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] text-slate-400">Estimated value</dt>
          <dd className="font-mono text-slate-900">{fmtINR(Math.round(r.futureValue))}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] text-slate-400">Estimated gain</dt>
          <dd className={"font-mono " + tone(r.gain)}>{fmtINR(Math.round(r.gain))}</dd>
        </div>
      </dl>
      <p className="text-[10.5px] text-slate-400">An illustration from the figures above, not a forecast or an offer. A SIP pays at the start of each month.</p>
    </div>
  );
}

export default function FundSchemeView({ code }: { code: string }) {
  const [data, setData] = useState<Loaded>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mf/scheme/${encodeURIComponent(code)}`)
      .then(async (r) => (r.ok ? { ...(await r.json()) } : { status: r.status === 404 ? "notfound" : "unavailable" }))
      .catch(() => ({ status: "unavailable" }))
      .then((j) => {
        if (cancelled) return;
        setData(j.status === "ok" ? { state: "ok", d: j as SchemeDetail } : { state: "none", notFound: j.status === "notfound" });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="space-y-3">
      <Link href="/app/funds" className="inline-flex min-h-[44px] items-center gap-1 text-[12px] font-medium text-blue-600 hover:underline">
        <ArrowLeft size={13} /> Mutual Funds
      </Link>
      {data.state === "loading" ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" aria-busy="true" />
      ) : data.state === "none" ? (
        <div data-testid="mf-empty" className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-[13px] text-slate-500">
          {data.notFound ? "This fund is not in the stored list." : MF_EMPTY}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 data-testid="mf-name" className="break-words font-display text-[15px] font-semibold text-slate-900">{data.d.scheme.name}</h2>
            <p className="text-[12px] text-slate-400">{data.d.scheme.amc} · {data.d.scheme.category}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[22px] font-semibold text-slate-900">{fmtINR(data.d.scheme.nav)}</span>
              <span className="text-[11.5px] text-slate-400">NAV on {fmtIsoDate(data.d.scheme.navDate)}</span>
            </div>
            <div className="mt-2">
              <CoverageChip />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-display text-[13px] font-semibold text-slate-900">NAV</h3>
            <NavChart series={data.d.series} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-display text-[13px] font-semibold text-slate-900">Returns</h3>
            <p className="mb-2 text-[11px] text-slate-400">Past returns to the latest NAV. 3 and 5 years are per year (annualised). -- means not enough history.</p>
            <table data-testid="mf-returns" className="w-full text-[12.5px]">
              <tbody>
                {PERIODS.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <th scope="row" className="py-2 text-left font-normal text-slate-500">{p.label}{p.annualised ? " (a year)" : ""}</th>
                    <td className={"py-2 text-right font-mono " + tone(data.d.returns[p.id])}>{pct(data.d.returns[p.id])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-display text-[13px] font-semibold text-slate-900">SIP and lump-sum calculator</h3>
            <Calculator pastReturn={data.d.returns["3y"]} />
          </div>
        </>
      )}
      <FundsFooter />
    </div>
  );
}
