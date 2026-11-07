/**
 * When the Indian equity-derivatives market (NSE F&O) trades: regular hours, exchange holidays and
 * special sessions. Everything that asks "is the market open?" goes through here — the top bar, the
 * analyzer's polling and its Live/Delayed explanation, and "the last close" for delayed prices.
 *
 * SOURCE (re-check when NSE publishes a revision or at the start of each year):
 *   - Holidays: NSE trading-holiday list for the Equity Derivatives (F&O) segment
 *       https://www.nseindia.com/resources/exchange-communication-holidays
 *       (the data behind it: https://www.nseindia.com/api/holiday-master?type=trading, segment "FO")
 *   - Muhurat session: NSE circular NSE/FAOP/76940 (19 Oct 2026), "Muhurat Trading session on account
 *       of Diwali": pre-open 14:05–14:20, normal market 14:20–15:40 on Sunday 8 Nov 2026.
 *       (The holiday list marks 8 Nov with an asterisk — "Diwali Laxmi Pujan*" — meaning special timings.)
 *
 * `npm run check:holidays` diffs this table against NSE's live list.
 *
 * Coverage is 2026 only. For a date in another year the helper falls back to plain weekday hours and
 * `calendarCovers()` says so, so the UI can admit it doesn't know that year's holidays.
 */

export const CALENDAR = {
  year: 2026,
  /** the date this table was last checked against NSE's published list and circular */
  verifiedOn: "2026-11-07",
  sourceUrl: "https://www.nseindia.com/resources/exchange-communication-holidays",
  muhuratCircular: "NSE/FAOP/76940",
} as const;

/** Trading holidays, Equity Derivatives segment. Some fall on weekends; they're listed because NSE lists them. */
export const HOLIDAYS: Record<string, string> = {
  "2026-01-15": "Municipal Corporation Election - Maharashtra",
  "2026-01-26": "Republic Day",
  "2026-02-15": "Mahashivratri",
  "2026-03-03": "Holi",
  "2026-03-21": "Id-Ul-Fitr (Ramadan Eid)",
  "2026-03-26": "Shri Ram Navami",
  "2026-03-31": "Shri Mahavir Jayanti",
  "2026-04-03": "Good Friday",
  "2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
  "2026-05-01": "Maharashtra Day",
  "2026-05-28": "Bakri Id",
  "2026-06-26": "Muharram",
  "2026-08-15": "Independence Day",
  "2026-09-14": "Ganesh Chaturthi",
  "2026-10-02": "Mahatma Gandhi Jayanti",
  "2026-10-20": "Dussehra",
  "2026-11-08": "Diwali Laxmi Pujan",
  "2026-11-10": "Diwali-Balipratipada",
  "2026-11-24": "Prakash Gurpurb Sri Guru Nanak Dev",
  "2026-12-25": "Christmas",
};

export interface SessionWindow {
  /** minutes after midnight IST */
  open: number;
  close: number;
}

/** Regular weekday hours: 09:15–15:30 IST. */
export const REGULAR: SessionWindow = { open: 9 * 60 + 15, close: 15 * 60 + 30 };

/** Special sessions on days that would otherwise be closed (or have different hours). */
export const SPECIAL_SESSIONS: Record<string, SessionWindow & { label: string }> = {
  "2026-11-08": { open: 14 * 60 + 20, close: 15 * 60 + 40, label: "Diwali Muhurat trading" },
};

/* ------------------------------------------------------------------- dates -- */

const IST_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;

export interface IstParts {
  /** YYYY-MM-DD in IST */
  date: string;
  /** 0 = Sunday */
  weekday: number;
  /** minutes after midnight IST */
  minutes: number;
}

export function istParts(now: Date): IstParts {
  const d = new Date(now.getTime() + IST_MS);
  return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();
const shift = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Whether the table knows this date's year. Outside it the helper falls back to weekday hours only. */
export const calendarCovers = (date: string): boolean => date.startsWith(`${CALENDAR.year}-`);

/* ---------------------------------------------------------------- sessions -- */

export type DayKind = "regular" | "special" | "holiday" | "weekend";

export interface DaySession {
  date: string;
  kind: DayKind;
  /** the trading window, null when the market is shut all day */
  window: SessionWindow | null;
  /** why it is shut ("Dussehra", "Weekend") or what the special session is */
  reason: string | null;
}

export function sessionOn(date: string): DaySession {
  const special = SPECIAL_SESSIONS[date];
  if (special) return { date, kind: "special", window: { open: special.open, close: special.close }, reason: special.label };
  const holiday = HOLIDAYS[date];
  if (holiday) return { date, kind: "holiday", window: null, reason: holiday };
  const wd = weekdayOf(date);
  if (wd === 0 || wd === 6) return { date, kind: "weekend", window: null, reason: "Weekend" };
  return { date, kind: "regular", window: REGULAR, reason: null };
}

export const isTradingDay = (date: string): boolean => sessionOn(date).window !== null;

/** The closest trading day strictly before `date` (e.g. a weekly expiry that lands on a holiday moves here). */
export function previousTradingDay(date: string): string {
  let d = shift(date, -1);
  for (let i = 0; i < 14 && !isTradingDay(d); i++) d = shift(d, -1);
  return d;
}

/** The closest trading day strictly after `date`. */
export function nextTradingDay(date: string): string {
  let d = shift(date, 1);
  for (let i = 0; i < 14 && !isTradingDay(d); i++) d = shift(d, 1);
  return d;
}

/* ------------------------------------------------------------------ status -- */

export interface MarketStatus {
  open: boolean;
  /** what today is */
  kind: DayKind;
  /** short text for the top bar: "Market Open", "Muhurat session", "Closed — Dussehra", … */
  label: string;
  /** the reason it's shut, or the special session's name; null on an ordinary day */
  reason: string | null;
  /** false when the date is outside the year this calendar covers */
  calendarCovered: boolean;
}

export function isMarketOpen(now: Date = new Date()): boolean {
  const p = istParts(now);
  const w = sessionOn(p.date).window;
  return !!w && p.minutes >= w.open && p.minutes <= w.close;
}

export function marketStatus(now: Date = new Date()): MarketStatus {
  const p = istParts(now);
  const s = sessionOn(p.date);
  const open = !!s.window && p.minutes >= s.window.open && p.minutes <= s.window.close;
  const calendarCovered = calendarCovers(p.date);
  let label: string;
  if (open) label = s.kind === "special" ? `${s.reason}` : "Market Open";
  else if (s.kind === "holiday") label = `Closed — ${s.reason}`;
  else if (s.kind === "special") label = p.minutes < (s.window as SessionWindow).open ? `${s.reason} today` : "Market Closed";
  else label = "Market Closed";
  return { open, kind: s.kind, label, reason: s.reason, calendarCovered };
}

/**
 * The most recent session close at or before `now` — when the last closing prices were set. Prices
 * read while the market is shut belong to this moment. Holidays and weekends are skipped; a special
 * session closes at its own time (the Muhurat session at 15:40).
 */
export function lastCloseTime(now: Date = new Date()): Date {
  const p = istParts(now);
  const closeOf = (date: string): Date | null => {
    const w = sessionOn(date).window;
    return w ? new Date(Date.parse(`${date}T00:00:00Z`) + w.close * 60_000 - IST_MS) : null;
  };
  let date = p.date;
  for (let i = 0; i < 14; i++) {
    const c = closeOf(date);
    if (c && c.getTime() <= now.getTime()) return c;
    date = shift(date, -1);
  }
  return new Date(now.getTime()); // unreachable in practice: no trading day in two weeks
}
