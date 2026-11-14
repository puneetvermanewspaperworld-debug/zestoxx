"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import type { Drawing } from "@/lib/chart/drawings";
import { createLevelAlert, findLevelAlert, moveLevelAlert, removeLevelAlert, sideFor, type AlertSide } from "@/lib/chart/levelAlert";

type Level = Extract<Drawing, { kind: "hline" }>;

/** What the property bar needs to show for a selected horizontal level. */
export interface LevelAlertView {
  has: boolean;
  /** the side the alert is (or would be) on */
  side: AlertSide | null;
  /** false when the price is at the level now, or not known */
  canSet: boolean;
  toggle: () => void;
}

/**
 * Ties the Trade page's horizontal levels to the terminal's own price alerts (see lib/chart/levelAlert.ts). An alert made from a level
 * moves with it when the level is moved or an undo moves it back; deleting a level leaves its alert alone (it is still listed with the
 * others on the Alerts page).
 */
export function useLevelAlerts(symbol: string, committed: readonly Drawing[], loaded: boolean) {
  const { alerts, setAlerts, live } = useZestoxx();
  const price = live[symbol];
  const liveRef = useRef(price);
  useEffect(() => {
    liveRef.current = price;
  });

  // ids of the levels that have an alert, for the chart to mark
  const alerted = useMemo(() => {
    const ids = new Set<string>();
    for (const d of committed) if (d.kind === "hline" && findLevelAlert(alerts, symbol, d.price)) ids.add(d.id);
    return ids;
  }, [committed, alerts, symbol]);

  // a level that moved takes its alert with it
  const prev = useRef(new Map<string, number>());
  useEffect(() => {
    if (!loaded) {
      prev.current = new Map();
      return;
    }
    const now = new Map<string, number>();
    for (const d of committed) if (d.kind === "hline") now.set(d.id, d.price);
    for (const [id, p] of now) {
      const before = prev.current.get(id);
      if (before !== undefined && before !== p) setAlerts((cur) => moveLevelAlert(cur, symbol, before, p, liveRef.current) as typeof cur);
    }
    prev.current = now;
  }, [committed, loaded, symbol, setAlerts]);

  const viewFor = useCallback(
    (d: Level): LevelAlertView => {
      const has = !!findLevelAlert(alerts, symbol, d.price);
      const side = sideFor(price, d.price);
      return {
        has,
        side: has ? (findLevelAlert(alerts, symbol, d.price)?.condition ?? side) : side,
        canSet: side !== null,
        toggle: () => {
          if (has) setAlerts((cur) => removeLevelAlert(cur, symbol, d.price));
          else {
            const a = createLevelAlert(symbol, d.price, liveRef.current, new Date().toLocaleTimeString("en-IN"));
            if (a) setAlerts((cur) => [a, ...cur]);
          }
        },
      };
    },
    [alerts, symbol, price, setAlerts]
  );

  return { alerted, viewFor };
}
