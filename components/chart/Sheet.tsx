"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * A menu sheet over the chart: a bottom sheet on a phone, a centred panel on a wide screen. Escape, the close button and a tap outside
 * close it. Rendered in place (not in a portal) so it also shows inside the chart's fullscreen view. Every control in it is 44 px.
 */
export default function Sheet({ title, onClose, children, testId }: { title: string; onClose: () => void; children: React.ReactNode; testId?: string }) {
  const panel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
      <button type="button" aria-label="Close menu" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-slate-900/40" data-testid="sheet-backdrop" />
      <div ref={panel} tabIndex={-1} className="relative z-10 flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:w-[460px] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4">
          <h2 className="font-display text-[14px] font-semibold text-slate-900">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} data-testid="sheet-close" className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto p-2">{children}</div>
      </div>
    </div>
  );
}

/** A 44 px row of a menu. */
export const rowClass = (on = false) =>
  "flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] transition-colors " + (on ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50");

export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">{children}</span>;
}
