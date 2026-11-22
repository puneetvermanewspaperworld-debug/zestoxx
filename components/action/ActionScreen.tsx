"use client";

import React, { useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { useDialogFocus } from "@/components/useDialogFocus";

export interface ActionFooter {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "buy" | "sell" | "primary";
  testId?: string;
}

/**
 * The shell every phone action screen is built on: a top bar with a back arrow, the symbol and a small label for the action (and a "Paper
 * trade" badge, because nothing here is real money); then the price strip and the form cards; and one full-width button fixed at the bottom
 * with the action, the symbol and the quantity on it. A normal tap, not a swipe. The back arrow, Escape and the browser's back button all close
 * it (the screen is an address: see lib/actions.ts), and the page underneath is still there, with its state.
 */
export default function ActionScreen({ label, symbol, onBack, strip, children, footer, testId = "action-screen" }: { label: string; symbol: string; onBack: () => void; strip?: React.ReactNode; children: React.ReactNode; footer?: ActionFooter; testId?: string }) {
  const panel = useRef<HTMLDivElement | null>(null);
  useDialogFocus(panel, onBack);
  const tone = { buy: "bg-emerald-600", sell: "bg-rose-600", primary: "bg-blue-600" }[footer?.tone ?? "primary"];
  return (
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${label} ${symbol}`} data-testid={testId} className="zx-app fixed inset-0 z-[80] flex flex-col bg-slate-100 outline-none">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-slate-200 bg-white pl-1 pr-3">
        <button type="button" onClick={onBack} aria-label="Back" data-testid="action-back" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-700">
          <ArrowLeft size={20} aria-hidden />
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <div data-testid="action-symbol" className="truncate text-[15px] text-slate-900">
            {symbol}
          </div>
          <div data-testid="action-label" className="text-[12px] text-slate-500">
            {label}
          </div>
        </div>
        <span data-testid="paper-badge" className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
          Paper trade
        </span>
      </header>
      <div data-testid="action-body" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 pb-6">
        {strip}
        {children}
      </div>
      {footer && (
        <div className="shrink-0 border-t border-slate-200 bg-white p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button type="button" onClick={footer.onPress} disabled={footer.disabled} data-testid={footer.testId ?? "action-submit"} className={"h-[var(--btn-primary-h)] w-full rounded-lg text-[14px] font-semibold text-white disabled:opacity-40 " + tone}>
            {footer.label}
          </button>
        </div>
      )}
    </div>
  );
}
