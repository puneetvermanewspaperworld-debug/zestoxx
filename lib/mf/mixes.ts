import type { TileId } from "./categories";
import { median } from "./overview";
import type { TileSummary } from "./overview";

/**
 * "Sample mixes": an illustrative split across categories for a goal, with no fund named. The return figures are the median past
 * 3-year (annualised) returns of the stored schemes in each category, so they are real, and past: the monthly amount shown is what
 * a SIP would have needed if that past return were repeated, which it may not be.
 */
export interface MixPart {
  tile: TileId;
  /** per cent of the money */
  pct: number;
}
export interface Mix {
  id: string;
  title: string;
  goal: number;
  years: number;
  parts: MixPart[];
}

export const MIXES: Mix[] = [
  { id: "five-lakh-five-years", title: "Aiming for ₹5 lakh in 5 years", goal: 500_000, years: 5, parts: [{ tile: "large-cap", pct: 40 }, { tile: "equity-hybrid", pct: 40 }, { tile: "debt", pct: 20 }] },
  { id: "twenty-five-lakh-ten-years", title: "Aiming for ₹25 lakh in 10 years", goal: 2_500_000, years: 10, parts: [{ tile: "large-cap", pct: 40 }, { tile: "mid-cap", pct: 30 }, { tile: "index", pct: 20 }, { tile: "debt", pct: 10 }] },
  { id: "two-lakh-three-years", title: "Building ₹2 lakh in 3 years, with less risk", goal: 200_000, years: 3, parts: [{ tile: "equity-hybrid", pct: 50 }, { tile: "debt", pct: 40 }, { tile: "large-cap", pct: 10 }] },
];

export interface MixResult {
  /** each part's median past 3-year return, null when the category has none stored yet */
  partReturns: (number | null)[];
  /** the mix's return if every part has one, else null */
  mixReturn: number | null;
}

export function evaluateMix(mix: Mix, tiles: Pick<TileSummary, "id" | "median3y">[]): MixResult {
  const partReturns = mix.parts.map((p) => tiles.find((t) => t.id === p.tile)?.median3y ?? null);
  const mixReturn = partReturns.every((r) => r !== null) ? mix.parts.reduce((s, p, i) => s + (p.pct / 100) * (partReturns[i] as number), 0) : null;
  return { partReturns, mixReturn };
}

export { median };
