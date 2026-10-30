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
  type Buildup,
  type BuildupBreakdown,
  type GridRow,
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

/** Text colour that stays readable on each class's solid badge. */
const BADGE_TEXT: Record<Buildup, string> = {
  "long-buildup": "text-white",
  "short-covering": "text-slate-900",
  "short-buildup": "text-white",
  "long-unwinding": "text-slate-900",
};

/** How many strikes either side of ATM the heatmap shows. */
const HEAT_WINDOW = 6;

const signedPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;

/**
 * One side of a heatmap row. A bar grows outward from the strike column in proportion to
 * the OI change (so size reads at a glance); the class badge sits next to the strike.
 */
function HeatSide({ b, maxOi, side }: { b: LegBuildup; maxOi: number; side: "call" | "put" }) {
  const call = side === "call";
  if (!b.kind) {
    return (
      <div className={"flex h-11 items-center px-3 text-[12px] text-slate-300 " + (call ? "justify-end" : "justify-start")}>
        —
      </div>
    );
  }
  const meta = BUILDUP_META[b.kind];
  const ratio = Math.min(1, Math.abs(b.oiChange) / maxOi);
  return (
    <div
      className="relative flex h-11 items-center"
      title={`${meta.label}: premium ${signedPct(b.priceChangePct)}, OI ${fmtOiChange(b.oiChange)}`}
    >
      <div
        className={"absolute inset-y-1.5 rounded " + (call ? "right-0" : "left-0")}
        // always wide enough to sit behind the badge + figures, then grows with the OI change
        style={{ width: `calc(104px + (100% - 104px) * ${ratio.toFixed(3)})`, background: `rgba(${meta.rgb.join(",")},${0.16 + ratio * 0.3})` }}
        aria-hidden
      />
      <div
        className={"relative z-10 flex w-full items-center gap-2 px-2 " + (call ? "flex-row-reverse" : "flex-row")}
      >
        <span
          className={
            "w-7 shrink-0 rounded py-0.5 text-center font-mono text-[10px] font-bold " +
            meta.swatch +
            " " +
            BADGE_TEXT[b.kind]
          }
        >
          {meta.code}
        </span>
        <span className={"min-w-0 leading-tight " + (call ? "text-right" : "text-left")}>
          <span className="block font-mono text-[12px] font-semibold text-slate-900">{fmtOiChange(b.oiChange)}</span>
          <span className="block font-mono text-[10.5px] text-slate-500">{signedPct(b.priceChangePct)}</span>
        </span>
      </div>
    </div>
  );
}

