/** Institutional flow shapes shared by the ingest job, the API and the page. */

export interface Flow {
  /** ₹ crore */
  buy: number;
  sell: number;
  net: number;
}

export interface CashFigures {
  fii: Flow;
  dii: Flow;
}

/** FII index futures, open contracts. */
export interface IdxFut {
  long: number;
  short: number;
}

/** One stored trading day. Either half can be missing; nothing is ever estimated. */
export interface FiiDiiDayRow {
  /** YYYY-MM-DD, the day the figures are for */
  date: string;
  cash: CashFigures | null;
  idxFut: IdxFut | null;
  /** the cash figures are NSE's provisional ones */
  provisional: boolean;
}

export type Entity = "FII" | "DII";
export type Interval = "daily" | "weekly" | "monthly";
