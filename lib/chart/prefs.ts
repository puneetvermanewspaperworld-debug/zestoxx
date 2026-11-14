import { parseSettings, type ChartSettings, type StorageLike } from "./settings";

/**
 * Saved preferences: a snapshot of the chart's settings (chart type, interval and range, studies and their parameters, price scale, grid,
 * crosshair, invert, theme, favourites, Renko sizes) that the user keeps on purpose, apart from what the chart remembers as it goes.
 * "Save preferences" takes the snapshot; "Reset preferences" puts the chart back to it, or to the app's defaults when none is saved.
 * Browser storage only. Whatever is read back is checked like any other setting.
 */
export const PREFS_KEY = "zestoxx:chart-prefs:v1";

export interface SavedPrefs {
  /** ISO time it was saved */
  savedAt: string;
  settings: ChartSettings;
}

export function savePrefs(storage: StorageLike | null, settings: ChartSettings, now: Date = new Date()): SavedPrefs | null {
  const rec: SavedPrefs = { savedAt: now.toISOString(), settings: parseSettings(JSON.parse(JSON.stringify(settings))) };
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(rec));
    return storage ? rec : null;
  } catch {
    return null; // storage is full or blocked: nothing was saved, and the caller is told
  }
}

export function loadPrefs(storage: StorageLike | null): SavedPrefs | null {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { savedAt?: unknown; settings?: unknown };
    if (typeof j.savedAt !== "string" || Number.isNaN(Date.parse(j.savedAt)) || typeof j.settings !== "object" || j.settings === null) return null;
    return { savedAt: j.savedAt, settings: parseSettings(j.settings) };
  } catch {
    return null;
  }
}

export interface RemovableStorage extends StorageLike {
  removeItem(k: string): void;
}
export function forgetPrefs(storage: RemovableStorage | null): void {
  try {
    storage?.removeItem(PREFS_KEY);
  } catch {
    // nothing to forget
  }
}

/** What "Reset preferences" goes back to: the saved snapshot, else the app's defaults. */
export const resetTarget = (saved: SavedPrefs | null): ChartSettings => (saved ? saved.settings : parseSettings(null));