function Heatmap({ grid, maxOi }: { grid: GridRow[]; maxOi: number }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <h3 className="font-display text-[13px] font-semibold text-slate-900">Strike heatmap</h3>
        <ul className="flex flex-wrap gap-1.5" aria-label="Legend">
          {BUILDUP_ORDER.map((k) => (
            <li
              key={k}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pl-1 pr-2.5 text-[10.5px] text-slate-600"
              title={BUILDUP_META[k].meaning}
            >
              <span
                className={
                  "rounded-full px-1.5 py-px font-mono text-[9.5px] font-bold " +
                  BUILDUP_META[k].swatch +
                  " " +
                  BADGE_TEXT[k]
                }
              >
                {BUILDUP_META[k].code}
              </span>
              {BUILDUP_META[k].label}
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[1fr_76px_1fr] border-b border-slate-200 bg-slate-50 text-[10.5px] font-semibold uppercase tracking-wider sm:grid-cols-[1fr_96px_1fr]">
          <div className="px-3 py-2 text-right text-rose-500">Calls · CE</div>
          <div className="py-2 text-center text-slate-500">Strike</div>
          <div className="px-3 py-2 text-left text-emerald-600">Puts · PE</div>
        </div>
        <div className="divide-y divide-slate-100">
          {grid.map((g) => (
            <div
              key={g.strike}
              className={
                "grid grid-cols-[1fr_76px_1fr] items-center sm:grid-cols-[1fr_96px_1fr] " +
                (g.isAtm ? "bg-blue-50/70" : "hover:bg-slate-50")
              }
            >
              <HeatSide b={g.call} maxOi={maxOi} side="call" />
              <div className="flex flex-col items-center justify-center border-x border-slate-100 py-1">
                <span className="font-mono text-[12.5px] font-semibold text-slate-900">{g.strike}</span>
                {g.isAtm && (
                  <span className="mt-0.5 rounded-full bg-blue-600 px-1.5 text-[8.5px] font-bold uppercase tracking-wide text-white">
                    ATM
                  </span>
                )}
              </div>
              <HeatSide b={g.put} maxOi={maxOi} side="put" />
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-400">
        Bar length shows how much open interest was added or shed; the lower figure is the premium change since the
        previous close. Hover a cell for the full read.
      </p>
    </div>
  );
}

function Summary({
  breakdown,
  shares,
  basis,
}: {
  breakdown: BuildupBreakdown;
  shares: Record<Buildup, number>;
  basis: Basis;
}) {
  const dominant = BUILDUP_ORDER.reduce((a, k) => (shares[k] > shares[a] ? k : a), BUILDUP_ORDER[0]);
  return (
    <div>
      <div
        className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={BUILDUP_ORDER.map((k) => `${BUILDUP_META[k].label} ${shares[k].toFixed(0)} percent`).join(", ")}
      >
        {BUILDUP_ORDER.map((k) =>
          shares[k] > 0 ? (
            <div
              key={k}
              className={BUILDUP_META[k].swatch}
              style={{ width: `${shares[k]}%` }}
              title={`${BUILDUP_META[k].label}: ${shares[k].toFixed(1)}%`}
            />
          ) : null
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {BUILDUP_ORDER.map((k) => {
          const top = k === dominant;
          return (
            <div
              key={k}
              className={
                "relative overflow-hidden rounded-lg border bg-white py-2.5 pl-4 pr-3 " +
                (top ? "border-slate-300 shadow-sm" : "border-slate-200")
              }
            >
              <span className={"absolute inset-y-0 left-0 w-1 " + BUILDUP_META[k].swatch} aria-hidden />
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[11px] font-medium text-slate-500">{BUILDUP_META[k].label}</span>
                <span className="rounded bg-slate-100 px-1 font-mono text-[9.5px] font-semibold text-slate-500">
                  {BUILDUP_META[k].code}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-0.5 font-display font-semibold leading-none text-slate-900">
                <span className="text-[24px]">{shares[k].toFixed(0)}</span>
                <span className="text-[13px] text-slate-400">%</span>
              </div>
              <div className="mt-1 text-[10.5px] text-slate-400">
                {breakdown.contracts[k]} contract{breakdown.contracts[k] === 1 ? "" : "s"}
                {top && <span className="ml-1 font-semibold text-slate-500">· leading</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10.5px] text-slate-400">
        {basis === "contracts"
          ? "Share of liquid contracts in each class."
          : "Share of the total open interest moved, so heavier positioning counts for more."}
      </p>
    </div>
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
    return atm == null ? [] : buildupGrid(chain.rows, atm, HEAT_WINDOW);
  }, [chain]);
  const maxOi = Math.max(1, ...grid.flatMap((g) => [Math.abs(g.call.oiChange), Math.abs(g.put.oiChange)]));

  const shares = breakdown ? (basis === "contracts" ? breakdown.byContracts : breakdown.byOiChange) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="font-display text-[16px] font-semibold text-slate-900">Long / Short Buildup</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
              <span>Where option positioning is being added or unwound.</span>
              {chain && (
                <span
                  className={
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold " +
                    (chain.source === "live" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")
                  }
                >
                  <span
                    className={"h-1.5 w-1.5 rounded-full " + (chain.source === "live" ? "bg-emerald-500" : "bg-slate-400")}
                  />
                  {chain.source === "live" ? "Live data" : "Simulated"}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="flex items-center gap-1 rounded-md border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-[11.5px] font-medium text-blue-600 hover:bg-blue-50"
          >
            <CircleHelp size={13} /> How to read Buildups
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <div role="tablist" aria-label="Index" className="flex flex-wrap gap-1 rounded-lg border border-slate-200 p-0.5">
            {INDEXES.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={index === t.id}
                onClick={() => setIndex(t.id)}
                className={
                  "rounded-md px-3 py-1.5 text-[12px] font-medium " +
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
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-900 outline-none focus:border-blue-400"
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
          <div className="space-y-6 p-4">
            <OptionsStatsStrip chain={chain} />

            <section aria-label="Buildup summary">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-[13px] font-semibold text-slate-900">Positioning summary</h3>
                  <p className="text-[11.5px] text-slate-400">
                    {breakdown.totalContracts > 0
                      ? `${breakdown.totalContracts} liquid contracts (calls + puts) · expiry ${fmtIsoDate(chain.expiry)}`
                      : "No liquid contracts to classify yet"}
                  </p>
                </div>
                <div role="group" aria-label="Weighting" className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
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
                        "rounded-md px-2.5 py-1 text-[11.5px] font-medium " +
                        (basis === id ? "bg-blue-600 text-slate-50" : "text-slate-500 hover:text-slate-900")
                      }
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              {breakdown.totalContracts > 0 ? (
                <Summary breakdown={breakdown} shares={shares} basis={basis} />
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-[12.5px] text-slate-400">
                  Buildups compare today&apos;s premium and OI with the previous session, so they appear once
                  contracts start trading.
                </div>
              )}
            </section>

            {grid.length > 0 && <Heatmap grid={grid} maxOi={maxOi} />}
          </div>
        )}
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
