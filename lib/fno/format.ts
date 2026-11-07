/** Number formatting for the analyzer — Indian digit grouping, a real minus sign, no "-₹0". */

export const nf = (x: number, d = 0): string =>
  Number(x).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

const isZero = (x: number, d = 0): boolean => Math.abs(x) < 0.5 * Math.pow(10, -d);

/** ₹1,23,456 with a leading − for negatives. */
export const rs = (x: number, d = 0): string => `${x < 0 && !isZero(x, d) ? "−" : ""}₹${nf(Math.abs(x), d)}`;

/** Signed: +₹1,200 / −₹1,200 / ₹0. */
export const rsS = (x: number, d = 0): string =>
  `${isZero(x, d) ? "" : x < 0 ? "−" : "+"}₹${nf(Math.abs(x), d)}`;

export const pct = (x: number, d = 2): string => `${x < 0 ? "−" : "+"}${Math.abs(x).toFixed(d)}%`;

/** 12.3L, 1.2Cr, 4.5k — compact rupee amounts for chart axes and heatmap cells. */
export function compact(x: number): string {
  const a = Math.abs(x);
  const s = x < 0 ? "−" : "";
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${s}${Math.round(a)}`;
}

export type Tone = "up" | "down" | "";
export const tone = (x: number): Tone => (x > 0.5 ? "up" : x < -0.5 ? "down" : "");

/** Tailwind classes for the tone, used inside generated HTML strings and JSX alike. */
export const TONE_CLASS: Record<Tone, string> = { up: "text-emerald-600", down: "text-rose-500", "": "" };
