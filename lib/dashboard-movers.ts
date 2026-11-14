/**
 * The dashboard's Market Movers: only symbols that have a real quote, ranked honestly. Gainers are the symbols
 * that are up (change above zero, largest first), losers the ones that are down (below zero, largest fall first).
 * A symbol that is flat is neither, and a list with no member stays empty rather than being padded.
 */

export interface MoverInput {
  id: string;
  /** day change in percent, or null when there is no real figure */
  chg: number | null;
  /** true only when this symbol's price and previous close came from a live feed */
  real: boolean;
  /** crypto and other symbols outside Indian markets are kept out of the Indian movers */
  indian: boolean;
}

export interface RankedMovers<T extends MoverInput> {
  gainers: T[];
  losers: T[];
}

export function rankMovers<T extends MoverInput>(rows: T[], n = 3): RankedMovers<T> {
  const usable = rows.filter((r): r is T & { chg: number } => r.real && r.indian && r.chg != null && Number.isFinite(r.chg));
  return {
    gainers: usable.filter((r) => r.chg > 0).sort((a, b) => b.chg - a.chg).slice(0, n),
    losers: usable.filter((r) => r.chg < 0).sort((a, b) => a.chg - b.chg).slice(0, n),
  };
}
