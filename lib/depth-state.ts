import type { DepthLevel } from "./contract";

export type DepthResponse =
  | { source: "live"; bids: DepthLevel[]; asks: DepthLevel[]; totalBuyQty?: number; totalSellQty?: number }
  | { source: "unsupported" }
  | { source: "unavailable" };

export const DEPTH_NOT_AVAILABLE = "Depth not available for this symbol";
export const DEPTH_WHEN_OPEN = "Available when the market is open";

export type DepthView =
  | { kind: "loading" }
  | { kind: "levels"; bids: DepthLevel[]; asks: DepthLevel[] }
  | { kind: "message"; text: string };

/**
 * What the order book shows for a depth answer. Real levels or a message, never anything else: no answer, an
 * unsupported symbol (index, crypto) or a failure all say so, and a real but empty book outside market hours says
 * when it will be there.
 */
export function depthView(res: DepthResponse | null | undefined, marketOpen: boolean): DepthView {
  if (res === undefined) return { kind: "loading" };
  if (!res || res.source !== "live") return { kind: "message", text: DEPTH_NOT_AVAILABLE };
  const bids = res.bids.filter((l) => l.price > 0 && l.qty > 0);
  const asks = res.asks.filter((l) => l.price > 0 && l.qty > 0);
  if (bids.length === 0 && asks.length === 0) return { kind: "message", text: marketOpen ? DEPTH_NOT_AVAILABLE : DEPTH_WHEN_OPEN };
  return { kind: "levels", bids, asks };
}
