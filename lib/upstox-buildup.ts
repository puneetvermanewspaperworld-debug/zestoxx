import {
  OPTION_UNDERLYINGS,
  UPSTOX_BASE,
  authHeaders,
  fetchOptionChain,
  fetchOptionExpiries,
  istToday,
} from "./upstox";
import { memoized } from "./upstox-movers";
import {
  barTime,
  legInWindow,
  resolveWindow,
  type BuildupWindowResponse,
  type MinuteBar,
  type WindowQuery,
} from "./buildup-window";
import type { ChainRow, OptionLeg } from "./options";

/**
 * Buildup over an intraday window. Server-only.
 *
 * Per-minute candles are the one Upstox feed that punishes bursts: a few hundred parallel
 * calls got this IP a Cloudflare "error 1015" ban with a ~5 minute Retry-After. So this module
 *   - only fetches the strikes around the money (BAND each side), nearest first,
 *   - paces requests (a fixed gap between starts, few in flight),
 *   - caches every contract's bars (a finished session never changes, a live one is re-read
 *     once a minute), and
 *   - on a 429 stops immediately, remembers the Retry-After, and refuses to call Upstox again
 *     until it has passed — answering with what it already has rather than hammering.
 */

const BAND = 12;
const GAP_MS = 160; // between request starts → ≤ ~6 requests/s
const CONCURRENCY = 3;
const LIVE_TTL = 60_000;
const DONE_TTL = 6 * 3_600_000;
const SESSION_PROBE_TTL = 45_000; // short: a pre-open "no bars yet" answer must not outlive the open
const PROBE_LOOKBACK_DAYS = 6;

/* ----------------------------------------------------------- rate control ---- */

class RateLimited extends Error {
  constructor(readonly retryAfterSec: number) {
    super(`rate limited, retry in ${retryAfterSec}s`);
  }
}

let blockedUntil = 0;
let nextSlot = 0;

/** Seconds left of a back-off, or 0. */
export const backoffSeconds = (): number => Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));

