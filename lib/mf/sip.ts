/**
 * SIP and lump-sum calculator. Pure arithmetic on an assumed yearly return; nothing here is a forecast. A SIP pays the same amount
 * at the start of each month. The yearly return is turned into a monthly one that compounds to it: (1 + r)^(1/12) - 1.
 */
export const MIN_AMOUNT = 100;
export const MAX_AMOUNT = 1_000_000;

export interface SipInput {
  mode: "sip" | "lump";
  /** per month (SIP) or once (lump sum), rupees */
  amount: number;
  years: number;
  /** assumed return per year, in per cent */
  yearlyReturnPct: number;
}

export interface SipResult {
  invested: number;
  futureValue: number;
  gain: number;
}

export const clampAmount = (v: number): number => (Number.isFinite(v) ? Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, Math.round(v))) : MIN_AMOUNT);

export function calculate(i: SipInput): SipResult {
  const amount = clampAmount(i.amount);
  const years = Number.isFinite(i.years) ? Math.min(50, Math.max(0, i.years)) : 0;
  const r = (Number.isFinite(i.yearlyReturnPct) ? Math.max(-99, i.yearlyReturnPct) : 0) / 100;
  if (i.mode === "lump") {
    const fv = amount * Math.pow(1 + r, years);
    return { invested: amount, futureValue: fv, gain: fv - amount };
  }
  const n = Math.round(years * 12);
  const m = Math.pow(1 + r, 1 / 12) - 1;
  const fv = Math.abs(m) < 1e-12 ? amount * n : amount * ((Math.pow(1 + m, n) - 1) / m) * (1 + m);
  return { invested: amount * n, futureValue: fv, gain: fv - amount * n };
}

/** Slider position (0..1) to an amount on a log scale between MIN_AMOUNT and MAX_AMOUNT, rounded to a tidy step, and back. */
export function amountFromSlider(p: number): number {
  const raw = MIN_AMOUNT * Math.pow(MAX_AMOUNT / MIN_AMOUNT, Math.min(1, Math.max(0, p)));
  const step = raw < 1000 ? 50 : raw < 10_000 ? 500 : raw < 100_000 ? 5000 : 50_000;
  return clampAmount(Math.round(raw / step) * step);
}
export const sliderFromAmount = (a: number): number => Math.log(clampAmount(a) / MIN_AMOUNT) / Math.log(MAX_AMOUNT / MIN_AMOUNT);

/** The monthly SIP that reaches `goal` in `years` at an assumed yearly return (the inverse of `calculate` for a SIP); null when it cannot be worked out. */
export function monthlyNeeded(goal: number, years: number, yearlyReturnPct: number): number | null {
  if (!(goal > 0) || !(years > 0)) return null;
  const perRupee = calculate({ mode: "sip", amount: MIN_AMOUNT, years, yearlyReturnPct }).futureValue / MIN_AMOUNT;
  return perRupee > 0 && Number.isFinite(perRupee) ? goal / perRupee : null;
}
