import { MAX_AGE_TRADING_DAYS, MIN_HISTORY_DAYS } from "./maths";
import type { IndexPE } from "./types";

/**
 * What the analyzer's "Is the market cheap or expensive?" panel shows for the index P/E and the long-run P/E. NSE's figures are used
 * when they are there and fresh; otherwise the field says Manual (with the reason) and stays editable. A value the user typed always
 * wins and is always labelled Manual.
 */

export const MANUAL_PE = 22;
export const MANUAL_PE_AVG = 20;

/** Where a shown figure comes from. */
export type ValueSource = "typed" | "nse" | "manual";

export interface ValuationInput {
  value: number;
  source: ValueSource;
  /** the label shown beside the field */
  label: string;
  /** why it is Manual, or what the NSE figure is made of */
  detail: string;
}

export interface Valuation {
  pe: ValuationInput;
  peAvg: ValuationInput;
}

const NSE_LABEL = "NSE close, estimated live";
const MANUAL = "Manual";
const fmtDate = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/** Why NSE's figures are not being used, in words, or null when they can be. */
export function whyManual(indexPE: IndexPE | null | undefined): string | null {
  if (!indexPE) return "NSE's P/E is not stored for this index yet.";
  if (indexPE.stale) {
    const n = indexPE.tradingDaysOld;
    return `NSE's last stored close (${fmtDate(indexPE.asOfDate)}) is ${n} trading days old, more than ${MAX_AGE_TRADING_DAYS}.`;
  }
  return null;
}

export function resolveValuation(indexPE: IndexPE | null | undefined, typed: { pe?: number; peAvg?: number }): Valuation {
  const why = whyManual(indexPE);
  const fresh = !why && indexPE ? indexPE : null;

  let pe: ValuationInput;
  if (typed.pe != null) pe = { value: typed.pe, source: "typed", label: MANUAL, detail: "You typed this value." };
  else if (fresh) {
    const live = fresh.livePE;
    pe = {
      value: live ?? fresh.value,
      source: "nse",
      label: live != null ? NSE_LABEL : "NSE close",
      detail: `NSE close of ${fmtDate(fresh.asOfDate)}: P/E ${fresh.value.toFixed(2)}${live != null ? `, scaled to the live index level: ${live.toFixed(2)}` : ""}.`,
    };
  } else pe = { value: MANUAL_PE, source: "manual", label: MANUAL, detail: `${why} Enter the figure yourself.` };

  let peAvg: ValuationInput;
  if (typed.peAvg != null) peAvg = { value: typed.peAvg, source: "typed", label: MANUAL, detail: "You typed this value." };
  else if (fresh && fresh.medianPE != null) {
    peAvg = { value: fresh.medianPE, source: "nse", label: `Median of ${fresh.historyDays} stored days`, detail: `Median of the ${fresh.historyDays} daily closes stored so far.` };
  } else {
    const detail = why ?? `Only ${fresh?.historyDays ?? 0} days of history are stored; a median needs ${MIN_HISTORY_DAYS}.`;
    peAvg = { value: MANUAL_PE_AVG, source: "manual", label: MANUAL, detail: `${detail} Enter the figure yourself.` };
  }
  return { pe, peAvg };
}
