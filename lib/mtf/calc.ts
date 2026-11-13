/**
 * MTF (margin trading facility) calculator: what a delivery trade looks like with and without borrowed money. Informational
 * only: nothing here places an order or arranges funding. All amounts are in rupees.
 *
 * The formulas are those of section D of zestoxx-build-plan.md. One of them is stated there in a way that contradicts its own
 * worked example, and the worked example is right: the fall in price that wipes out the investor's own capital is
 * `own capital / position value`, which equals `1 - funding%` (40% at 60% funding), not `funding%`. At 60% funding the loan is
 * 60% of the position, so the position has to lose 40% of its value before only the loan is left.
 */

/** Delivery charges, all editable. Percent fields are in percent (0.1 means 0.1%). */
export interface MtfCharges {
  /** flat brokerage per order (a buy and a sell are two orders) */
  brokeragePerOrder: number;
  /** securities transaction tax, % of turnover, charged on the buy and the sell */
  sttPct: number;
  /** stamp duty, % of the buy value */
  stampBuyPct: number;
  /** NSE transaction charge, % of turnover, both sides */
  nseTxnPct: number;
  /** SEBI turnover fee, rupees per crore of turnover, both sides */
  sebiPerCrore: number;
  /** GST, % on brokerage + transaction charge + SEBI fee */
  gstPct: number;
  /** depository charge per sell */
  dpPerSell: number;
}

export const DEFAULT_CHARGES: MtfCharges = {
  // Many brokers charge nothing for delivery orders. The user sets their broker's figure.
  brokeragePerOrder: 0,
  sttPct: 0.1,
  stampBuyPct: 0.015,
  nseTxnPct: 0.00307,
  sebiPerCrore: 10,
  gstPct: 18,
  dpPerSell: 20,
};

export const DEFAULTS = {
  fundingPct: 50,
  ratePct: 15,
  forcedSalePct: 20,
  days: 10,
  ownAmount: 100_000,
} as const;

export interface MtfInput {
  /** entry price per share */
  price: number;
  /** expected exit price per share */
  exitPrice: number;
  /** the investor's own money, ₹ */
  ownAmount: number;
  /** calendar days held (interest runs on every calendar day, holidays included) */
  days: number;
  /** share of the position the broker funds, % (illustrative; each broker sets it per stock) */
  fundingPct: number;
  /** MTF interest, % per year */
  ratePct: number;
  /** equity as a % of the position at which a broker may sell */
  forcedSalePct: number;
  charges: MtfCharges;
}

export interface Side {
  quantity: number;
  /** quantity x entry price */
  positionValue: number;
  /** own money actually put in: quantity x price x (1 - funding%) */
  ownCapitalUsed: number;
  /** borrowed: quantity x price x funding% */
  fundedAmount: number;
  interest: number;
  charges: number;
  grossProfit: number;
  netProfit: number;
  /** net profit / own capital used, in %; null when no capital is used */
  netReturnPct: number | null;
  /** exit price at which net profit is zero, with the charges worked out at the expected exit; null with no quantity */
  breakevenPrice: number | null;
}

export interface GridRow {
  /** exit price change from the entry price, % */
  movePct: number;
  exitPrice: number;
  mtfNet: number;
  plainNet: number;
}

export interface MtfResult {
  withMtf: Side;
  withoutMtf: Side;
  /** position value / own capital, 1 / (1 - funding%) */
  leverage: number;
  /** fall in the price that wipes out the investor's own capital, % */
  wipeOutFallPct: number | null;
  /** price at which a broker may sell the shares; null when nothing is funded */
  forcedSalePrice: number | null;
  /** fall from the entry price to that price, % */
  forcedSaleFallPct: number | null;
  grid: GridRow[];
}

export const GRID_MOVES = [-20, -10, -5, 0, 5, 10, 20] as const;

const CRORE = 1e7;

