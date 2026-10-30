"use client";

import { useEffect, useState } from "react";
import type { MoversResponse } from "./movers";

/**
 * Polls /api/fno-movers?{query}. `res` is null until the first answer for the current
 * query arrives (render a skeleton). A later failed poll never replaces good live data
 * with an "unavailable" blip — the last good result stays on screen.
 */
export function useMovers<T>(
  query: string,
  { enabled = true, pollMs = 30_000 }: { enabled?: boolean; pollMs?: number } = {}
): { res: MoversResponse<T> | null; loading: boolean } {
  const [state, setState] = useState<{ query: string; res: MoversResponse<T> } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = async () => {
      let res: MoversResponse<T> = { source: "unavailable" };
      try {
        const r = await fetch(`/api/fno-movers?${query}`);
        if (r.ok) res = (await r.json()) as MoversResponse<T>;
      } catch {
        // keep "unavailable"
      }
      if (cancelled) return;
      setState((prev) =>
        res.source === "unavailable" && prev?.query === query && prev.res.source === "live"
          ? prev
          : { query, res }
      );
    };

    load();
    const timer = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [query, enabled, pollMs]);

  const ready = state?.query === query;
  return { res: ready ? state.res : null, loading: enabled && !ready };
}
