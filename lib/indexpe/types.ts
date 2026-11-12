/** Index valuation shapes shared by the ingest job, the snapshot API and the analyzer. */

/** One index on one day, as stored. P/E, P/B and dividend yield are null where NSE shows "-". */
export interface IndexDayRow {
  indexName: string;
  /** YYYY-MM-DD */
  date: string;
  /** closing level */
  close: number;
  pe: number | null;
  pb: number | null;
  /** dividend yield, per cent */
  divYield: number | null;
}

/** What /api/fno/snapshot returns for an index underlying. */
export interface IndexPE {
  /** P/E at NSE's last close */
  value: number;
  /** the trading day that close was for (YYYY-MM-DD) */
  asOfDate: string;
  source: "NSE close";
  /** the close P/E scaled to the live index level: value × live spot ÷ last close; null when it cannot be worked out */
  livePE: number | null;
  /** median of the stored P/E history; null until enough days are stored */
  medianPE: number | null;
  /** how many days of P/E history that median is over */
  historyDays: number;
  /** trading days between the stored close and the latest close that should exist by now */
  tradingDaysOld: number;
  /** older than 3 trading days: the analyzer then shows Manual */
  stale: boolean;
}