/** Total delivery charges for buying `qty` at `buy` and selling at `sell`. Zero when nothing is traded. */
export function tradeCharges(qty: number, buy: number, sell: number, c: MtfCharges): number {
  if (!(qty > 0)) return 0;
  const buyValue = qty * buy;
  const sellValue = qty * sell;
  const turnover = buyValue + sellValue;
  const brokerage = 2 * c.brokeragePerOrder;
  const stt = (c.sttPct / 100) * turnover;
  const stamp = (c.stampBuyPct / 100) * buyValue;
  const txn = (c.nseTxnPct / 100) * turnover;
  const sebi = (c.sebiPerCrore * turnover) / CRORE;
  const gst = (c.gstPct / 100) * (brokerage + txn + sebi);
  return brokerage + stt + stamp + txn + sebi + gst + c.dpPerSell;
}

/** One side of the comparison: `fundingFraction` is 0 for "without MTF". */
function side(i: MtfInput, fundingFraction: number, exit: number): Side {
  const own = Math.max(0, i.ownAmount);
  const perShareOwn = i.price * (1 - fundingFraction);
  const quantity = perShareOwn > 0 ? Math.floor(own / perShareOwn) : 0;
  const positionValue = quantity * i.price;
  const ownCapitalUsed = quantity * perShareOwn;
  const fundedAmount = quantity * i.price * fundingFraction;
  const interest = (fundedAmount * (i.ratePct / 100) * Math.max(0, i.days)) / 365;
  const charges = tradeCharges(quantity, i.price, exit, i.charges);
  const grossProfit = quantity * (exit - i.price);
  const netProfit = grossProfit - interest - charges;
  return {
    quantity,
    positionValue,
    ownCapitalUsed,
    fundedAmount,
    interest,
    charges,
    grossProfit,
    netProfit,
    netReturnPct: ownCapitalUsed > 0 ? (netProfit / ownCapitalUsed) * 100 : null,
    breakevenPrice: quantity > 0 ? i.price + (interest + charges) / quantity : null,
  };
}

/** Bounds the inputs can take, so a typed value can never produce nonsense (a 100% funding level divides by zero). */
export function normalise(i: MtfInput): MtfInput {
  const f = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
  return {
    ...i,
    price: f(i.price, 0, 1e9),
    exitPrice: f(i.exitPrice, 0, 1e9),
    ownAmount: f(i.ownAmount, 0, 1e12),
    days: Math.floor(f(i.days, 0, 3650)),
    fundingPct: f(i.fundingPct, 0, 95),
    ratePct: f(i.ratePct, 0, 100),
    forcedSalePct: f(i.forcedSalePct, 0, 95),
  };
}

export function compute(raw: MtfInput): MtfResult {
  const i = normalise(raw);
  const fraction = i.fundingPct / 100;
  const withMtf = side(i, fraction, i.exitPrice);
  const withoutMtf = side(i, 0, i.exitPrice);

  const leverage = 1 / (1 - fraction);
  const wipeOutFallPct = withMtf.positionValue > 0 ? (withMtf.ownCapitalUsed / withMtf.positionValue) * 100 : null;
  const forcedSalePrice =
    withMtf.quantity > 0 && withMtf.fundedAmount > 0 ? withMtf.fundedAmount / (withMtf.quantity * (1 - i.forcedSalePct / 100)) : null;
  const forcedSaleFallPct = forcedSalePrice !== null && i.price > 0 ? (1 - forcedSalePrice / i.price) * 100 : null;

  const grid: GridRow[] = GRID_MOVES.map((movePct) => {
    const exitPrice = i.price * (1 + movePct / 100);
    return { movePct, exitPrice, mtfNet: side(i, fraction, exitPrice).netProfit, plainNet: side(i, 0, exitPrice).netProfit };
  });

  return { withMtf, withoutMtf, leverage, wipeOutFallPct, forcedSalePrice, forcedSaleFallPct, grid };
}

/** The required wording, shown on the page. */
export const MTF_WARNING =
  "MTF magnifies losses as well as gains. Interest accrues daily. Shares are pledged to your broker. Eligible stocks and funding vary by broker. This is a calculator, not an offer.";
export const FUNDING_LABEL = "Illustrative. Your broker sets this for each stock.";
export const RATE_LABEL = "Check your broker's rate.";
export const FORCED_SALE_LABEL = "Check your broker.";
