"use client";

import { useCallback, useEffect, useState } from "react";
import { loadSettings, saveSettings, type ChartSettings, type StorageLike } from "@/lib/chart/settings";

const browserStorage = (): StorageLike | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // blocked
  }
};

/** What the chart remembers on this device (see lib/chart/settings.ts): read once, saved whenever it changes. */
export function useChartSettings() {
  const [settings, setSettings] = useState<ChartSettings>(() => loadSettings(browserStorage()));
  useEffect(() => {
    saveSettings(browserStorage(), settings);
  }, [settings]);
  const update = useCallback((patch: Partial<ChartSettings> | ((prev: ChartSettings) => Partial<ChartSettings>)) => setSettings((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) })), []);
  return [settings, update] as const;
}
export type SettingsUpdate = ReturnType<typeof useChartSettings>[1];
