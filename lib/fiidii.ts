import { seededRandom, strSeed } from "./helpers";

/**
 * FII / DII activity.
 *
 * ⚠ SIMULATED. NSE publishes real FII/DII figures but blocks direct scraping, and no
 * ingest is wired up yet (see app/api/fiidii/route.ts) — so everything here is a
 * deterministic, plausible-looking generator and the UI labels it "Simulated data".
 * The shapes match what a real NSE ingest would produce so it can drop in later.
 *
 * Each calendar day is seeded by its own date, so a given day's numbers never change
 * as time passes (the old generator shifted the whole history every day).
 */

export type Entity = "FII" | "DII";
export type Segment = "cash" | "derivatives";
export type Interval = "daily" | "weekly" | "monthly";

export interface Flow {
  buy: number;
  sell: number;
  net: number;
}

export interface FiiDiiDay {
  /** YYYY-MM-DD, weekdays only */
  date: string;
  fii: { cash: Flow; derivatives: Flow };
  dii: { cash: Flow; derivatives: Flow };
  /** Nifty 50 change that day, % */
  niftyChgPct: number;
  /** FII index-futures long share of open contracts, % (short = 100 − long) */
  fiiIdxFutLongPct: number;
}

const DAY = 86_400_000;

const flow = (buy: number, sell: number): Flow => ({ buy, sell, net: buy - sell });

/** Oldest → newest weekdays ending at `anchor`'s local calendar date. */
export function buildFiiDii(days = 460, anchor: Date = new Date()): FiiDiiDay[] {
  const end = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const out: FiiDiiDay[] = [];
  for (let i = 0; i < days; i++) {
    const ms = end - i * DAY;
    const dow = new Date(ms).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const date = new Date(ms).toISOString().slice(0, 10);
    const r = seededRandom(strSeed(`fiidii:v2:${date}`));

    // Cash market (₹ Cr): FIIs choppier and more often net sellers, DIIs steadier buyers.
    const fiiCash = flow(8000 + r() * 6000, 8000 + r() * 6000 + (r() > 0.55 ? r() * 2500 : 0));
    const diiCash = flow(6000 + r() * 5000 + (r() > 0.5 ? r() * 2000 : 0), 6000 + r() * 5000);

    // Derivatives (index F&O turnover, ₹ Cr): bigger gross, FIIs swing harder.
    const fiiDerivNet = (r() - 0.5) * 14000;
    const fiiDerivBuy = 20000 + r() * 15000;
    const diiDerivNet = (r() - 0.5) * 4000;
    const diiDerivBuy = 6000 + r() * 6000;

    // Long share of FII index futures drifts slowly with the calendar, plus daily noise.
    const dayIndex = Math.floor(ms / DAY);
    const longPct = Math.max(
      12,
      Math.min(88, 48 + 20 * Math.sin(dayIndex / 11) + 8 * Math.sin(dayIndex / 3.7) + (r() - 0.5) * 6)
    );

    // Nifty's move leans with combined cash flows, plus idiosyncratic noise.
    const nifty = ((fiiCash.net + diiCash.net) / 9000) * 0.5 + (r() - 0.5) * 1.2;

    out.push({
      date,
      fii: { cash: fiiCash, derivatives: flow(fiiDerivBuy, fiiDerivBuy - fiiDerivNet) },
      dii: { cash: diiCash, derivatives: flow(diiDerivBuy, diiDerivBuy - diiDerivNet) },
      niftyChgPct: Math.max(-2.5, Math.min(2.5, nifty)),
      fiiIdxFutLongPct: longPct,
    });
  }
  return out.reverse();
}

/* ------------------------------------------------------------ aggregation ---- */

export interface FlowRow {
  key: string;
  /** compact axis/table label */
  label: string;
  niftyChgPct: number;
  buy: number;
  sell: number;
  net: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayLabel = (iso: string) => `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;

/** Monday of the week containing `iso`, as YYYY-MM-DD. */
function weekStart(iso: string): string {
  const ms = Date.parse(iso);
  const dow = new Date(ms).getUTCDay();
  return new Date(ms - ((dow + 6) % 7) * DAY).toISOString().slice(0, 10);
}

const LIMITS: Record<Interval, number> = { daily: 60, weekly: 26, monthly: 12 };

/**
 * One row per day / ISO week / calendar month for the chosen entity + segment, newest
 * last. The Nifty column compounds the daily moves across the period.
 */
export function aggregateFlows(
  days: FiiDiiDay[],
  interval: Interval,
  entity: Entity,
  segment: Segment
): FlowRow[] {
  const pick = (d: FiiDiiDay): Flow => (entity === "FII" ? d.fii : d.dii)[segment];

  if (interval === "daily") {
    return days.slice(-LIMITS.daily).map((d) => {
      const f = pick(d);
      return { key: d.date, label: dayLabel(d.date), niftyChgPct: d.niftyChgPct, ...f };
    });
  }

  const groups = new Map<string, FiiDiiDay[]>();
  for (const d of days) {
    const k = interval === "weekly" ? weekStart(d.date) : d.date.slice(0, 7);
    const g = groups.get(k);
    if (g) g.push(d);
    else groups.set(k, [d]);
  }

  const ordered = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  // The oldest period is usually cut off where our history begins; showing it as a full
  // week/month would understate its flows, so drop it when it starts mid-period.
  const first = ordered[0]?.[1][0]?.date;
  if (first) {
    const dow = new Date(Date.parse(first)).getUTCDay();
    const startsMidPeriod = interval === "weekly" ? dow !== 1 : Number(first.slice(8, 10)) > 3;
    if (startsMidPeriod) ordered.shift();
  }

  return ordered
    .slice(-LIMITS[interval])
    .map(([key, g]) => {
      const buy = g.reduce((s, d) => s + pick(d).buy, 0);
      const sell = g.reduce((s, d) => s + pick(d).sell, 0);
      const compounded = g.reduce((acc, d) => acc * (1 + d.niftyChgPct / 100), 1);
      return {
        key,
        label: interval === "weekly" ? dayLabel(g[g.length - 1].date) : monthLabel(key),
        niftyChgPct: (compounded - 1) * 100,
        buy,
        sell,
        net: buy - sell,
      };
    });
}
