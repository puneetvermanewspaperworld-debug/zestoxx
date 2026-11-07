/**
 * Statutory charges on F&O trades. One object, one date: when STT or exchange rates change
 * (Budget changes, NSE circulars), edit RATES and bump `verifiedOn` — the page footer shows it.
 */
export const RATES = {
  /** the date these values were last checked against the exchange/regulator notices */
  verifiedOn: "2026-11-06",
  /** STT: sell side of options, on premium */
  sttOptSell: 0.0015,
  /** STT: exercised (in-the-money, held to expiry) options, on intrinsic value */
  sttOptEx: 0.0015,
  /** STT: sell side of futures */
  sttFutSell: 0.0005,
  /** NSE transaction charge, both sides */
  txnOpt: 0.0003553,
  txnFut: 0.0000183,
  /** SEBI turnover fee: ₹10 per crore */
  sebi: 1e-6,
  /** stamp duty, buy side */
  stampOpt: 0.00003,
  stampFut: 0.00002,
  /** GST on brokerage + transaction charge + SEBI fee */
  gst: 0.18,
} as const;

/** Turnover (₹) per bucket for one round of trades, plus order count. */
export interface Turnover {
  optBuy: number;
  optSell: number;
  futBuy: number;
  futSell: number;
  orders: number;
  /** intrinsic value of long options exercised at expiry (STT base) */
  sttExBase: number;
}

export interface ChargeBreakdown {
  brokerage: number;
  stt: number;
  /** the exercise-STT part of `stt` */
  sttEx: number;
  txn: number;
  sebi: number;
  stamp: number;
  gst: number;
  total: number;
}

export function computeCharges(t: Turnover, brokeragePerOrder: number): ChargeBreakdown {
  const optT = t.optBuy + t.optSell;
  const futT = t.futBuy + t.futSell;
  const brokerage = brokeragePerOrder * t.orders;
  const sttEx = RATES.sttOptEx * t.sttExBase;
  const stt = RATES.sttOptSell * t.optSell + RATES.sttFutSell * t.futSell + sttEx;
  const txn = RATES.txnOpt * optT + RATES.txnFut * futT;
  const sebi = RATES.sebi * (optT + futT);
  const stamp = RATES.stampOpt * t.optBuy + RATES.stampFut * t.futBuy;
  const gst = RATES.gst * (brokerage + txn + sebi);
  return { brokerage, stt, sttEx, txn, sebi, stamp, gst, total: brokerage + stt + txn + sebi + stamp + gst };
}
