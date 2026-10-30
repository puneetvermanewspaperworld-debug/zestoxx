"use client";

import { useEffect, useRef, useState } from "react";
import { simulateChain, type OptionChain } from "./options";

/**
 * Option chain for an underlying + expiry: live from /api/options-chain when Upstox
 * answers, otherwise a deterministic simulated chain (check `chain.source`).
 *
 * `expiry = null` means "nearest". `fallbackSpot` seeds the simulation only. Returns
 * `chain: null` while the first response for the current (underlying, expiry) is in
 * flight — callers should render a skeleton, which also keeps SSR/hydration identical
 * because nothing date-dependent is computed until after mount.
 */
export function useOptionChain(
  underlying: string,
  expiry: string | null,
  fallbackSpot: number,
  { enabled = true, pollMs = 30_000 }: { enabled?: boolean; pollMs?: number } = {}
): { chain: OptionChain | null; loading: boolean } {
  const key = `${underlying}|${expiry ?? ""}`;
  const [state, setState] = useState<{ key: string; chain: OptionChain } | null>(null);

  // Latest spot for the simulation, without re-running the fetch effect on every tick.
  const spotRef = useRef(fallbackSpot);
  useEffect(() => {
    spotRef.current = fallbackSpot;
  }, [fallbackSpot]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = async () => {
      try {
        const qs = new URLSearchParams({ underlying });
        if (expiry) qs.set("expiry", expiry);
        const res = await fetch(`/api/options-chain?${qs}`);
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          if (data?.source === "live") {
            setState({ key, chain: data as OptionChain });
            return;
          }
        }
      } catch {
        // fall through to the simulation
      }
      if (cancelled) return;
      setState({ key, chain: simulateChain(underlying, spotRef.current, expiry) });
    };

    load();
    const timer = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [underlying, expiry, key, enabled, pollMs]);

  const ready = state?.key === key;
  return { chain: ready ? state.chain : null, loading: enabled && !ready };
}
