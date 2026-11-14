import type { AssetType } from "./types";

export function strSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function fmt(val: number | null | undefined, type?: AssetType): string {
  if (val == null || isNaN(val)) return "--";
  if (type === "crypto") return "$" + val.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return "₹" + val.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function fmtINR(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "--";
  return "₹" + val.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Indian-style open-interest / quantity formatting: 12.3k, 4.56 L (lakh), 1.20 Cr (crore). */
export function fmtOi(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "--";
  const a = Math.abs(n);
  if (a >= 1e7) return (n / 1e7).toFixed(2) + " Cr";
  if (a >= 1e5) return (n / 1e5).toFixed(2) + " L";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(Math.round(n));
}

/** Signed variant of fmtOi — "+1.20 L" / "−45.0k". */
export function fmtOiChange(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "--";
  if (n === 0) return "0";
  return (n > 0 ? "+" : "−") + fmtOi(Math.abs(n));
}

/** "2026-11-03" -> "03 Nov 2026". Pure string math (no Date/timezone), safe for SSR. */
export function fmtIsoDate(iso: string, withYear = true): string {
  const [y, m, d] = iso.split("-");
  const mon = MONTHS[Number(m) - 1] ?? m;
  return withYear ? `${d} ${mon} ${y}` : `${d} ${mon}`;
}

/** Today's date on Indian exchanges (IST) as YYYY-MM-DD, whatever the viewer's timezone. */
export function istDateString(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Wall-clock in IST: the date, day of week (0 = Sunday) and minutes since midnight. */
export function istClock(now: Date = new Date()): { date: string; weekday: number; minutes: number } {
  const d = new Date(now.getTime() + 5.5 * 3_600_000);
  return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/**
 * A signed number for a change: "+1.25", "-0.09", "0.00". The sign comes from the rounded value, so a tiny
 * negative never prints "-0.00" and a plus sign is never put in front of a minus ("+-0.09").
 * `suffix` is appended as is ("%").
 */
export function fmtSigned(n: number | null | undefined, digits = 2, suffix = ""): string {
  if (n == null || !Number.isFinite(n)) return "--";
  const s = Math.abs(n).toFixed(digits);
  const zero = Number(s) === 0;
  return `${zero ? "" : n > 0 ? "+" : "-"}${s}${suffix}`;
}
