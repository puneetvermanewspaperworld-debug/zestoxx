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
