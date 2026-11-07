"use client";

import { useEffect, useState } from "react";
import { isMarketOpen, type FnoSnapshot } from "./fno/snapshot";

const POLL_MS = 5_000;

/**
 * Snapshot for an underlying + expiry (`expiry = null` → the nearest). Polls every 5 s while the
 * market is open (09:15–15:30 IST, weekdays); outside those hours it reads once (the numbers stay
 * labelled `delayed`) and starts polling by itself when the market opens.
 *
 * `snap` is the latest good answer *for this query*. If a later poll fails, `snap` is kept but
 * `feedLost` turns true, so the page can say so instead of silently showing stale numbers.
 */
export function useFnoSnapshot(
  underlying: string,
  expiry: string | null
): { snap: FnoSnapshot | null; loading: boolean; feedLost: boolean } {
  const query = new URLSearchParams({ u: underlying, ...(expiry ? { expiry } : {}) }).toString();
  const [state, setState] = useState<{ query: string; snap: FnoSnapshot | null; lost: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      let snap: FnoSnapshot | null = null;
      try {
        const res = await fetch(`/api/fno/snapshot?${query}`);
        if (res.ok) snap = (await res.json()) as FnoSnapshot;
      } catch {
        // treated as a lost feed below
      }
      if (cancelled) return;
      setState((prev) => {
        const sameQuery = prev?.query === query;
        if (snap) return { query, snap, lost: false };
        return { query, snap: sameQuery ? prev.snap : null, lost: true };
      });
      schedule();
    };

    // While the market is open, poll every 5 s. While shut, just check each minute whether it has
    // opened — no data is fetched until it has.
    const schedule = () => {
      timer = setTimeout(() => (isMarketOpen() ? load() : schedule()), isMarketOpen() ? POLL_MS : 60_000);
    };

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [query]);

  const ready = state?.query === query;
  return { snap: ready ? state.snap : null, loading: !ready, feedLost: ready ? state.lost : false };
}
