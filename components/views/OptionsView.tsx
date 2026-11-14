"use client";

import DataBadge from "@/components/DataBadge";
import React, { useState } from "react";
import OptionsChain from "@/components/OptionsChain";
import WatchlistOptionsToggle from "@/components/WatchlistOptionsToggle";
import OptionOrderSheet from "@/components/OptionOrderSheet";
import OptionsStatsStrip from "@/components/OptionsStatsStrip";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { SYMBOLS } from "@/lib/symbols";
import { fmt, fmtIsoDate } from "@/lib/helpers";
import { useOptionChain } from "@/lib/useOptionChain";
import { atmContract } from "@/lib/sell-shortcut";
import { PAPER_SELL } from "@/lib/labels";

export default function OptionsView() {
  const { selected, sym, price, setSelected } = useZestoxx();
  const eligible = SYMBOLS.filter((s) => s.type !== "crypto");
  const isCrypto = sym.type === "crypto";

  // Chosen expiry per underlying — each has its own calendar, so one shared value
  // would be invalid the moment you switch symbols. null = nearest.
  const [expiryFor, setExpiryFor] = useState<Record<string, string>>({});
  const { chain } = useOptionChain(selected, expiryFor[selected] ?? null, price, { enabled: !isCrypto });

  // Contract open in the order sheet. Tied to its underlying + expiry so it can't outlive the
  // chain it was picked from.
  const [contract, setContract] = useState<{
    underlying: string;
    expiry: string;
    strike: number;
    type: "CE" | "PE";
    /** opened from a Paper sell shortcut */
    sell?: boolean;
  } | null>(null);
  const sheet =
    chain && contract && contract.underlying === chain.underlying && contract.expiry === chain.expiry
      ? contract
      : null;

  return (
    <div className="space-y-3">
      <WatchlistOptionsToggle active="options" />
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-slate-900">Options Chain</h2>
            <p className="flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
              <span>
                {sym.name} · Spot {fmt(chain?.spot ?? price, sym.type)}
              </span>
              {chain && <DataBadge source={chain.source === "live" ? "live" : "sim"} />}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-md border border-slate-200 p-0.5">
              {eligible.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className={
                    "rounded px-2.5 py-1 text-[11.5px] font-medium " +
                    (selected === s.id ? "bg-blue-600 text-slate-50" : "text-slate-500 hover:text-slate-900")
                  }
                >
                  {s.id}
                </button>
              ))}
            </div>
            {chain && (
              <select
                aria-label="Expiry"
                value={chain.expiry}
                onChange={(e) => setExpiryFor((m) => ({ ...m, [selected]: e.target.value }))}
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
        </div>

        {isCrypto ? (
          <div className="flex items-center justify-center px-6 py-16 text-center text-[12.5px] text-slate-400">
            Options chain isn&apos;t available for crypto pairs on Zestoxx yet — futures analytics coming soon.
          </div>
        ) : chain ? (
          <>
            <div className="border-b border-slate-200 p-4">
              <OptionsStatsStrip chain={chain} />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
                {(["CE", "PE"] as const).map((type) => {
                  const atm = atmContract(chain, type);
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={!atm}
                      onClick={() => atm && setContract({ underlying: chain.underlying, expiry: chain.expiry, ...atm, sell: true })}
                      className="rounded-md bg-rose-500 px-2 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {type === "CE" ? `${PAPER_SELL} Call` : `${PAPER_SELL} Put`}
                      {atm && <span className="block text-[10.5px] font-normal opacity-90">ATM {atm.strike}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="max-h-[560px] overflow-auto">
              <OptionsChain
                chain={chain}
                onPick={(strike, type) => setContract({ underlying: chain.underlying, expiry: chain.expiry, strike, type })}
              />
            </div>
          </>
        ) : (
          <div className="h-[420px] animate-pulse bg-slate-50" aria-busy="true" />
        )}
      </div>
      {chain && sheet && (
        <OptionOrderSheet
          chain={chain}
          strike={sheet.strike}
          type={sheet.type}
          sellIntent={sheet.sell}
          onPick={(strike, type) => setContract({ ...sheet, strike, type })}
          onClose={() => setContract(null)}
        />
      )}
    </div>
  );
}
