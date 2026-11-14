import type { AssetType } from "@/lib/types";

/** Every symbol on the terminal is quoted to two decimals (fmt() in lib/helpers.ts shows at most two). */
export const PRICE_DECIMALS = 2;

/** A price rounded to the symbol's precision, as plain digits ("1306.39"): what a number field shows. The stored value is never rounded. */
export const roundPrice = (n: number): string => (Number.isFinite(n) ? n.toFixed(PRICE_DECIMALS) : "");

/** A price for reading, always with two decimals and the digit grouping of its market: "1,306.39" (₹ markets) or "91,500.00" (crypto). */
export function fmtPrice(n: number, type?: AssetType): string {
  return Number.isFinite(n) ? n.toLocaleString(type === "crypto" ? "en-US" : "en-IN", { minimumFractionDigits: PRICE_DECIMALS, maximumFractionDigits: PRICE_DECIMALS }) : "--";
}
