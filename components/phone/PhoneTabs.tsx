"use client";

import React from "react";

/** A row of tabs that scrolls sideways when there are too many for the width; every tab is 44 px tall. */
export default function PhoneTabs<T extends string>({ label, value, onChange, tabs, testId }: { label: string; value: T; onChange: (v: T) => void; tabs: { id: T; label: string; count?: number }[]; testId?: string }) {
  return (
    <div role="tablist" aria-label={label} data-testid={testId} className="flex overflow-x-auto border-b border-slate-200 bg-white px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          data-testid={`${testId ?? "tab"}-${t.id}`}
          onClick={() => onChange(t.id)}
          className={"flex min-h-[44px] shrink-0 items-center gap-1 whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold " + (value === t.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500")}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
