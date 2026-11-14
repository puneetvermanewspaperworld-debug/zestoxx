"use client";

import { useEffect, useState } from "react";
import { indexUnderlying } from "@/lib/chart/lot";
import type { AssetType } from "@/lib/types";

/** The lot size from the feed for an index symbol (via /api/option-expiries), or null while loading, for other symbols, and when the feed has none. */
export function useIndexLot(symbol: string, type: AssetType): number | null {
  const underlying = indexUnderlying(symbol, type);
  const [state, setState] = useState<{ underlying: string; lot: number | null } | null>(null);
  useEffect(() => {
    if (!underlying) return;
    let cancelled = false;
    fetch(`/api/option-expiries?underlying=${encodeURIComponent(underlying)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((j: { source?: string; lot?: number } | null) => {
        if (!cancelled) setState({ underlying, lot: j?.source === "live" && typeof j.lot === "number" && j.lot > 0 ? j.lot : null });
      });
    return () => {
      cancelled = true;
    };
  }, [underlying]);
  return underlying && state?.underlying === underlying ? state.lot : null;
}
