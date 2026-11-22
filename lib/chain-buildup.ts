import { isLiquid, legBuildup, type Buildup, type ChainRow, type LegBuildup, type OptionLeg } from "./options";

/**
 * Buildup on the phone's option chain. The classification is the Buildup page's own, and lives in one place: `classifyBuildup` and `legBuildup` in
 * lib/options.ts (price up and OI up is long buildup, price down and OI up short buildup, price up and OI down short covering, price down and OI
 * down long unwinding; a leg that has not traded, has no previous-session figures, or has no change in either gets no tag). Everything here calls
 * `legBuildup`, as `buildupGrid` and `buildupBreakdown` (the Buildup page) do, and adds nothing to the rule.
 */

/** A strike's two legs, classified. */
export interface StrikeBuildup {
  strike: number;
  call: LegBuildup;
  put: LegBuildup;
}
export const strikeBuildup = (row: ChainRow): StrikeBuildup => ({ strike: row.strike, call: legBuildup(row.call), put: legBuildup(row.put) });

/** Does any leg of these strikes have a tag? (Otherwise the Buildup view has nothing to show.) */
export const anyBuildup = (rows: ChainRow[]): boolean => rows.some((r) => legBuildup(r.call).kind !== null || legBuildup(r.put).kind !== null);

export interface TopStrike {
  strike: number;
  oiChange: number;
  priceChangePct: number;
}
export type TopPerCategory = Record<Buildup, TopStrike | null>;

/**
 * For one side (the calls or the puts), the strike in each category whose open-interest change is the largest, by absolute size. When two strikes
 * have the same change, the lower strike is the one named. A category with no strike is null.
 */
export function topPerCategory(rows: ChainRow[], side: "call" | "put"): TopPerCategory {
  const top: TopPerCategory = { "long-buildup": null, "short-buildup": null, "short-covering": null, "long-unwinding": null };
  for (const r of rows) {
    const b = legBuildup(side === "call" ? r.call : r.put);
    if (!b.kind) continue;
    const cur = top[b.kind];
    const size = Math.abs(b.oiChange);
    if (!cur || size > Math.abs(cur.oiChange) || (size === Math.abs(cur.oiChange) && r.strike < cur.strike)) top[b.kind] = { strike: r.strike, oiChange: b.oiChange, priceChangePct: b.priceChangePct };
  }
  return top;
}

/** The four categories as the legend and the top strikes list them: the two buildups, then covering and unwinding. */
export const TOP_ORDER: Buildup[] = ["long-buildup", "short-buildup", "short-covering", "long-unwinding"];

/**
 * How a tag is marked on the phone's chain: its colour is the price's direction (green for price up, red for price down: long buildup and short
 * covering are green, short buildup and long unwinding red), and its weight is the open interest's (bold when it is up, which is the two buildups;
 * regular when it is down, covering and unwinding). The letter code is always shown, so colour is never the only signal. The colours are the chain's
 * own tokens (--color-chain-up and --color-chain-down in app/globals.css).
 */
export const BUILDUP_MARK: Record<Buildup, { priceUp: boolean; oiUp: boolean }> = {
  "long-buildup": { priceUp: true, oiUp: true },
  "short-buildup": { priceUp: false, oiUp: true },
  "short-covering": { priceUp: true, oiUp: false },
  "long-unwinding": { priceUp: false, oiUp: false },
};
/** Tailwind needs the class names written out */
export const buildupMarkClass = (k: Buildup): string => (BUILDUP_MARK[k].priceUp ? "text-chain-up" : "text-chain-down") + (BUILDUP_MARK[k].oiUp ? " font-bold" : " font-normal");

/**
 * What the Buildup view shows for a leg: its changes whenever the leg has traded and has the previous session's figures (the Buildup page's own
 * rule for taking part), and its tag when neither change is zero. A leg with no such figures is null: blank cells.
 */
export const legFigures = (leg: OptionLeg): LegBuildup | null => (isLiquid(leg) ? legBuildup(leg) : null);

/** What to say about where the tags come from. */
export function buildupNote(source: "live" | "simulated", marketOpen: boolean | null): string {
  if (source === "simulated") return "Simulated chain: the tags are generated, not real.";
  if (marketOpen === false) return "Market closed: the tags are from the last session.";
  return "Today's OI and premium against the previous session's.";
}
