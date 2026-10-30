"use client";

import { useEffect, useState } from "react";
import type { Candle5, ContractQuote } from "./contract";

/**
 * Live full quote for one contract, polled every `pollMs`. `loading` is true until the
 * first attempt for this key settles; after that `quote` is the latest live answer, or
 * null if Upstox never answered (callers then show their simulation). A later failed
 * poll keeps the last live quote on screen rather than flickering.
 *
 * `key` is undefined for simulated contracts — then nothing is fetched.
 */
export function useContractQuote(
  key: string | undefined,
  pollMs = 5_000
): { quote: ContractQuote | null; loading: boolean } {
  const [state, setState] = useState<{ key: string; quote: ContractQuote | null } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const load = async () => {
      let quote: ContractQuote | null = null;
      try {
        const res = await fetch(`/api/option-quote?key=${encodeURIComponent(key)}`);
        const data = res.ok ? await res.json() : null;
        if (data?.source === "live") quote = data as ContractQuote;
      } catch {
        // treated as unavailable
      }
      if (cancelled) return;
      setState((prev) => (quote || prev?.key !== key ? { key, quote } : prev));
    };
    load();
    const timer = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key, pollMs]);

  const settled = !!key && state?.key === key;
  return { quote: settled ? state.quote : null, loading: !!key && !settled };
}

/**
 * Today's 5-minute candles for the Charts tab. `enabled` keeps it idle until the tab is
 * opened. `candles` is null while loading, [] when there are none or the feed is down.
 */
export function useContractCandles(key: string | undefined, enabled: boolean): Candle5[] | null {
  const [state, setState] = useState<{ key: string; candles: Candle5[] } | null>(null);

  useEffect(() => {
    if (!key || !enabled) return;
    let cancelled = false;
    const load = async () => {
      let candles: Candle5[] = [];
      try {
        const res = await fetch(`/api/option-candles?key=${encodeURIComponent(key)}`);
        const data = res.ok ? await res.json() : null;
        if (data?.source === "live") candles = data.candles as Candle5[];
      } catch {
        // leave empty
      }
      if (!cancelled) setState({ key, candles });
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key, enabled]);

  return key && state?.key === key ? state.candles : null;
}
