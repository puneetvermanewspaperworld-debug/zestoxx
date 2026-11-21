/**
 * A small fixed-window rate limiter, kept in memory. On a serverless host each instance has its own count, so it is a best-effort brake on
 * one visitor hammering a route (and through it the Upstox feed), not an exact quota. Old windows are dropped as new ones are opened.
 */
export function makeLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; resetAt: number }>();
  return function allow(key: string, now: number = Date.now()): { ok: boolean; retryAfterS: number } {
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    const cur = hits.get(key);
    if (!cur || cur.resetAt <= now) {
      hits.set(key, { n: 1, resetAt: now + windowMs });
      return { ok: true, retryAfterS: 0 };
    }
    cur.n++;
    return cur.n <= max ? { ok: true, retryAfterS: 0 } : { ok: false, retryAfterS: Math.ceil((cur.resetAt - now) / 1000) };
  };
}
