"use client";

import { useEffect, useState } from "react";
import { isMarketOpen } from "./fno/snapshot";

/**
 * Whether the Indian derivatives market is open right now, from the same `isMarketOpen` helper the
 * F&O analyzer polls with (weekdays 09:15–15:30 IST; exchange holidays aren't modelled — the
 * analyzer's own Live/Delayed badge, which reads the feed's timestamp, is the authority on that).
 *
 * `null` until mounted, so the server render and the first client render match.
 */
export function useMarketOpen(): boolean | null {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setOpen(isMarketOpen()), 0);
    const timer = setInterval(() => setOpen(isMarketOpen()), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return open;
}
