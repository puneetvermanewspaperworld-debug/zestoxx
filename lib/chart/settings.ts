import { isChartType, type ChartType } from "./charttypes";
import { TOOLS } from "./drawings";
import { isThemeId, type ThemeId } from "./theme";
import { INSTANCE_COLORS, STUDY_MAP, checkParams, defaultParams, type StudyInstance } from "./studies";

/**
 * What the Trade page chart remembers on this device: the chart type, the Renko brick size chosen for each symbol, the studies and their
 * parameters, the price scale (and whether it is inverted), grid, crosshair, the theme, the starred drawing tools and studies, and the interval and
 * range last used. Kept in this browser only. Whatever is read back is
 * checked, and anything that does not make sense is replaced by its default, so a damaged or old entry can never break the chart.
 */
export type ScaleMode = "normal" | "log" | "percent";

export interface ChartSettings {
  type: ChartType;
  /** the brick size the user confirmed, per symbol; never worked out again from the data */
  renko: Record<string, number>;
  studies: StudyInstance[];
  scale: ScaleMode;
  grid: boolean;
  /** crosshair snaps to the open, high, low or close of the candle */
  magnet: boolean;
  interval: string | null;
  range: string | null;
  /** the price axis upside down: higher prices lower on the screen */
  invert: boolean;
  /** the chart's own light or dark look */
  theme: ThemeId;
  /** the drawing tools starred to the top of the tool rail, in the order they were starred */
  favTools: string[];
  /** the studies starred to the top of the studies list */
  favStudies: string[];
}

export const SETTINGS_KEY = "zestoxx:chart-settings:v1";
export const MAX_STUDIES = 12;

/** What the chart opened with before studies could be chosen: two moving averages and volume. */
export const DEFAULT_STUDIES: StudyInstance[] = [
  { uid: 1, id: "sma", params: { n: 10 }, color: INSTANCE_COLORS[0] },
  { uid: 2, id: "sma", params: { n: 30 }, color: INSTANCE_COLORS[1] },
  { uid: 3, id: "volume", params: {} },
];

/** The theme a device starts with when it has not chosen one: dark on the phone chart page, light everywhere else (desktop is as it was). */
export const defaultTheme = (phone: boolean): ThemeId => (phone ? "dark" : "light");

export const DEFAULT_SETTINGS: ChartSettings = { type: "candle", renko: {}, studies: DEFAULT_STUDIES, scale: "normal", grid: true, magnet: false, interval: null, range: null, invert: false, theme: "light", favTools: [], favStudies: [] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The drawing tools that can be starred: every tool but Select (which is always first). */
export const FAVOURITE_TOOL_IDS: string[] = TOOLS.filter((x) => x.id !== "select").map((x) => x.id);

/** A list of ids from storage: only known ones, once each, in order. */
function idList(raw: unknown, known: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) if (typeof v === "string" && known.includes(v) && !out.includes(v)) out.push(v);
  return out;
}

/** Settings from whatever was stored: valid parts are kept, the rest fall back to the defaults (`phone`: the phone's, which differ only in the theme). */
export function parseSettings(raw: unknown, phone = false): ChartSettings {
  const base: ChartSettings = { ...DEFAULT_SETTINGS, theme: defaultTheme(phone), renko: {}, favTools: [], favStudies: [], studies: DEFAULT_STUDIES.map((s) => ({ ...s, params: { ...s.params } })) };
  if (!isObj(raw)) return base;
  const out = { ...base };
  if (isChartType(raw.type)) out.type = raw.type;
  if (isObj(raw.renko)) {
    const r: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.renko)) if (typeof v === "number" && Number.isFinite(v) && v > 0 && k.length <= 20) r[k] = v;
    out.renko = r;
  }
  if (Array.isArray(raw.studies)) {
    const seen = new Set<number>();
    const studies: StudyInstance[] = [];
    for (const s of raw.studies.slice(0, MAX_STUDIES)) {
      if (!isObj(s) || typeof s.id !== "string" || !STUDY_MAP[s.id] || typeof s.uid !== "number" || !Number.isInteger(s.uid) || seen.has(s.uid)) continue;
      const def = STUDY_MAP[s.id];
      const chk = checkParams(def, { ...defaultParams(def), ...(isObj(s.params) ? s.params : {}) });
      if (!chk.ok) continue; // a study whose saved parameters are not valid any more is dropped, not repaired
      seen.add(s.uid);
      studies.push({ uid: s.uid, id: s.id, params: chk.values, ...(typeof s.color === "string" && /^#[0-9a-fA-F]{6}$/.test(s.color) ? { color: s.color } : {}) });
    }
    out.studies = studies;
  }
  if (raw.scale === "normal" || raw.scale === "log" || raw.scale === "percent") out.scale = raw.scale;
  if (typeof raw.grid === "boolean") out.grid = raw.grid;
  if (typeof raw.magnet === "boolean") out.magnet = raw.magnet;
  if (typeof raw.interval === "string" && raw.interval.length <= 6) out.interval = raw.interval;
  if (typeof raw.range === "string" && raw.range.length <= 6) out.range = raw.range;
  if (typeof raw.invert === "boolean") out.invert = raw.invert;
  if (isThemeId(raw.theme)) out.theme = raw.theme;
  out.favTools = idList(raw.favTools, FAVOURITE_TOOL_IDS);
  out.favStudies = idList(raw.favStudies, Object.keys(STUDY_MAP));
  return out;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function loadSettings(storage: StorageLike | null, phone = false): ChartSettings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    return parseSettings(raw ? JSON.parse(raw) : null, phone);
  } catch {
    return parseSettings(null, phone);
  }
}

export function saveSettings(storage: StorageLike | null, s: ChartSettings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage is full or blocked: the chart still works, it just will not remember
  }
}

/** The next uid for a study added to the list. */
export const nextUid = (studies: readonly StudyInstance[]): number => studies.reduce((m, s) => Math.max(m, s.uid), 0) + 1;
