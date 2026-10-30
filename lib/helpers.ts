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
