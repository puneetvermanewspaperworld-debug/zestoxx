"use client";

import { useEffect, useState } from "react";
import { istDateString } from "./helpers";
import { simulatedExpiries } from "./options";
import type { WatchlistResponse } from "./watchlists";

/**
 * Polls /api/watchlist?{query}. `query` is `list=<popular id>` or `symbols=A,B,C`; pass
 * null to stay idle. `res` is null until the first answer for the current query arrives.
 * A later failed poll never replaces live rows with an "unavailable" blip.
 */
export function useWatchRows(
  query: string | null,
  pollMs = 15_000
): { res: WatchlistResponse | null; loading: boolean } {
  const [state, setState] = useState<{ query: string; res: WatchlistResponse } | null>(null);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const load = async () => {
      let res: WatchlistResponse = { source: "unavailable" };
      try {
        const r = await fetch(`/api/watchlist?${query}`);
        if (r.ok) res = (await r.json()) as WatchlistResponse;
      } catch {
        // keep "unavailable"
      }
      if (cancelled) return;
      setState((prev) =>
        res.source === "unavailable" && prev?.query === query && prev.res.source === "live" ? prev : { query, res }
      );
    };
    load();
    const timer = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [query, pollMs]);

  const ready = !!query && state?.query === query;
  return { res: ready ? state.res : null, loading: !!query && !ready };
}

/**
 * Whether `underlying`'s nearest option expiry is today (IST). `null` until known, so a
 * server render and the first client render match; the calendar is Upstox's when
 * reachable and the generated one otherwise (same fallback as the options chain).
 */
export function useExpiryToday(underlying: string): boolean | null {
  const [state, setState] = useState<{ underlying: string; nearest: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let nearest: string | undefined;
      try {
        const r = await fetch(`/api/option-expiries?underlying=${encodeURIComponent(underlying)}`);
        const data = r.ok ? await r.json() : null;
        if (data?.source === "live") nearest = (data.expiries as string[])[0];
      } catch {
        // fall back below
      }
      nearest ??= simulatedExpiries(underlying)[0];
      if (!cancelled && nearest) setState({ underlying, nearest });
    })();
    return () => {
      cancelled = true;
    };
  }, [underlying]);

  return state?.underlying === underlying ? state.nearest === istDateString() : null;
}
