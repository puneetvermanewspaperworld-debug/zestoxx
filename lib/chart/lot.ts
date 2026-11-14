import type { AssetType } from "../types";

/** The option underlying whose future's lot size applies to an index symbol of the terminal, or null (stocks and crypto get no per-lot figure). */
export const LOT_UNDERLYING: Record<string, string> = { NIFTY50: "NIFTY", BANKNIFTY: "BANKNIFTY", SENSEX: "SENSEX" };

export const indexUnderlying = (symbol: string, type: AssetType): string | null => (type === "index" ? (LOT_UNDERLYING[symbol] ?? null) : null);
