"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Landmark } from "lucide-react";
import FlowChart from "@/components/fiidii/FlowChart";
import { fmtCr } from "@/lib/format-cr";
import { fmtIsoDate } from "@/lib/helpers";
import { NIFTY_NOTE, fmtNiftyPct, niftyChanges, type IndexClose } from "@/lib/fiidii/nifty";
import { HISTORY_TARGET, cashDayCount, flowRows, futuresRows, latestCash, latestFutures, longPct } from "@/lib/fiidii/rollup";
import type { Entity, FiiDiiDayRow, Interval } from "@/lib/fiidii/types";

/**
 * FII / DII activity from real NSE data, stored once a day by the ingest job (see lib/fiidii/ingest.ts). Nothing on this page is
 * generated: a day with no figures shows "Data not available", and with no data at all the page says "Data not available yet".
 */

// +₹3,401 Cr / −₹475 Cr — the sign goes before the rupee sign.
const cr = (v: number) => fmtCr(v);
const tone = (v: number) => (v >= 0 ? "text-emerald-500" : "text-rose-500");
const niftyTone = (v: number | null) => (v === null || Math.abs(v) < 0.005 ? "text-slate-400" : v > 0 ? "text-emerald-600" : "text-rose-500");
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const contracts = (n: number) => n.toLocaleString("en-IN");

function Toggle<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; text: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-md border border-slate-200 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={"rounded px-2.5 py-1 text-[11.5px] font-medium " + (value === o.id ? "bg-blue-600 text-slate-50" : "text-slate-500 hover:text-slate-900")}
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
        {value >= 0 ? <ArrowUpRight size={16} aria-label="net buying" /> : <ArrowDownRight size={16} aria-label="net selling" />}
        {cr(value)}
      </div>
      <div className="text-[10.5px] text-slate-400">{sub}</div>
    </div>
  );
}

