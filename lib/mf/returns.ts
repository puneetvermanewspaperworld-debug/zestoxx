/**
 * Returns from stored NAVs: 1 month, 6 months and 1 year as plain percentage change; 3 and 5 years annualised (CAGR). Each uses the
 * last stored NAV on or before the date that far back from the newest NAV's date, and only if that NAV is within TOLERANCE_DAYS of
 * the target (older data is stored weekly). A period the scheme has not existed for, or with no NAV near enough, is null: nothing
 * is estimated.
 */
export interface NavPoint {
  /** YYYY-MM-DD */
  date: string;
  nav: number;
}

export type PeriodId = "1m" | "6m" | "1y" | "3y" | "5y";
export const PERIODS: { id: PeriodId; label: string; months: number; annualised: boolean }[] = [
  { id: "1m", label: "1 month", months: 1, annualised: false },
  { id: "6m", label: "6 months", months: 6, annualised: false },
  { id: "1y", label: "1 year", months: 12, annualised: false },
  { id: "3y", label: "3 years", months: 36, annualised: true },
  { id: "5y", label: "5 years", months: 60, annualised: true },
];

export const TOLERANCE_DAYS = 7;

export type Returns = Record<PeriodId, number | null>;

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** `iso` minus `n` calendar months, the day clamped to the end of a shorter month (31 May - 1 month = 30 Apr). */
export function subtractMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) - n;
  const ty = Math.floor(total / 12);
  const tm = total - ty * 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** The last point on or before `date` (points sorted oldest first), or null when there is none or it is more than `tolerance` days before. */
export function navOnOrBefore(points: NavPoint[], date: string, tolerance = TOLERANCE_DAYS): NavPoint | null {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].date <= date) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  return (ms(date) - ms(points[found].date)) / DAY <= tolerance ? points[found] : null;
}

/** All five returns as of the newest NAV. `points` must be sorted oldest first. */
export function returnsOf(points: NavPoint[]): Returns {
  const out: Returns = { "1m": null, "6m": null, "1y": null, "3y": null, "5y": null };
  const last = points[points.length - 1];
  if (!last || !(last.nav > 0)) return out;
  for (const p of PERIODS) {
    const start = navOnOrBefore(points, subtractMonths(last.date, p.months));
    if (!start || !(start.nav > 0)) continue;
    const growth = last.nav / start.nav;
    out[p.id] = p.annualised ? (Math.pow(growth, 12 / p.months) - 1) * 100 : (growth - 1) * 100;
  }
  return out;
}
