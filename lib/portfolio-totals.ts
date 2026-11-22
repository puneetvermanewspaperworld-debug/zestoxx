/**
 * The totals the Account and Portfolio pages show: the value of what is held at the latest price (a contract with no mark yet counts at what it
 * cost, not as NaN), the profit and loss against what it cost, and the cash plus the holdings.
 */
export interface Holding {
  qty: number;
  avgPrice: number;
}

export function portfolioTotals(cash: number, holdings: Record<string, Holding>, live: Record<string, number>): { holdingsValue: number; pnl: number; total: number } {
  let holdingsValue = 0;
  let pnl = 0;
  for (const [id, h] of Object.entries(holdings)) {
    if (!(h.qty > 0)) continue;
    const mark = live[id] > 0 ? live[id] : h.avgPrice;
    holdingsValue += h.qty * mark;
    pnl += (mark - h.avgPrice) * h.qty;
  }
  return { holdingsValue, pnl, total: cash + holdingsValue };
}
