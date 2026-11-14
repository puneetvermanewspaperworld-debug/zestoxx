import type { AssetType } from "./types";

export type BadgeTone = "live" | "closed" | "sim";
export interface DataBadge {
  label: "Live data" | "Last close" | "Simulated";
  tone: BadgeTone;
}

/**
 * The badge next to a symbol's price on the Trade page. "Live data" is only said while the price is actually moving:
 * a live feed with the exchange shut is the last close, so it says "Last close". Crypto trades around the clock, so the Indian
 * market hours never apply to it. `marketOpen` is null until the market status is known; nothing is claimed until then.
 */
export function dataBadge(source: "live" | "sim" | undefined, marketOpen: boolean | null, type: AssetType): DataBadge | null {
  if (source !== "live") return { label: "Simulated", tone: "sim" };
  if (type === "crypto") return { label: "Live data", tone: "live" };
  if (marketOpen === null) return null;
  return marketOpen ? { label: "Live data", tone: "live" } : { label: "Last close", tone: "closed" };
}
