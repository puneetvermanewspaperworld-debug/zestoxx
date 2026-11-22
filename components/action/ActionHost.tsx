"use client";

import { useScreenMode } from "@/lib/useScreenMode";
import { useAction } from "./useAction";
import OrderScreen from "./OrderScreen";
import GttScreen from "./GttScreen";
import AlertScreen from "./AlertScreen";
import NoteScreen from "./NoteScreen";
import OptionScreen from "./OptionScreen";

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
    case "gtt":
      return <GttScreen key={`gtt-${current.symbol}-${current.editId ?? ""}`} symbol={current.symbol} editId={current.editId} onClose={closeAction} onLeave={leaveTo} />;
    case "alert":
      return <AlertScreen key={`alert-${current.symbol}-${current.editId ?? ""}`} symbol={current.symbol} editId={current.editId} onClose={closeAction} onLeave={leaveTo} />;
    case "note":
      return <NoteScreen key={`note-${current.symbol}`} symbol={current.symbol} onClose={closeAction} />;
    case "option":
      return <OptionScreen key={`option-${current.underlying}-${current.expiry}-${current.strike}-${current.type}-${current.side}`} underlying={current.underlying} expiry={current.expiry} strike={current.strike} type={current.type} side={current.side} onClose={closeAction} onLeave={leaveTo} />;
    default:
      return null;
  }
}
