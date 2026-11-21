"use client";

import { useEffect, useId } from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { isDynamicEquity } from "@/lib/dynamic-symbols";

/**
 * Ask for live quotes of these symbols for as long as the calling view is on screen. Only NSE equities and ETFs the app does not chart on its
 * own are fetched (the twelve it charts are always priced), all together with whatever else is on screen, in one request.
 */
export function useWatchSymbols(ids: string[]): void {
  const { watchQuotes } = useZestoxx();
  const owner = useId();
  const key = ids.filter(isDynamicEquity).sort().join(",");
  useEffect(() => {
    watchQuotes(owner, key ? key.split(",") : []);
    return () => watchQuotes(owner, []);
  }, [key, owner, watchQuotes]);
}
