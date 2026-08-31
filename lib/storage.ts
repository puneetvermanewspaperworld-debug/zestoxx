/**
 * Same `get(key)` / `set(key, value)` shape the terminal has always used (it began as
 * the artifact sandbox's `window.storage`), but now backed by the Prisma database
 * through `/api/portfolio` instead of `localStorage`. Components are unchanged.
 *
 * Only the "zestoxx:portfolio" key is understood — that's the single blob the app
 * persists. Anything else no-ops (and warns in dev).
 */
const PORTFOLIO_KEY = "zestoxx:portfolio";

export interface StorageResult {
  value: string | null;
}

export const storage = {
  async get(key: string): Promise<StorageResult> {
    if (key !== PORTFOLIO_KEY) return { value: null };
    if (typeof window === "undefined") return { value: null };
    try {
      const res = await fetch("/api/portfolio", { cache: "no-store" });
      if (!res.ok) return { value: null };
      const data = await res.json();
      // `data` is a PortfolioBlob or null; the caller expects a JSON string or null.
      return { value: data ? JSON.stringify(data) : null };
    } catch {
      // API/DB unreachable — start fresh rather than crash.
      return { value: null };
    }
  },

  async set(key: string, value: string): Promise<void> {
    if (key !== PORTFOLIO_KEY) return;
    if (typeof window === "undefined") return;
    try {
      await fetch("/api/portfolio", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: value, // already a JSON string of the portfolio blob
        keepalive: true,
      });
    } catch {
      // non-fatal — the in-memory portfolio keeps working, it just won't persist
    }
  },
};
