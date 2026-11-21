import { nextTradingDay } from "./market-calendar";
import type { Holdings, OrderLogEntry } from "./types";
import { parseContractId } from "./contract";

/**
 * How many trading days after a trade an equity share settles (arrives in the demat account). NSE moved the cash market to T+1 (settlement
 * the next trading day) in phases that finished in January 2023, and it is still the standard cycle. It is one constant: change it here and
 * every screen follows. Weekends and exchange holidays do not count (lib/market-calendar.ts).
 */
export const EQUITY_SETTLEMENT_DAYS = 1;

/** The IST date a trade made on `tradeDate` settles on: that many trading days later. */
export function settlementDate(tradeDate: string, days: number = EQUITY_SETTLEMENT_DAYS): string {
  let d = tradeDate;
  for (let i = 0; i < days; i++) d = nextTradingDay(d);
  return d;
}

/** A share is a holding once it has settled: its settlement date is today or earlier. */
export const isSettled = (tradeDate: string | undefined, today: string, days: number = EQUITY_SETTLEMENT_DAYS): boolean => !tradeDate || settlementDate(tradeDate, days) <= today;

export interface Position {
  id: string;
  /** shares still waiting to settle (equities), or the whole contract position (futures and options) */
  qty: number;
  avgPrice: number;
  /** the trades behind it, made today (or not yet settled) */
  tradeCount: number;
  /** a derivative contract: always a position, never a delivery holding */
  contract: boolean;
}

export interface Split {
  /** delivery shares from earlier days that have settled */
  holdings: Holdings;
  /** what was bought and has not settled yet, and every derivative contract */
  positions: Position[];
}

/**
 * Splits what the paper account holds into Holdings (settled delivery shares, from earlier days) and Positions (trades whose shares have not
 * settled yet: with T+1, today's; and every option or futures contract). Uses the filled orders' dates; an order saved before dates were kept has no
 * date and counts as settled. A sale is taken from the unsettled shares first, so it never leaves a phantom position.
 */
export function splitHoldings(holdings: Holdings, orderLog: OrderLogEntry[], today: string, days: number = EQUITY_SETTLEMENT_DAYS): Split {
  const out: Split = { holdings: {}, positions: [] };
  for (const [id, h] of Object.entries(holdings)) {
    if (h.qty <= 0) continue;
    if (parseContractId(id)) {
      out.positions.push({ id, qty: h.qty, avgPrice: h.avgPrice, tradeCount: orderLog.filter((o) => o.symbol === id && (o.status ?? "filled") === "filled").length, contract: true });
      continue;
    }
    const fills = orderLog.filter((o) => o.symbol === id && (o.status ?? "filled") === "filled" && o.date);
    const unsettledBuys = fills.filter((o) => o.side === "buy" && !isSettled(o.date, today, days));
    const boughtQty = unsettledBuys.reduce((s, o) => s + o.qty, 0);
    // sales made on or after the first unsettled purchase come off it first
    const first = unsettledBuys.reduce((d, o) => (o.date! < d ? o.date! : d), "9999-99-99");
    const soldQty = fills.filter((o) => o.side === "sell" && o.date! >= first).reduce((s, o) => s + o.qty, 0);
    const unsettled = Math.min(h.qty, Math.max(0, boughtQty - soldQty));
    if (unsettled > 0) {
      const cost = unsettledBuys.reduce((s, o) => s + o.qty * o.price, 0);
      out.positions.push({ id, qty: unsettled, avgPrice: boughtQty > 0 ? cost / boughtQty : h.avgPrice, tradeCount: fills.filter((o) => o.date! >= first).length, contract: false });
    }
    if (h.qty - unsettled > 0) out.holdings[id] = { qty: h.qty - unsettled, avgPrice: h.avgPrice };
  }
  return out;
}
