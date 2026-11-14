import { chainStats, type OptionChain } from "./options";

/**
 * The contract a "Paper sell Call" / "Paper sell Put" shortcut opens: the at-the-money strike (the strike nearest the
 * spot) of the chain on screen, for the chosen side. null when the chain has no strikes.
 */
export function atmContract(chain: Pick<OptionChain, "rows" | "spot">, type: "CE" | "PE"): { strike: number; type: "CE" | "PE" } | null {
  const stats = chainStats(chain.rows, chain.spot);
  return stats ? { strike: stats.atmStrike, type } : null;
}

/** Said in the order sheet when it was opened to sell a contract the user does not hold: paper trading has no short selling yet. */
export const SELL_NOT_HELD =
  "You don't hold this contract yet. Paper trading can only sell what you've bought, so a sell here closes a position you hold; short selling isn't supported yet.";
