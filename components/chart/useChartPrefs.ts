"use client";

import { useCallback, useState } from "react";
import { defaultTarget, forgetPrefs, loadPrefs, savePrefs, savedTarget, type SavedPrefs } from "@/lib/chart/prefs";
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
  /** back to the saved snapshot (does nothing when none is saved: the menu does not offer it then) */
  resetToSaved: () => void;
  /** back to the app's defaults */
  resetToDefaults: () => void;
  forget: () => void;
}

/** Save preferences, Reset to saved and Reset to defaults for the chart's settings, kept in this browser only (lib/chart/prefs.ts). */
export function useChartPrefs(settings: ChartSettings, update: SettingsUpdate): PrefsApi {
  const [saved, setSaved] = useState<SavedPrefs | null>(() => loadPrefs(store()));
  const [message, setMessage] = useState<string | null>(null);
  const save = useCallback(() => {
    const r = savePrefs(store(), settings);
    setSaved(r);
    setMessage(r ? "Preferences saved on this device." : "Could not save: this browser is not letting the page store data.");
  }, [settings]);
  const resetToSaved = useCallback(() => {
    const target = savedTarget(saved);
    if (!target) return;
    update(target);
    setMessage("Back to your saved preferences.");
  }, [saved, update]);
  const resetToDefaults = useCallback(() => {
    update(defaultTarget());
    setMessage("Back to the app's defaults.");
  }, [update]);
  const forget = useCallback(() => {
    forgetPrefs(store());
    setSaved(null);
    setMessage("Saved preferences deleted.");
  }, []);
  return { savedAt: saved?.savedAt ?? null, message, save, resetToSaved, resetToDefaults, forget };
}
