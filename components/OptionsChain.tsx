"use client";

import React, { useMemo, useState } from "react";
import { GREEKS, chainStats, type GreekName, type OptionChain, type OptionLeg } from "@/lib/options";
import { fmtOi, fmtOiChange } from "@/lib/helpers";

const WINDOW = 10; // strikes shown either side of ATM

type View = "oi" | "greeks";

/** LTP cell that opens the order sheet (plain text when the chain isn't tradeable). */
function LtpButton({
  label,
  onPick,
  children,
}: {
  label: string;
  onPick?: () => void;
  children: React.ReactNode;
}) {
  if (!onPick) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={label}
      className="rounded px-1.5 py-0.5 underline decoration-dotted underline-offset-2 hover:bg-blue-50"
    >
      {children}
    </button>
  );
}

const oiTone = (n: number) => (n > 0 ? "text-emerald-500" : n < 0 ? "text-rose-500" : "text-slate-400");
const signTone = (n: number | undefined) =>
  n == null || n === 0 ? "text-slate-500" : n > 0 ? "text-emerald-600" : "text-rose-500";

interface Col {
  id: string;
  head: string;
  hint?: string;
  tone: (leg: OptionLeg, side: "call" | "put") => string;
  render: (leg: OptionLeg, ctx: { onPick?: () => void; label: string }) => React.ReactNode;
}

const greekCol = (g: GreekName): Col => {
  const meta = GREEKS.find((x) => x.id === g)!;
  return {
    id: g,
    head: meta.label,
    hint: meta.hint,
    tone: (leg) => (g === "delta" ? signTone(leg.delta) : "text-slate-600"),
    render: (leg) => (leg[g] == null ? "--" : leg[g]!.toFixed(meta.digits)),
  };
};

const COLS = {
  oi: {
    id: "oi",
    head: "OI",
    hint: "Open interest",
    tone: () => "text-slate-500",
    render: (l) => fmtOi(l.oi),
  } satisfies Col,
  oiChg: {
    id: "oiChg",
    head: "ΔOI",
    hint: "Change in open interest since the previous session",
    tone: (l) => oiTone(l.oi - l.prevOi),
    render: (l) => fmtOiChange(l.oi - l.prevOi),
  } satisfies Col,
  iv: {
    id: "iv",
    head: "IV",
    hint: "Implied volatility",
    tone: () => "text-slate-500",
    render: (l) => (l.iv > 0 ? `${l.iv.toFixed(1)}%` : "--"),
  } satisfies Col,
  ltp: {
    id: "ltp",
    head: "LTP",
    tone: (_l, side) => (side === "call" ? "text-emerald-500" : "text-rose-500"),
    render: (l, ctx) => (
      <LtpButton label={ctx.label} onPick={ctx.onPick}>
        {l.ltp.toFixed(1)}
      </LtpButton>
    ),
  } satisfies Col,
};

/** Columns left→right for the calls (the puts mirror them, strike in the middle). */
const CALL_COLS: Record<View, Col[]> = {
  oi: [COLS.oi, COLS.oiChg, COLS.iv, COLS.ltp],
  greeks: [COLS.oi, greekCol("delta"), greekCol("theta"), greekCol("vega"), greekCol("gamma"), COLS.ltp],
};

export default function OptionsChain({
  chain,
  onPick,
}: {
  chain: OptionChain;
  /** open the order sheet for this contract */
  onPick?: (strike: number, type: "CE" | "PE") => void;
}) {
  const [view, setView] = useState<View>("oi");
  const atm = useMemo(() => chainStats(chain.rows, chain.spot)?.atmStrike, [chain.rows, chain.spot]);

  const rows = useMemo(() => {
    const idx = chain.rows.findIndex((r) => r.strike === atm);
    if (idx < 0) return chain.rows;
    return chain.rows.slice(Math.max(0, idx - WINDOW), idx + WINDOW + 1);
  }, [chain.rows, atm]);

  if (rows.length === 0) {
    return <div className="p-6 text-center text-[12.5px] text-slate-400">No option data for this expiry.</div>;
  }

  const callCols = CALL_COLS[view];
  const putCols = [...callCols].reverse();
  // Greeks come from the feed (or the simulation) leg by leg; say so if none arrived.
  const hasGreeks = rows.some((r) => r.call.delta != null || r.put.delta != null);

  const cell = "px-2 py-1.5 font-mono";

  return (
    <div>
      <div className="sticky left-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div role="group" aria-label="Chain columns" className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
          {(
            [
              ["oi", "OI & IV"],
              ["greeks", "Greeks"],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={
                "rounded-md px-2.5 py-1 text-[11.5px] font-medium " +
                (view === id ? "bg-blue-600 text-slate-50" : "text-slate-500 hover:text-slate-900")
              }
            >
              {text}
            </button>
          ))}
        </div>
        {view === "greeks" && (
          <p className="text-[10.5px] text-slate-400">
            {hasGreeks
              ? "Per unit of the contract. Theta is ₹ per day; vega is ₹ per 1-point IV move. Hover a heading."
              : "Greeks aren't available for this chain right now."}
          </p>
        )}
      </div>

      {/* The parent scrolls both ways, so the sticky header keeps working. */}
      <div>
        <table className={"w-full border-collapse text-[11.5px] " + (view === "greeks" ? "min-w-[900px]" : "min-w-[640px]")}>
          <thead className="sticky top-0 bg-white">
            <tr className="text-slate-500">
              {callCols.map((c) => (
                <th key={"c" + c.id} title={c.hint} className="px-2 py-1.5 text-right font-medium">
                  CE {c.head}
                </th>
              ))}
              <th className="px-2 py-1.5 text-center font-semibold text-blue-600">Strike</th>
              {putCols.map((c) => (
                <th key={"p" + c.id} title={c.hint} className="px-2 py-1.5 text-left font-medium">
                  PE {c.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isAtm = r.strike === atm;
              const ceItm = r.strike < chain.spot && !isAtm;
              const peItm = r.strike > chain.spot && !isAtm;
              return (
                <tr key={r.strike} className={isAtm ? "bg-blue-50" : "hover:bg-slate-50"}>
                  {callCols.map((c) => (
                    <td
                      key={"c" + c.id}
                      className={`${cell} text-right ${c.tone(r.call, "call")} ${ceItm ? "bg-slate-50" : ""}`}
                    >
                      {c.render(r.call, {
                        label: `Trade ${r.strike} CE`,
                        onPick: onPick && (() => onPick(r.strike, "CE")),
                      })}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center font-mono font-semibold text-slate-900">{r.strike}</td>
                  {putCols.map((c) => (
                    <td
                      key={"p" + c.id}
                      className={`${cell} text-left ${c.tone(r.put, "put")} ${peItm ? "bg-slate-50" : ""}`}
                    >
                      {c.render(r.put, {
                        label: `Trade ${r.strike} PE`,
                        onPick: onPick && (() => onPick(r.strike, "PE")),
                      })}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
