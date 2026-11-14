"use client";

import { useCallback, useState } from "react";
import { forgetPrefs, loadPrefs, resetTarget, savePrefs, type SavedPrefs } from "@/lib/chart/prefs";
import type { ChartSettings } from "@/lib/chart/settings";
import type { SettingsUpdate } from "./useChartSettings";

const store = () => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // blocked
  }
};

export interface PrefsApi {
  /** when the snapshot was saved, or null when none is */
  savedAt: string | null;
  message: string | null;
  save: () => void;
  /** back to the saved snapshot, or to the app's defaults when none is saved */
  reset: () => void;
  forget: () => void;
}

/** Save preferences and Reset preferences for the chart's settings, kept in this browser only (lib/chart/prefs.ts). */
export function useChartPrefs(settings: ChartSettings, update: SettingsUpdate): PrefsApi {
  const [saved, setSaved] = useState<SavedPrefs | null>(() => loadPrefs(store()));
  const [message, setMessage] = useState<string | null>(null);
  const save = useCallback(() => {
    const r = savePrefs(store(), settings);
    setSaved(r);
    setMessage(r ? "Preferences saved on this device." : "Could not save: this browser is not letting the page store data.");
  }, [settings]);
  const reset = useCallback(() => {
    update(resetTarget(saved));
    setMessage(saved ? "Back to your saved preferences." : "Back to the app's defaults.");
  }, [saved, update]);
  const forget = useCallback(() => {
    forgetPrefs(store());
    setSaved(null);
    setMessage("Saved preferences deleted.");
  }, []);
  return { savedAt: saved?.savedAt ?? null, message, save, reset, forget };
}
