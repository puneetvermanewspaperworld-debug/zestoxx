"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import OptionsStatsStrip from "@/components/OptionsStatsStrip";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { fmtIsoDate, fmtOiChange } from "@/lib/helpers";
import { useOptionChain } from "@/lib/useOptionChain";
import {
  BUILDUP_META,
  BUILDUP_ORDER,
  buildupBreakdown,
  buildupGrid,
  chainStats,
  type LegBuildup,
} from "@/lib/options";

const INDEXES = [
  { id: "NIFTY", label: "NIFTY" },
  { id: "BANKNIFTY", label: "BANK NIFTY" },
  { id: "FINNIFTY", label: "FINNIFTY" },
  { id: "MIDCPNIFTY", label: "MIDCPNIFTY" },
] as const;

type Basis = "contracts" | "oi";

/** Spot used only to seed the simulation when Upstox isn't answering. */
function fallbackSpot(id: string, live: Record<string, number>): number {
  const nifty = live.NIFTY50 ?? 24000;
  if (id === "NIFTY") return nifty;
  if (id === "BANKNIFTY") return live.BANKNIFTY ?? nifty * 2.1;
  if (id === "FINNIFTY") return nifty * 1.05;
  return nifty * 0.53;
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="buildup-help-title"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 id="buildup-help-title" className="font-display text-[15px] font-semibold text-slate-900">
            How to read Buildups
          </h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:text-slate-900"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mb-3 text-[12.5px] leading-relaxed text-slate-600">
          A buildup compares two things for each option contract against the previous session: the
          direction of its <b>premium</b> and the direction of its <b>open interest</b> (OI — contracts
          still open). Together they say whether money is entering or leaving a position.
        </p>
        <div className="space-y-2">
          {BUILDUP_ORDER.map((k) => (
            <div key={k} className="flex gap-2.5 rounded-lg border border-slate-200 p-2.5">
              <span className={"mt-0.5 h-3 w-3 shrink-0 rounded-sm " + BUILDUP_META[k].swatch} />
              <div>
                <div className="text-[12.5px] font-semibold text-slate-900">
                  {BUILDUP_META[k].label} <span className="font-mono text-slate-400">({BUILDUP_META[k].code})</span>
                </div>
                <div className="text-[12px] text-slate-500">{BUILDUP_META[k].meaning}</div>
              </div>
            </div>
          ))}
        </div>
        <ul className="mt-3 list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-slate-500">
          <li>
            Each <b>call and put is classified separately</b>, on its own premium and OI. A put&apos;s
            &ldquo;long buildup&rdquo; means put <i>buyers</i> are adding — that is bearish for the index, not
            bullish.
          </li>
          <li>
            Only contracts that traded today and have a prior-session reference are counted, so thinly
            traded far strikes don&apos;t distort the picture.
          </li>
          <li>
            <b>By contracts</b> counts each contract equally; <b>By OI change</b> weights each by how many
            contracts of OI it added or shed, so heavy positioning matters more.
          </li>
          <li>This is a read on positioning, not a prediction or advice.</li>
        </ul>
      </div>
    </div>
  );
}

function HeatCell({ b, maxOi }: { b: LegBuildup; maxOi: number }) {
  if (!b.kind) return <td className="px-2 py-1.5 text-center text-slate-300">—</td>;
  const meta = BUILDUP_META[b.kind];
  const alpha = 0.18 + 0.62 * Math.min(1, Math.abs(b.oiChange) / maxOi);
  const chg = `${b.priceChangePct >= 0 ? "+" : "−"}${Math.abs(b.priceChangePct).toFixed(1)}%`;
  return (
    <td
      className="px-2 py-1.5 text-center font-mono text-[11px] text-slate-900"
      style={{ background: `rgba(${meta.rgb.join(",")},${alpha})` }}
      title={`${meta.label}: premium ${chg}, OI ${fmtOiChange(b.oiChange)}`}
    >
      <span className="font-semibold">{meta.code}</span> {fmtOiChange(b.oiChange)}
      <span className="block text-[10px] text-slate-600">{chg}</span>
    </td>
  );
}

