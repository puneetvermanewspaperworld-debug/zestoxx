"use client";

import React from "react";
import { fmt, fmtSigned } from "@/lib/helpers";
import type { AssetType } from "@/lib/types";

/** The price strip under the top bar: the exchange, the live price, the change and the percent. Only real data: a missing number shows as "--". */
export function PriceStrip({ exchange, price, type, change, pct, noPriceText }: { exchange: string; price: number | null; type: AssetType; change?: number | null; pct: number | null; noPriceText?: string }) {
  const tone = pct == null || pct === 0 ? "text-slate-600" : pct > 0 ? "text-emerald-600" : "text-rose-500";
  return (
    <div data-testid="action-strip" className="flex h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-[13px]">
      <span data-testid="strip-exchange" className="text-slate-500">
        {exchange}
      </span>
      <span data-testid="strip-price" className={"font-mono text-[15px] " + (price == null ? "text-slate-500" : tone)}>
        {price == null ? (noPriceText ?? "--") : fmt(price, type)}
      </span>
      {price != null && change != null && (
        <span data-testid="strip-change" className={"font-mono " + tone}>
          {fmtSigned(change, 2)}
        </span>
      )}
      {price != null && (
        <span data-testid="strip-pct" className={"font-mono " + tone}>
          {pct == null ? "--" : fmtSigned(pct, 2, "%")}
        </span>
      )}
    </div>
  );
}

/** A white card that holds rows of a form. */
export function FormCard({ children, testId, title }: { children: React.ReactNode; testId?: string; title?: string }) {
  return (
    <section data-testid={testId} className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white" aria-label={title}>
      {children}
    </section>
  );
}

/** One row of a form: the label on the left, the choices or the field on the right, and an optional hint under the control. */
export function FormRow({ label, htmlFor, hint, children, testId }: { label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="flex items-start gap-3 px-3 py-3">
      <label htmlFor={htmlFor} className="w-[34%] shrink-0 pt-2.5 text-[14px] font-medium text-slate-800">
        {label}
      </label>
      <div className="min-w-0 flex-1">
        {children}
        {hint != null && hint !== false && <div className="mt-1.5 text-[12px] leading-snug text-slate-500">{hint}</div>}
      </div>
    </div>
  );
}

/** Choice boxes: one of a few options, as boxes on the right of a row. Each is a radio button with a 44px hit area. */
export function Choice<T extends string>({ label, value, onChange, options, testId }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; label: string; testId?: string }[]; testId?: string }) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          data-compact
          aria-checked={value === o.id}
          data-testid={o.testId}
          onClick={() => onChange(o.id)}
          className={"h-10 min-w-[72px] flex-1 rounded-md border px-3 text-[13px] font-medium " + (value === o.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A field. Its font is 16px (a phone zooms the page for anything smaller) and it keeps focus while you type. */
export function Field({ id, value, onChange, inputMode = "decimal", placeholder, ariaLabel, testId, unit, error }: { id: string; value: string; onChange: (v: string) => void; inputMode?: "decimal" | "numeric" | "text"; placeholder?: string; ariaLabel: string; testId?: string; unit?: string; error?: boolean }) {
  return (
    <div className={"flex items-center rounded-md border bg-white " + (error ? "border-rose-400" : "border-slate-200 focus-within:border-blue-500")}>
      <input
        id={id}
        data-testid={testId}
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent px-3 font-mono text-slate-900 outline-none"
      />
      {unit && <span className="shrink-0 pr-3 text-[12px] text-slate-500">{unit}</span>}
    </div>
  );
}

/** A message in the screen: information, a warning, an error (announced at once) or a success. */
export function Notice({ tone = "info", children, testId }: { tone?: "info" | "warn" | "error" | "ok"; children: React.ReactNode; testId?: string }) {
  const cls = { info: "bg-slate-100 text-slate-600", warn: "bg-amber-50 text-amber-900", error: "bg-rose-50 text-rose-700", ok: "bg-emerald-50 text-emerald-800" }[tone];
  return (
    <p data-testid={testId} role={tone === "error" ? "alert" : "status"} className={"rounded-lg px-3 py-2.5 text-[12px] leading-snug " + cls}>
      {children}
    </p>
  );
}
