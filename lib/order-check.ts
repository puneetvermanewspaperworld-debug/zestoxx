import { fmtINR } from "./helpers";

/**
 * The one funds check every paper order goes through. A buy needs the virtual cash for quantity x price; a sell needs the shares (or the
 * contract) in the account. There is no leverage and no short selling. The same check runs when an order is placed (market and resting alike,
 * at the price it would trade at) and again when a resting order fills, which can be much later and with a different account.
 */
export interface FundsCheck {
  side: "buy" | "sell";
  qty: number;
  /** the price it would trade at: the live price for a market order, the limit price for a resting one */
  price: number;
  cash: number;
  /** what the account holds of this symbol */
  held: number;
  symbol: string;
}

/** An error message when the order cannot trade, or null when it can. */
export function fundsError(o: FundsCheck): string | null {
  if (!(Number.isInteger(o.qty) && o.qty >= 1)) return "Enter a whole quantity of 1 or more.";
  if (!(o.price > 0)) return "There is no price to check this order against.";
  if (o.side === "buy") {
    const cost = o.qty * o.price;
    if (cost > o.cash) return `Not enough virtual cash: this needs ${fmtINR(cost)} and you have ${fmtINR(o.cash)}.`;
    return null;
  }
  if (o.qty > o.held) return `You only hold ${o.held} unit(s) of ${o.symbol}.`;
  return null;
}

/** Why a resting order was cancelled when it came to fill, in words for a message. */
export const fillShortfall = (side: "buy" | "sell"): string => (side === "buy" ? "not enough virtual cash" : "you no longer hold enough");

/** An order a screen asks the account to place. */
export interface OrderRequest {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  mode: "market" | "limit" | "gtd";
  limitPrice?: number;
  /** YYYY-MM-DD, GTD only */
  expiryDate?: string;
}

/** What came of it: filled now (with the cash left), resting until its price comes (limit, or GTD until its date), or refused with the reason. */
export type OrderResult =
  | { status: "filled"; symbol: string; side: "buy" | "sell"; qty: number; price: number; cashAfter: number }
  | { status: "pending"; symbol: string; side: "buy" | "sell"; qty: number; limitPrice: number; orderType: "LIMIT" | "GTD"; expiryDate?: string }
  | { status: "refused"; reason: string };
