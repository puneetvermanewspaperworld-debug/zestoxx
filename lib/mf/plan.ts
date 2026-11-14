/**
 * Which days the NAV history is filled for. Daily for the last DAILY_DAYS calendar days (weekdays only; AMFI publishes on business
 * days), then one day a week, the Friday, for the years before that, back to TOTAL_DAYS (a little over five years, so a 5-year
 * return has its starting NAV). A Friday that was a holiday has no NAVs: the backfill falls back to the day before (see FALLBACK_DAYS).
 */
export const DAILY_DAYS = 400;
export const TOTAL_DAYS = 1_900;
export const FALLBACK_DAYS = [0, 1, 2] as const;

export interface PlannedDay {
  /** YYYY-MM-DD */
  date: string;
  kind: "daily" | "weekly";
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Days to fill, newest first. `today` is YYYY-MM-DD. */
export function planDays(today: string, opts: { dailyDays?: number; totalDays?: number } = {}): PlannedDay[] {
  const dailyDays = opts.dailyDays ?? DAILY_DAYS;
  const totalDays = opts.totalDays ?? TOTAL_DAYS;
  const t0 = Date.parse(`${today}T00:00:00Z`);
  const out: PlannedDay[] = [];
  for (let i = 0; i < totalDays; i++) {
    const t = t0 - i * DAY;
    const wd = new Date(t).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    if (i < dailyDays) out.push({ date: iso(t), kind: "daily" });
    else if (wd === 5) out.push({ date: iso(t), kind: "weekly" });
  }
  return out;
}

/** The dates to try for one planned day: the day itself, then (weekly only) the one or two days before it. */
export function candidates(p: PlannedDay): string[] {
  if (p.kind === "daily") return [p.date];
  const t = Date.parse(`${p.date}T00:00:00Z`);
  return FALLBACK_DAYS.map((d) => iso(t - d * DAY));
}

/** Rough storage for the NAV table: a heap row of about 48 bytes plus about 32 bytes of primary-key index. An estimate, not a measurement. */
export const BYTES_PER_NAV_ROW = 80;
