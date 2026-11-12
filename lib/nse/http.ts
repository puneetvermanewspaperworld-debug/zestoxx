/**
 * The plain-GET-with-retry used by every NSE ingest. Ordinary request headers, nothing else; a 404 is returned (a holiday, a
 * weekend, not published yet), anything else that is not a clean 200 is retried after a delay and then reported.
 */

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export type Fetcher = (url: string) => Promise<{ status: number; body: string }>;

/** Wait before the 2nd and 3rd attempt. */
export const RETRY_DELAYS_MS = [3_000, 8_000];

export interface HttpDeps {
  fetcher: Fetcher;
  sleep: (ms: number) => Promise<void>;
  log: (level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) => void;
}

export type Attempt<T> = { kind: "ok"; value: T } | { kind: "not-found" } | { kind: "failed"; reason: string };

/** GET `url`, parse it, and retry a transient failure (network error, 5xx/429/403, an unparseable body) after a delay. A 404 is returned, not retried. */
export async function getWithRetry<T>(deps: HttpDeps, what: string, url: string, parse: (body: string) => T): Promise<Attempt<T>> {
  let reason = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await deps.sleep(RETRY_DELAYS_MS[attempt - 1]);
    try {
      const res = await deps.fetcher(url);
      if (res.status === 404) return { kind: "not-found" };
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return { kind: "ok", value: parse(res.body) };
    } catch (e) {
      reason = e instanceof ParseError ? `unexpected content: ${e.message}` : e instanceof Error ? e.message.slice(0, 160) : "failed";
      deps.log(attempt < RETRY_DELAYS_MS.length ? "warn" : "error", `${what}: attempt ${attempt + 1} failed`, { url, reason });
    }
  }
  return { kind: "failed", reason };
}

/** Ordinary browser-like headers for NSE's public files. */
export const NSE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json,text/csv,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

/** The real fetcher: one plain GET with a 15 s timeout. */
export const nseFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: NSE_HEADERS, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(15_000) });
  return { status: res.status, body: await res.text() };
};
