"use client";

import React from "react";
import { BellRing, X } from "lucide-react";
import { useZestoxx } from "./ZestoxxProvider";

export default function Toasts() {
  const { toasts, dismissToast } = useZestoxx();
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-[12.5px] text-slate-900 shadow-lg animate-[fadeIn_0.2s_ease-out]"
        >
          <BellRing size={14} className="text-blue-600" />
          {t.text}
          <button
            onClick={() => dismissToast(t.id)}
            className="ml-1 text-slate-400 hover:text-slate-900"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