/** Long (green) against short (red) as one bar. */
function LongShortBar({ long, short, label }: { long: number; short: number; label: string }) {
  const lp = longPct(long, short) ?? 0;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-rose-200" role="img" aria-label={`${label}: ${lp.toFixed(0)} percent long, ${(100 - lp).toFixed(0)} percent short`}>
        <div className="h-full bg-emerald-500" style={{ width: `${lp}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[12px]">
        <span className="text-emerald-600">Long {lp.toFixed(1)}%</span>
        <span className="text-rose-500">Short {(100 - lp).toFixed(1)}%</span>
      </div>
    </div>
  );
}

type Loaded = { state: "loading" } | { state: "done"; rows: FiiDiiDayRow[]; nifty: IndexClose[] };

export default function FiiDiiView() {
  const [data, setData] = useState<Loaded>({ state: "loading" });
  const [entity, setEntity] = useState<Entity>("FII");
  const [period, setPeriod] = useState<Interval>("daily");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fiidii")
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .catch(() => ({ rows: [] }))
      .then((j: { rows?: FiiDiiDayRow[]; nifty?: IndexClose[] }) => {
        if (!cancelled) setData({ state: "done", rows: Array.isArray(j.rows) ? j.rows : [], nifty: Array.isArray(j.nifty) ? j.nifty : [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const days = useMemo(() => (data.state === "done" ? data.rows : []), [data]);
  const rows = useMemo(() => flowRows(days, period, entity), [days, period, entity]);
  const fut = useMemo(() => futuresRows(days, period), [days, period]);
  // Nifty % only for daily rows: each FII/DII day against the previous trading day, from stored closes; null (shown "--") where a close is not stored.
  const showNifty = period === "daily";
  const nifty = useMemo(() => (data.state === "done" && showNifty ? niftyChanges(rows.map((r) => r.key), data.nifty) : new Map<string, number | null>()), [data, rows, showNifty]);

  if (data.state === "loading") {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-[170px] animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-[260px] animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    );
  }

  const cash = latestCash(days);
  const futLatest = latestFutures(days);

  // Nothing real stored yet: say so. No banner, no sample numbers.
  if (!cash && !futLatest) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-slate-900">
          <Landmark size={16} className="text-blue-600" /> FII / DII Activity
        </h2>
        <p data-testid="no-data" className="mt-3 text-[15px] font-medium text-slate-800">Data not available yet</p>
        <p className="mt-1 text-[12px] text-slate-600">
          Real NSE figures are stored once a day after the market closes (cash flows around 5 pm IST, futures positions around 7 pm IST). None have been stored yet,
          and nothing is shown in their place.
        </p>
      </div>
    );
  }

  const nCash = cashDayCount(days);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const dateOf = (r: { key: string; label: string }) => (/^\d{4}-\d{2}-\d{2}$/.test(r.key) ? fmtIsoDate(r.key) : r.label);
  const unit = period === "daily" ? "day" : period === "weekly" ? "week" : "month";
  const gaps = rows.filter((r) => r.missing).length;
  const rangeText = first && last ? `${dateOf(first)} – ${dateOf(last)} · ${plural(rows.length, unit)}${gaps ? ` (${gaps} with no data)` : ""}` : "";
  const anyProvisional = rows.some((r) => r.provisional);
  const futShown = [...fut].reverse().slice(0, 12);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-slate-900">
            <Landmark size={16} className="text-blue-600" /> FII / DII Activity
          </h2>
          {cash && (
            <span data-testid="data-date" className="flex items-center gap-1.5 text-[12px] text-slate-700">
              Data for <b className="font-semibold">{fmtIsoDate(cash.date)}</b>
              {cash.provisional && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">provisional</span>}
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] text-slate-500">
          Foreign (FII/FPI) and domestic (DII) institutional investors, ₹ crore, from NSE. Cash figures are NSE&apos;s provisional ones, published around 5 pm IST; futures
          positions come from NSE&apos;s open interest file, published around 7 pm IST.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {cash && cash.cash ? (
            <>
              <NetCard title="FII net · cash market" value={cash.cash.fii.net} sub={`${cash.provisional ? "provisional · " : ""}${fmtIsoDate(cash.date)}`} />
              <NetCard title="DII net · cash market" value={cash.cash.dii.net} sub={`${cash.provisional ? "provisional · " : ""}${fmtIsoDate(cash.date)}`} />
            </>
          ) : (
            <p className="col-span-2 text-[12px] text-slate-600">Cash figures: Data not available yet.</p>
          )}
          <div className="col-span-2">
            <div className="flex items-baseline justify-between text-[10.5px] uppercase tracking-wide text-slate-400">
              <span>FII index futures</span>
              <span className="normal-case">long vs short{futLatest ? ` · ${fmtIsoDate(futLatest.date)}` : ""}</span>
            </div>
            {futLatest && futLatest.idxFut ? (
              <div className="mt-1.5">
                <LongShortBar long={futLatest.idxFut.long} short={futLatest.idxFut.short} label="FII index futures" />
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {contracts(futLatest.idxFut.long)} long · {contracts(futLatest.idxFut.short)} short contracts
                </div>
              </div>
            ) : (
              <p className="mt-1.5 text-[12px] text-slate-600">Data not available yet.</p>
            )}
          </div>
        </div>
      </div>

      {nCash < HISTORY_TARGET && (
        <p role="note" data-testid="history-building" className="rounded-lg border-l-2 border-sky-400 bg-sky-50 px-3 py-2 text-[12px] leading-snug text-slate-700">
          <b>History is building.</b> {plural(nCash, "day")} of cash figures {nCash === 1 ? "is" : "are"} stored so far. NSE&apos;s cash source returns only the latest day, so earlier
          days cannot be filled in; each new day is added after the close. Missing days are shown as missing, never as zero.
        </p>
      )}

      {cash ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Toggle
              label="Investor type"
              value={entity}
              onChange={setEntity}
              options={[
                { id: "FII", text: "FII" },
                { id: "DII", text: "DII" },
              ]}
            />
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
            <span className="font-medium text-slate-800">{entity} net · cash market</span>
            <span className="tabular-nums">{rangeText}</span>
          </div>
          <FlowChart rows={rows} title={`${entity} net cash market`} />
        </div>
      ) : null}

      {cash ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="max-h-[60vh] overflow-y-auto md:max-h-[420px] md:overflow-auto">
            <p className="border-b border-slate-100 px-3 py-2 text-[12px] text-slate-600 tabular-nums">
              {rangeText}
              {anyProvisional && " · provisional NSE figures"}
            </p>
            <table className="no-sticky-col w-full border-collapse text-[12px] md:min-w-[520px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-2.5 py-2 text-left font-medium md:px-3">{period === "daily" ? "Date" : period === "weekly" ? "Week of" : "Month"}</th>
                  <th className="hidden px-2.5 py-2 text-right font-medium md:table-cell md:px-3">Buy</th>
                  <th className="hidden px-2.5 py-2 text-right font-medium md:table-cell md:px-3">Sell</th>
                  <th className="whitespace-nowrap px-2.5 py-2 text-right font-medium md:px-3">Net amount</th>
                  {showNifty && <th className="whitespace-nowrap px-2.5 py-2 text-right font-medium md:px-3">Nifty %</th>}
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.key} className="border-b border-blue-50 hover:bg-slate-50" data-missing={r.missing ? "true" : undefined}>
                    <td className="px-2.5 py-2 font-medium text-slate-900 md:px-3">
                      <div className="whitespace-nowrap">{r.label}</div>
                      {r.partial && !r.missing && (
                        <div className="text-[12px] font-normal text-amber-700">
                          {r.days} of {r.expected} trading days
                        </div>
                      )}
                      {!r.missing && (
                        <div className="text-[12px] font-normal text-slate-500 md:hidden">
                          Buy {cr(r.buy).replace(/^\+/, "")} · Sell {cr(r.sell).replace(/^\+/, "")}
                        </div>
                      )}
                    </td>
                    {r.missing ? (
                      <>
                        {/* on a phone only the Net column shows (Buy and Sell are hidden), so one cell; from md up it spans Buy, Sell and Net */}
                        <td className="px-2.5 py-2 text-right text-slate-500 md:hidden">Data not available</td>
                        <td colSpan={3} className="hidden px-3 py-2 text-right text-slate-500 md:table-cell">
                          Data not available
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="hidden whitespace-nowrap px-2.5 py-2 text-right font-mono md:table-cell md:px-3">{cr(r.buy).replace(/^\+/, "")}</td>
                        <td className="hidden whitespace-nowrap px-2.5 py-2 text-right font-mono md:table-cell md:px-3">{cr(r.sell).replace(/^\+/, "")}</td>
                        <td className={"whitespace-nowrap px-2.5 py-2 text-right font-mono font-medium md:px-3 " + tone(r.net)}>{cr(r.net)}</td>
                      </>
                    )}
                    {showNifty && (
                      <td data-testid="nifty-pct" className={"whitespace-nowrap px-2.5 py-2 text-right font-mono md:px-3 " + niftyTone(nifty.get(r.key) ?? null)}>
                        {fmtNiftyPct(nifty.get(r.key) ?? null)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showNifty && <p data-testid="nifty-note" className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">{NIFTY_NOTE}</p>}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-display text-[14px] font-semibold text-slate-900">FII index futures: long % against short %</h3>
        <p className="mt-0.5 text-[12px] text-slate-500">
          Open contracts at the end of each {unit === "day" ? "day" : unit} (a position, not a flow, so a {unit === "day" ? "day" : unit} shows its last day).
        </p>
        {futShown.length === 0 ? (
          <p className="mt-2 text-[12px] text-slate-600">Data not available yet.</p>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {futShown.map((f) => (
              <li key={f.key}>
                <div className="mb-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[12px] text-slate-600">
                  <span className="font-medium text-slate-800">{period === "daily" ? fmtIsoDate(f.date) : `${f.label} · position on ${fmtIsoDate(f.date)}`}</span>
                  <span className="tabular-nums">
                    {contracts(f.long)} long · {contracts(f.short)} short
                  </span>
                </div>
                <LongShortBar long={f.long} short={f.short} label={`FII index futures ${f.label}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