async function pace(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + GAP_MS;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

async function getCandles(token: string, path: string): Promise<(string | number)[][]> {
  if (backoffSeconds() > 0) throw new RateLimited(backoffSeconds());
  await pace();
  const res = await fetch(`${UPSTOX_BASE}${path}`, { headers: authHeaders(token), cache: "no-store" });
  if (res.status === 429) {
    const retry = Math.min(600, Math.max(30, Number(res.headers.get("retry-after")) || 120));
    blockedUntil = Date.now() + retry * 1000;
    throw new RateLimited(retry);
  }
  if (!res.ok) throw new Error(`upstox candles ${res.status}`);
  return ((await res.json()) as { data?: { candles?: (string | number)[][] } }).data?.candles ?? [];
}

/* ------------------------------------------------------------------- bars ---- */

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

/** Upstox candles are `[stamp, o, h, l, c, volume, oi]`, newest first. Returns oldest first. */
function toBars(candles: (string | number)[][]): MinuteBar[] {
  const out: MinuteBar[] = [];
  for (const c of candles) {
    const t = barTime(String(c[0]));
    if (t) out.push({ date: t.date, m: t.m, o: num(c[1]), c: num(c[4]), v: num(c[5]), oi: num(c[6]) });
  }
  return out.reverse();
}

interface Session {
  date: string;
  live: boolean;
}

const addDays = (iso: string, n: number): string => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

const enc = encodeURIComponent;

/**
 * Which trading day to read. Today's bars come from the intraday endpoint while the day is
 * in progress (and until midnight). Outside that — weekends, holidays, pre-open — fall back to
 * the latest earlier day the history endpoint has minute bars for, which lags by about a day.
 */
function resolveSession(token: string, probeKey: string): Promise<Session | null> {
  return memoized(`bw:session:${probeKey}:${istToday()}`, SESSION_PROBE_TTL, async () => {
    const today = await getCandles(token, `/v3/historical-candle/intraday/${enc(probeKey)}/minutes/1`);
    const todayBars = toBars(today).filter((b) => b.date === istToday());
    if (todayBars.length > 0) return { date: istToday(), live: true };

    const to = addDays(istToday(), -1);
    const from = addDays(istToday(), -PROBE_LOOKBACK_DAYS);
    const hist = toBars(await getCandles(token, `/v3/historical-candle/${enc(probeKey)}/minutes/1/${to}/${from}`));
    const latest = hist.reduce((d, b) => (b.date > d ? b.date : d), "");
    return latest ? { date: latest, live: false } : null;
  });
}

function barsFor(token: string, key: string, session: Session): Promise<MinuteBar[]> {
  return memoized(`bw:bars:${session.date}:${key}`, session.live ? LIVE_TTL : DONE_TTL, async () => {
    const path = session.live
      ? `/v3/historical-candle/intraday/${enc(key)}/minutes/1`
      : `/v3/historical-candle/${enc(key)}/minutes/1/${session.date}/${session.date}`;
    return toBars(await getCandles(token, path)).filter((b) => b.date === session.date);
  });
}

/* ---------------------------------------------------------------- the query -- */

const EMPTY_LEG: OptionLeg = { ltp: 0, prevClose: 0, oi: 0, prevOi: 0, volume: 0, iv: 0 };

const unavailable = (reason: string): BuildupWindowResponse => ({ source: "unavailable", reason });

export async function buildupWindow(
  token: string,
  underlying: string,
  expiry: string | null,
  query: WindowQuery
): Promise<BuildupWindowResponse> {
  const underlyingKey = OPTION_UNDERLYINGS[underlying];
  if (!underlyingKey) return unavailable("unknown underlying");

  const { expiries } = await fetchOptionExpiries(token, underlyingKey);
  const exp = expiry && expiries.includes(expiry) ? expiry : expiries[0];
  if (!exp) return unavailable("no expiry");
  const chain = await fetchOptionChain(token, underlyingKey, exp);
  if (chain.rows.length === 0 || chain.spot <= 0) return unavailable("no option chain");

  // The strikes around the money, nearest first.
  const atmIdx = chain.rows.reduce(
    (best, r, i) => (Math.abs(r.strike - chain.spot) < Math.abs(chain.rows[best].strike - chain.spot) ? i : best),
    0
  );
  const band = chain.rows.slice(Math.max(0, atmIdx - BAND), atmIdx + BAND + 1);
  const nearestFirst = [...band].sort(
    (a, b) => Math.abs(a.strike - chain.spot) - Math.abs(b.strike - chain.spot)
  );

  const probeKey = chain.rows[atmIdx].call.key;
  if (!probeKey) return unavailable("no instrument key");

  try {
    const session = await resolveSession(token, probeKey);
    if (!session) return unavailable("no minute data for any recent session");

    const probeBars = await barsFor(token, probeKey, session);
    const win = resolveWindow(probeBars, query);
    if (!win) return unavailable("that window has no data");

    const legBars = new Map<string, MinuteBar[]>();
    let partial = false;
    const queue = nearestFirst.flatMap((r) => [r.call.key, r.put.key]).filter((k): k is string => !!k);
    const worker = async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        if (partial) return;
        try {
          legBars.set(key, await barsFor(token, key, session));
        } catch (err) {
          if (err instanceof RateLimited) partial = true;
          // any other failure just leaves that contract unclassified
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const leg = (l: OptionLeg): OptionLeg => {
      const bars = l.key ? legBars.get(l.key) : undefined;
      return (bars && legInWindow(bars, win.from, win.to)) || EMPTY_LEG;
    };
    const rows: ChainRow[] = band.map((r) => ({ strike: r.strike, call: leg(r.call), put: leg(r.put) }));

    return {
      source: "live",
      date: session.date,
      liveSession: session.live,
      firstMin: probeBars[0].m,
      lastMin: probeBars[probeBars.length - 1].m + 1,
      from: win.from,
      to: win.to,
      rows,
      partial,
    };
  } catch (err) {
    if (err instanceof RateLimited) {
      return unavailable(`Upstox is rate-limiting minute data — try again in about ${Math.ceil(err.retryAfterSec / 60)} min`);
    }
    throw err;
  }
}
