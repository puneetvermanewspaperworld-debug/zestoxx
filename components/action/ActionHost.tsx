"use client";

import { useScreenMode } from "@/lib/useScreenMode";
import { useAction } from "./useAction";
import OrderScreen from "./OrderScreen";

/**
 * Draws the action screen named by the address, over whatever page is open, on a phone. (A wide screen keeps the forms it has always had.)
 * Each kind of screen is added here as it is built.
 */
export default function ActionHost() {
  const mode = useScreenMode();
  const { current, closeAction, leaveTo } = useAction();
  if (mode === "wide" || !current) return null;
  switch (current.kind) {
    case "order":
      return <OrderScreen key={`order-${current.symbol}-${current.side}-${current.qty ?? ""}`} symbol={current.symbol} side={current.side} qty={current.qty} onClose={closeAction} onLeave={leaveTo} />;
    default:
      return null;
  }
}
