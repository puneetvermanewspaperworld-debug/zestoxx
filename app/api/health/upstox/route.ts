import { NextResponse } from "next/server";
import { upstoxToken } from "@/lib/upstox";

/**
 * TEMPORARY — delete this file once production's Upstox feed is diagnosed.
 *
 * Makes one cheap Upstox call from the server and reports only what happened:
 *
 *   GET /api/health/upstox  ->  { status: number | null, error: string | null }
 *
 *   status 200, error null   Upstox accepted the token — the problem is elsewhere
 *   status 401 / 403         Upstox rejected the token (expired, revoked, or pasted wrong)
 *   status 429               Upstox or its edge is rate-limiting this server
 *   status null              the call never got an answer — see `error`
 *                            ("UPSTOX_ANALYTICS_TOKEN is not set" = the variable didn't reach this
 *                            deployment; anything else is a network failure)
 *
 * The token is never returned, and any echo of it in an error message is redacted. The result is
 * cached for 10 s so this route can't be used to hammer Upstox.
 */
const TTL_MS = 10_000;
const TIMEOUT_MS = 8_000;
// A cheap, always-valid request: last price of the Nifty 50 index.
const URL_ = "https://api.upstox.com/v3/market-quote/ltp?instrument_key=NSE_INDEX%7CNifty%2050";

let cached: { at: number; body: { status: number | null; error: string | null } } | null = null;

const reply = (body: { status: number | null; error: string | null }) =>
  NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });

export async function GET() {
  if (cached && Date.now() - cached.at < TTL_MS) return reply(cached.body);

  const token = upstoxToken();
  let body: { status: number | null; error: string | null };

  if (!token) {
    body = { status: null, error: "UPSTOX_ANALYTICS_TOKEN is not set" };
  } else {
    const redact = (s: string) => s.split(token).join("[redacted]").slice(0, 300);
    try {
      const res = await fetch(URL_, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) body = { status: res.status, error: null };
      else {
        // Upstox error bodies look like {"status":"error","errors":[{"errorCode":"…","message":"…"}]};
        // Cloudflare rate limits are JSON with a `detail`. Fall back to the status text.
        let message = res.statusText || "request failed";
        try {
          const j = (await res.json()) as { errors?: { message?: string }[]; detail?: string; message?: string };
          message = j.errors?.[0]?.message ?? j.detail ?? j.message ?? message;
        } catch {
          // non-JSON body: keep the status text
        }
        body = { status: res.status, error: redact(message) };
      }
    } catch (err) {
      body = { status: null, error: redact(err instanceof Error ? err.message : "request failed") };
    }
  }

  cached = { at: Date.now(), body };
  return reply(body);
}