export default function BuildupView() {
  const { live } = useZestoxx();
  const [index, setIndex] = useState<(typeof INDEXES)[number]["id"]>("NIFTY");
  const [expiryFor, setExpiryFor] = useState<Record<string, string>>({});
  const [basis, setBasis] = useState<Basis>("contracts");
  const [helpOpen, setHelpOpen] = useState(false);

  const { chain } = useOptionChain(index, expiryFor[index] ?? null, fallbackSpot(index, live));

  const breakdown = useMemo(() => (chain ? buildupBreakdown(chain.rows) : null), [chain]);
  const grid = useMemo(() => {
    if (!chain) return [];
    const atm = chainStats(chain.rows, chain.spot)?.atmStrike;
    return atm == null ? [] : buildupGrid(chain.rows, atm, 8);
  }, [chain]);
  const maxOi = Math.max(
    1,
    ...grid.flatMap((g) => [Math.abs(g.call.oiChange), Math.abs(g.put.oiChange)])
  );

  const shares = breakdown ? (basis === "contracts" ? breakdown.byContracts : breakdown.byOiChange) : null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-slate-900">
              Long / Short Buildup
            </h2>
            <p className="flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
              <span>Where option positioning is being added or unwound.</span>
              {chain && (
                <span
                  className={
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold " +
                    (chain.source === "live" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")
                  }
                >
                  <span
                    className={
                      "h-1.5 w-1.5 rounded-full " + (chain.source === "live" ? "bg-emerald-500" : "bg-slate-400")
                    }
                  />
                  {chain.source === "live" ? "Live data" : "Simulated"}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="flex items-center gap-1 text-[11.5px] font-medium text-blue-600 hover:underline"
          >
            <CircleHelp size={13} /> How to read Buildups
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-0">
          <div role="tablist" aria-label="Index" className="flex flex-wrap gap-1 rounded-md border border-slate-200 p-0.5">
            {INDEXES.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={index === t.id}
                onClick={() => setIndex(t.id)}
                className={
                  "rounded px-2.5 py-1 text-[11.5px] font-medium " +
                  (index === t.id ? "bg-blue-600 text-slate-50" : "text-slate-500 hover:text-slate-900")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          {chain && (
            <select
              aria-label="Expiry"
              value={chain.expiry}
              onChange={(e) => setExpiryFor((m) => ({ ...m, [index]: e.target.value }))}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11.5px] text-slate-900 outline-none"
            >
              {chain.expiries.map((e) => (
                <option key={e} value={e}>
                  {fmtIsoDate(e)}
                </option>
              ))}
            </select>
          )}
        </div>

        {!chain || !breakdown || !shares ? (
          <div className="m-4 h-[320px] animate-pulse rounded-lg bg-slate-50" aria-busy="true" />
        ) : (
          <div className="space-y-4 p-4">
            <OptionsStatsStrip chain={chain} />

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[12px] text-slate-500">
                  {breakdown.totalContracts > 0
                    ? `${breakdown.totalContracts} liquid contracts (calls + puts) · expiry ${fmtIsoDate(chain.expiry)}`
                    : "No liquid contracts to classify yet"}
                </div>
                <div role="group" aria-label="Weighting" className="flex gap-1 rounded-md border border-slate-200 p-0.5">
                  {(
                    [
                      ["contracts", "By contracts"],
                      ["oi", "By OI change"],
                    ] as const
                  ).map(([id, text]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={basis === id}
                      onClick={() => setBasis(id)}
                      className={
                        "rounded px-2.5 py-1 text-[11px] font-medium " +
                        (basis === id ? "bg-blue-600 text-slate-50" : "text-slate-500 hover:text-slate-900")
                      }
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              {breakdown.totalContracts > 0 ? (
                <>
                  <div
                    className="flex h-8 w-full overflow-hidden rounded-md bg-slate-100"
                    role="img"
                    aria-label={BUILDUP_ORDER.map(
                      (k) => `${BUILDUP_META[k].label} ${shares[k].toFixed(0)} percent`
                    ).join(", ")}
                  >
                    {BUILDUP_ORDER.map((k) =>
                      shares[k] > 0 ? (
                        <div
                          key={k}
                          className={"flex items-center justify-center text-[10.5px] font-semibold text-slate-900 " + BUILDUP_META[k].swatch}
                          style={{ width: `${shares[k]}%` }}
                          title={`${BUILDUP_META[k].label}: ${shares[k].toFixed(1)}%`}
                        >
                          {shares[k] >= 9 ? `${shares[k].toFixed(0)}%` : ""}
                        </div>
                      ) : null
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {BUILDUP_ORDER.map((k) => (
                      <div key={k} className="flex items-center gap-2 text-[11.5px]">
                        <span className={"h-3 w-3 shrink-0 rounded-sm " + BUILDUP_META[k].swatch} />
                        <span className="text-slate-600">{BUILDUP_META[k].label}</span>
                        <span className="ml-auto font-mono font-semibold text-slate-900">
                          {shares[k].toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-[12.5px] text-slate-400">
                  Buildups compare today&apos;s premium and OI with the previous session, so they appear once
                  contracts start trading.
                </div>
              )}
            </div>

            {grid.length > 0 && (
              <div>
                <h3 className="mb-1.5 font-display text-[12.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Strike heatmap
                </h3>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[420px] border-collapse text-[11.5px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="px-2 py-1.5 text-center font-medium">Call (CE)</th>
                        <th className="px-2 py-1.5 text-center font-semibold text-blue-600">Strike</th>
                        <th className="px-2 py-1.5 text-center font-medium">Put (PE)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grid.map((g) => (
                        <tr key={g.strike} className="border-t border-slate-100">
                          <HeatCell b={g.call} maxOi={maxOi} />
                          <td
                            className={
                              "px-2 py-1.5 text-center font-mono font-semibold text-slate-900 " +
                              (g.isAtm ? "bg-blue-50" : "")
                            }
                          >
                            {g.strike}
                            {g.isAtm && <span className="ml-1 text-[9px] font-medium text-blue-600">ATM</span>}
                          </td>
                          <HeatCell b={g.put} maxOi={maxOi} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[10.5px] text-slate-400">
                  LB long buildup · SC short covering · SB short buildup · LU long unwinding. Cell shade =
                  size of the OI change; the figure underneath is the premium change.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
