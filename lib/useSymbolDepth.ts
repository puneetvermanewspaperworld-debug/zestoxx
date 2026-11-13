"use client";

import { useEffect, useState } from "react";
import type { DepthResponse } from "./depth-state";

/**
 * Real depth for a symbol, polled every `pollMs`. `undefined` while the first answer is pending, `null` when the
 * request failed or the answer was not usable (the caller shows "not available", never a made-up ladder).
 */
export function useSymbolDepth(symbol: string, pollMs = 5_000): DepthResponse | null | undefined {
  const [state, setState] = useState<{ symbol: string; res: DepthResponse | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let res: DepthResponse | null = null;
      try {
        const r = await fetch(`/api/symbol-depth?symbol=${encodeURIComponent(symbol)}`);
        const data = r.ok ? ((await r.json()) as DepthResponse) : null;
        if (data && typeof data.source === "string") res = data;
      } catch {
        // treated as unavailable
      }
      if (!cancelled) setState((prev) => (res || prev?.symbol !== symbol ? { symbol, res } : prev));
    };
    load();
    const timer = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, pollMs]);
  return state?.symbol === symbol ? state.res : undefined;
}
