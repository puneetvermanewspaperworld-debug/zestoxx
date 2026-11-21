/** What a hidden amount shows instead. The portfolio's value is **** and profit and loss is ***. */
export const MASK_VALUE = "****";
export const MASK_PNL = "***";

/** A portfolio value (cash, holdings value, total value), or **** when privacy mode is on. */
export const maskValue = (text: string, hidden: boolean): string => (hidden ? MASK_VALUE : text);
/** A profit or loss, or *** when privacy mode is on. */
export const maskPnl = (text: string, hidden: boolean): string => (hidden ? MASK_PNL : text);
