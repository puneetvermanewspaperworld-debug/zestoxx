"use client";

import React, { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Landmark } from "lucide-react";
import { useIsClient } from "@/lib/useIsClient";
import FlowChart from "@/components/fiidii/FlowChart";
import { fmtCr } from "@/lib/format-cr";
import { fmtIsoDate } from "@/lib/helpers";
import {
  aggregateFlows,
  buildFiiDii,
  type Entity,
  type Interval,
  type Segment,
} from "@/lib/fiidii";

// +₹3,401 Cr / −₹475 Cr — the sign goes before the rupee sign.
const cr = (v: number) => fmtCr(v);

const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;

const tone = (v: number) => (v >= 0 ? "text-emerald-500" : "text-rose-500");

function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; text: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-md border border-slate-200 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={
            "rounded px-2.5 py-1 text-[11.5px] font-medium " +
            (value === o.id ? "bg-blue-600 text-slate-50" : "text-slate-500 hover:text-slate-900")
          }
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

function NetCard({ title, value, sub }: { title: string; value: number; sub: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wide text-slate-400">{title}</div>
      <div className={"mt-0.5 flex items-center gap-1 font-mono text-[16px] font-semibold " + tone(value)}>
        {value >= 0 ? (
          <ArrowUpRight size={16} aria-label="net buying" />
        ) : (
          <ArrowDownRight size={16} aria-label="net selling" />
        )}
        {cr(value)}
      </div>
      <div className="text-[10.5px] text-slate-400">{sub}</div>
    </div>
  );
}

export default function FiiDiiView() {
  const isClient = useIsClient();
  const [entity, setEntity] = useState<Entity>("FII");
  const [segment, setSegment] = useState<Segment>("cash");
  const [period, setPeriod] = useState<Interval>("daily");

  // Dates are "today"-relative, so build only on the client (the page is prerendered).
  const days = useMemo(() => (isClient ? buildFiiDii() : []), [isClient]);
  const rows = useMemo(
    () => aggregateFlows(days, period, entity, segment),
    [days, period, entity, segment]
  );

  if (days.length === 0) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-[170px] animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-[260px] animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    );
  }

  const latest = days[days.length - 1];
  const segLabel = segment === "cash" ? "Cash market" : "Derivatives";
  const longPct = latest.fiiIdxFutLongPct;
  // The chart and the table draw the very same rows, so their date ranges can't disagree.
  const first = rows[0];
  const last = rows[rows.length - 1];
  const dateOf = (r: { key: string; label: string }) => (/^\d{4}-\d{2}-\d{2}$/.test(r.key) ? fmtIsoDate(r.key) : r.label);
  const rangeText = first && last ? `${dateOf(first)} – ${dateOf(last)} · ${rows.length} ${period === "daily" ? "days" : period === "weekly" ? "weeks" : "months"}` : "";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-slate-900">
            <Landmark size={16} className="text-blue-600" /> FII / DII Activity
          </h2>
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Simulated data
          </span>
        </div>
        <p className="mt-1 text-[12px] text-slate-500">
          Foreign and Domestic Institutional Investor net flows (₹ Crore). Live NSE ingestion isn&apos;t
          connected yet, so these figures are illustrative — don&apos;t trade off them.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NetCard
            title={`FII net · ${segLabel}`}
            value={latest.fii[segment].net}
            sub={`as of ${fmtIsoDate(latest.date)}`}
          />
          <NetCard
            title={`DII net · ${segLabel}`}
            value={latest.dii[segment].net}
            sub={`as of ${fmtIsoDate(latest.date)}`}
          />
          <div className="col-span-2">
            <div className="flex items-baseline justify-between text-[10.5px] uppercase tracking-wide text-slate-400">
              <span>FII index futures</span>
              <span className="normal-case">long vs short</span>
            </div>
            <div
              className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-rose-200"
              role="img"
              aria-label={`FII index futures ${longPct.toFixed(0)} percent long, ${(100 - longPct).toFixed(0)} percent short`}
            >
              <div className="h-full bg-emerald-500" style={{ width: `${longPct}%` }} />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[12px]">
              <span className="text-emerald-600">Long {longPct.toFixed(1)}%</span>
              <span className="text-rose-500">Short {(100 - longPct).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Toggle
              label="Investor type"
              value={entity}
              onChange={setEntity}
              options={[
                { id: "FII", text: "FII" },
                { id: "DII", text: "DII" },
              ]}
            />
            <Toggle
              label="Market segment"
              value={segment}
              onChange={setSegment}
              options={[
                { id: "cash", text: "Cash Market" },
                { id: "derivatives", text: "Derivatives" },
              ]}
            />
          </div>
          <label className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
            Interval
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Interval)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11.5px] text-slate-900 outline-none"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>

        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[12px] text-slate-600">
          <span className="font-medium text-slate-800">
            {entity} net · {segLabel}
          </span>
          <span className="tabular-nums">{rangeText}</span>
        </div>
        <FlowChart rows={rows} title={`${entity} net ${segLabel}`} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="max-h-[60vh] overflow-y-auto md:max-h-[420px] md:overflow-auto">
          <p className="border-b border-slate-100 px-3 py-2 text-[12px] text-slate-600 tabular-nums">{rangeText}</p>
          <table className="no-sticky-col w-full border-collapse text-[12px] md:min-w-[420px]">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-2.5 py-2 text-left font-medium md:px-3">Date</th>
                <th className="px-2.5 py-2 text-right font-medium md:px-3">Nifty</th>
                <th className="whitespace-nowrap px-2.5 py-2 text-right font-medium md:px-3">Net amount</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.key} className="border-b border-blue-50 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-2.5 py-2 font-medium text-slate-900 md:px-3">{r.label}</td>
                  <td className={"whitespace-nowrap px-2.5 py-2 text-right font-mono md:px-3 " + tone(r.niftyChgPct)}>
                    {pct(r.niftyChgPct)}
                  </td>
                  <td className={"whitespace-nowrap px-2.5 py-2 text-right font-mono font-medium md:px-3 " + tone(r.net)}>{cr(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
