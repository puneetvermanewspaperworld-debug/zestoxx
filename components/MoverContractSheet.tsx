"use client";

import React from "react";
import OptionOrderSheet from "@/components/OptionOrderSheet";
import { useOptionChain } from "@/lib/useOptionChain";
import { moverSheetState } from "@/lib/mover-sheet";
import type { OptionContract } from "@/lib/movers";

/**
 * The option sheet for a contract tapped in Movers. Loads the live chain for that underlying and expiry; if the chain
 * can't be had (or is only a simulation), says so instead of opening a sheet for some other contract.
 */
export default function MoverContractSheet({ contract, onClose }: { contract: OptionContract; onClose: () => void }) {
  const [picked, setPicked] = React.useState<{ strike: number; type: "CE" | "PE" }>({ strike: contract.strike, type: contract.type });
  const { chain } = useOptionChain(contract.symbol, contract.expiry, 0);
  const state = moverSheetState(chain, contract);

  if (state.kind === "ready") {
    return <OptionOrderSheet chain={state.chain} strike={picked.strike} type={picked.type} onPick={(strike, type) => setPicked({ strike, type })} onClose={onClose} />;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Option contract"
        className="w-full rounded-t-2xl bg-white p-5 text-center shadow-xl sm:max-w-sm sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {state.kind === "loading" ? (
          <div className="h-16 animate-pulse rounded bg-slate-50" aria-busy="true" />
        ) : (
          <p data-testid="mover-sheet-unavailable" className="text-[12.5px] text-slate-500">
            {state.text}
          </p>
        )}
        <button type="button" onClick={onClose} className="mt-4 rounded-md border border-slate-200 px-4 py-1.5 text-[12px] font-medium text-slate-600">
          Close
        </button>
      </div>
    </div>
  );
}
