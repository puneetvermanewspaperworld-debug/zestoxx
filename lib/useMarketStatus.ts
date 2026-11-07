"use client";

import { useEffect, useState } from "react";
import { marketStatus, type MarketStatus } from "./market-calendar";

/**
 * The market's status right now (open / closed / holiday / Muhurat session), from the NSE holiday
 * calendar in lib/market-calendar.ts, refreshed every 30 s. `null` until mounted, so the server
 * render and the first client render match.
 */
export function useMarketStatus(): MarketStatus | null {
  const [status, setStatus] = useState<MarketStatus | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setStatus(marketStatus()), 0);
    const timer = setInterval(() => setStatus(marketStatus()), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return status;
}
