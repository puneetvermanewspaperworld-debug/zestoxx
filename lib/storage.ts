/**
 * Drop-in replacement for the artifact sandbox's `window.storage` key-value API.
 * Backed by `localStorage` so a paper-trading portfolio survives a refresh in this
 * browser. The handoff brief calls for swapping this for real API routes backed by
 * Prisma/Supabase once accounts exist — this keeps the same async shape so that swap
 * is a one-file change.
 */
const KEY_PREFIX = "";

export interface StorageResult {
  value: string | null;
}

export const storage = {
  async get(key: string): Promise<StorageResult> {
    if (typeof window === "undefined") return { value: null };
    try {
      return { value: window.localStorage.getItem(KEY_PREFIX + key) };
    } catch {
      return { value: null };
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY_PREFIX + key, value);
    } catch {
      // storage full or blocked — non-fatal, portfolio just won't persist
    }
  },
};
