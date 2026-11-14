import { parseDrawings, type Drawing } from "./drawings";

/**
 * Where drawings are kept. They are saved in the browser, on each device, per symbol: the app has one shared demo user, so putting
 * them in the database now would show everyone's drawings to every visitor. Everything that touches storage is in this one module,
 * behind the small async `DrawingStore` interface, so it can be swapped for a database-backed store when accounts exist without
 * touching the chart.
 */
export interface DrawingStore {
  load(symbol: string): Promise<Drawing[]>;
  save(symbol: string, drawings: Drawing[]): Promise<void>;
}

export const STORAGE_VERSION = 1;
export const storageKey = (symbol: string): string => `zestoxx:drawings:v${STORAGE_VERSION}:${symbol}`;

/** The part of localStorage this module needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const browserStorage = (): StorageLike | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // private mode, blocked site data
  }
};

/** A store in the browser's localStorage. Every read and write is guarded: with storage unavailable, drawings simply are not kept. */
export function localDrawingStore(storage: StorageLike | null | (() => StorageLike | null) = browserStorage): DrawingStore {
  const get = () => (typeof storage === "function" ? storage() : storage);
  return {
    async load(symbol) {
      try {
        const raw = get()?.getItem(storageKey(symbol));
        if (!raw) return [];
        const parsed = JSON.parse(raw) as { v?: number; drawings?: unknown };
        return parsed && parsed.v === STORAGE_VERSION ? parseDrawings(parsed.drawings) : [];
      } catch {
        return [];
      }
    },
    async save(symbol, drawings) {
      try {
        const s = get();
        if (!s) return;
        if (drawings.length === 0) s.removeItem(storageKey(symbol));
        else s.setItem(storageKey(symbol), JSON.stringify({ v: STORAGE_VERSION, drawings }));
      } catch {
        // quota or blocked: not kept, nothing else is affected
      }
    },
  };
}

export interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/**
 * A debounced autosave: `schedule` keeps only the latest drawings and writes them `delayMs` after the last change, so a drag is one
 * write, not hundreds. `flush` writes at once (leaving the page); `cancel` forgets what is pending.
 */
export function createAutosaver(store: DrawingStore, symbol: string, delayMs = 600, timers: Timers = realTimers) {
  let pending: Drawing[] | null = null;
  let handle: unknown = null;
  const write = async () => {
    handle = null;
    if (pending === null) return;
    const d = pending;
    pending = null;
    await store.save(symbol, d);
  };
  return {
    schedule(drawings: Drawing[]) {
      pending = drawings;
      if (handle !== null) timers.clear(handle);
      handle = timers.set(() => void write(), delayMs);
    },
    async flush() {
      if (handle !== null) timers.clear(handle);
      await write();
    },
    cancel() {
      if (handle !== null) timers.clear(handle);
      handle = null;
      pending = null;
    },
    get pending() {
      return pending !== null;
    },
  };
}
