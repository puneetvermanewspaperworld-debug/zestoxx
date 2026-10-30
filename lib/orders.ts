/**
 * Order metadata and the date rules around it — pure, so they can be tested in isolation.
 *
 * Order types in the paper engine:
 *   MARKET  fills immediately at the last price
 *   LIMIT   a day order: rests until the price crosses, and expires when the IST date turns
 *   GTD     good-till-date: a limit order that rests until `expiryDate` (inclusive)
 *   SIP     an installment of a Stock SIP plan, executed as a market buy when due
 */

export type OrderType = "MARKET" | "LIMIT" | "GTD" | "SIP";
export type OrderStatus = "filled" | "cancelled" | "expired";

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  MARKET: "Market",
  LIMIT: "Limit (day)",
  GTD: "GTD",
  SIP: "SIP",
};

/** A resting order: only limit-style orders can rest. */
export interface RestingOrder {
  orderType: "LIMIT" | "GTD";
  /** YYYY-MM-DD in IST — what makes a LIMIT a day order */
  placedDate: string;
  /** YYYY-MM-DD, GTD only */
  expiryDate?: string;
}

/** Whether a resting order is dead as of `today` (IST). GTD stays valid through its expiry date. */
export function isRestingOrderExpired(o: RestingOrder, today: string): boolean {
  if (o.orderType === "GTD") return !!o.expiryDate && o.expiryDate < today;
  return o.placedDate < today;
}

/* ---------------------------------------------------------------- dates ---- */

const DAY_MS = 86_400_000;

const parse = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const fmtIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const addDaysIso = (iso: string, n: number): string => fmtIso(parse(iso) + n * DAY_MS);

/** GTD orders may be placed out to a year ahead (the exchange limit is 365 days). */
export const GTD_MAX_DAYS = 365;

/** Valid GTD expiry range for an order placed `today`. */
export function gtdBounds(today: string): { min: string; max: string } {
  return { min: today, max: addDaysIso(today, GTD_MAX_DAYS) };
}

/** The `anchorDay`-th of the month `monthsAhead` after `iso`'s month, clamped to that month's length. */
function monthlyOn(iso: string, monthsAhead: number, anchorDay: number): string {
  const d = new Date(parse(iso));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + monthsAhead;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fmtIso(Date.UTC(y, m, Math.min(anchorDay, lastDay)));
}

/* ------------------------------------------------------------------ SIPs ---- */

export type SipFrequency = "weekly" | "monthly";
export type SipStatus = "active" | "paused";

export interface SipPlan {
  id: number;
  symbol: string;
  /** ₹ invested per installment; whole shares only, so the actual spend is slightly lower */
  amount: number;
  frequency: SipFrequency;
  /** YYYY-MM-DD of the next installment */
  nextDate: string;
  /** day of the month monthly installments land on (clamped in short months) */
  anchorDay: number;
  status: SipStatus;
  installments: number;
  /** when the plan was created, as the label the UI shows */
  createdAt: string;
}

export const SIP_MIN_AMOUNT = 500;
export const MAX_SIPS = 20;

/**
 * First installment date strictly after `after` — used both to schedule the next
 * installment and to skip installments missed while the app was closed (a missed
 * installment is skipped, never stacked into one big catch-up purchase at today's price).
 */
export function nextSipDate(
  plan: Pick<SipPlan, "frequency" | "nextDate" | "anchorDay">,
  after: string
): string {
  let date = plan.nextDate;
  let step = 0;
  while (date <= after) {
    step += 1;
    date =
      plan.frequency === "weekly"
        ? addDaysIso(plan.nextDate, 7 * step)
        : monthlyOn(plan.nextDate, step, plan.anchorDay);
  }
  return date;
}

/** An installment can run on weekdays from the 09:15 IST open. Exchange holidays aren't modelled. */
export function isSipExecutable(nextDate: string, ist: { date: string; weekday: number; minutes: number }): boolean {
  const open = ist.weekday >= 1 && ist.weekday <= 5 && ist.minutes >= 9 * 60 + 15;
  return nextDate <= ist.date && open;
}

/** Validation for a new plan; returns an error message or null. */
export function sipError(
  input: { amount: number; startDate: string },
  today: string,
  existing: number
): string | null {
  if (!(input.amount >= SIP_MIN_AMOUNT)) return `The minimum SIP amount is ₹${SIP_MIN_AMOUNT}.`;
  if (input.amount > 10_00_000) return "The maximum SIP amount is ₹10,00,000 per installment.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || input.startDate < today) return "Pick a start date from today onwards.";
  if (input.startDate > addDaysIso(today, GTD_MAX_DAYS)) return "The start date can be at most a year away.";
  if (existing >= MAX_SIPS) return `You can have up to ${MAX_SIPS} SIPs.`;
  return null;
}

/** Whole shares an installment buys at `price`, and what that actually costs. */
export function sipFill(amount: number, price: number): { qty: number; cost: number } {
  const qty = price > 0 ? Math.floor(amount / price) : 0;
  return { qty, cost: qty * price };
}
