import React from "react";
import { MF_DISCLAIMER, MF_SOURCE } from "@/lib/mf/disclaimer";
import { COVERAGE_LABEL } from "@/lib/mf/universe";

/** Coverage label, data source and the required risk text; at the top and bottom of every mutual fund page. */
export function CoverageChip() {
  return (
    <span data-testid="mf-coverage" className="inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
      {COVERAGE_LABEL}
    </span>
  );
}

export function FundsFooter() {
  return (
    <div className="space-y-1.5 rounded-lg bg-amber-50 px-4 py-3 text-[11.5px] leading-snug text-amber-900">
      <p data-testid="mf-disclaimer">{MF_DISCLAIMER}</p>
      <p className="text-amber-800/80">{MF_SOURCE}</p>
    </div>
  );
}
