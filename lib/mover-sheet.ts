import type { OptionContract } from "./movers";
import type { OptionChain } from "./options";

export type MoverSheetState =
  | { kind: "loading" }
  | { kind: "ready"; chain: OptionChain }
  | { kind: "unavailable"; text: string };

export const MOVER_CONTRACT_UNAVAILABLE = "This contract isn't available right now. The live option chain for it could not be loaded.";

/**
 * Whether a Movers row can open the option sheet: only from a live chain for the same underlying and expiry that
 * lists this strike. A simulated chain, a different expiry or a missing strike never opens a sheet, so the sheet never
 * shows a contract that isn't the one that was tapped.
 */
export function moverSheetState(chain: OptionChain | null, c: Pick<OptionContract, "symbol" | "expiry" | "strike" | "type">): MoverSheetState {
  if (!chain) return { kind: "loading" };
  const listed = chain.rows.some((r) => r.strike === c.strike);
  if (chain.source !== "live" || chain.expiry !== c.expiry || !listed) return { kind: "unavailable", text: MOVER_CONTRACT_UNAVAILABLE };
  return { kind: "ready", chain };
}
