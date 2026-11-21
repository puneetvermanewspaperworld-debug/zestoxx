"use client";

import React, { useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export type DrawerTab = "trade" | "orders" | "positions";

/** Height of the collapsed drawer (a grip and one row of 44 px buttons), without the bottom safe area. */
export const DRAWER_PX = 56;
const GRIP_PX = 12;

/**
 * Drag handlers for a region of the drawer (the whole collapsed row, or the open drawer's header). A finger that lands on a button is still
 * a tap until it has moved 8 px; after that it is a drag of the drawer and the button does not get the click. (A touch screen snaps a touch
 * near a button to the button, so the thin grip alone could not be relied on to start a drag.)
 */
function useDragRegion({ from, full, onHeight, onEnd }: { from: () => number; full: () => number; /** the drawer's height while the finger moves */ onHeight: (h: number | null) => void; /** the finger lifted: open or not */ onEnd: (open: boolean) => void }) {
  const start = useRef<{ y: number; from: number; full: number; dragging: boolean } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { y: e.clientY, from: from(), full: full(), dragging: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s) return;
      if (!s.dragging) {
        if (Math.abs(e.clientY - s.y) < 8) return;
        s.dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      onHeight(Math.max(DRAWER_PX, Math.min(s.full, s.from + (s.y - e.clientY))));
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s?.dragging) return;
      onHeight(null);
      onEnd(s.from + (s.y - e.clientY) > (DRAWER_PX + s.full) / 2);
    },
    onPointerCancel: () => {
      start.current = null;
      onHeight(null);
    },
  };
}

/**
 * The pull-up drawer under the chart. Collapsed it is one slim row: a button to open it and the two order buttons. Dragging the grip up
 * (or tapping the arrow, or an order button) opens it over the foot of the screen with three tabs: Trade (the order form), Open Orders and
 * Positions, all for the symbol on the chart. Dragging the grip down, or the arrow, closes it. The chart does not resize while it moves.
 */
export default function TradeDrawer({ symbol, buttons, tabs, counts, open, onOpenChange, tab, onTab }: {
  symbol: string;
  /** the two order buttons of the collapsed row */
  buttons: React.ReactNode;
  tabs: Record<DrawerTab, React.ReactNode>;
  counts: { orders: number; positions: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: DrawerTab;
  onTab: (t: DrawerTab) => void;
}) {
  const safe = "env(safe-area-inset-bottom)";
  // while a finger drags the grip: the drawer's height in pixels (null: not dragging)
  const [dragH, setDragH] = useState<number | null>(null);
  const full = () => Math.min(Math.round(window.innerHeight * 0.78), 640);
  const height = dragH ?? (open ? full() : null);
  const collapsedDrag = useDragRegion({ from: () => DRAWER_PX, full, onHeight: setDragH, onEnd: onOpenChange });
  const headerDrag = useDragRegion({ from: () => height ?? full(), full, onHeight: setDragH, onEnd: onOpenChange });

  const panelShown = height !== null;
  const TABS: [DrawerTab, string][] = [
    ["trade", "Trade"],
    ["orders", counts.orders > 0 ? `Open Orders (${counts.orders})` : "Open Orders"],
    ["positions", counts.positions > 0 ? `Positions (${counts.positions})` : "Positions"],
  ];

  return (
    <>
      {/* collapsed: the row that is always under the chart */}
      <div data-testid="drawer-collapsed" inert={open} {...collapsedDrag} className="relative shrink-0 touch-none border-t border-slate-200 bg-white" style={{ height: `calc(${DRAWER_PX}px + ${safe})`, paddingBottom: safe }}>
        <div data-testid="drawer-grip" role="presentation" onClick={() => onOpenChange(true)} className="flex cursor-grab justify-center" style={{ height: GRIP_PX }}>
          <span className="mt-1 h-1 w-10 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center gap-1.5 px-1.5">
          <button type="button" aria-label="Open the trade drawer" aria-expanded={open} data-testid="drawer-toggle" onClick={() => onOpenChange(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600">
            <ChevronUp size={20} aria-hidden />
          </button>
          {buttons}
        </div>
      </div>
      {/* open, or being dragged: over the foot of the screen */}
      {panelShown && (
        <div
          role="dialog"
          aria-label={`Trade drawer for ${symbol}`}
          aria-modal={open ? true : undefined}
          data-testid="drawer"
          data-open={open ? "1" : "0"}
          className={"absolute inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.18)] " + (dragH === null ? "transition-[height] duration-150" : "")}
          style={{ height: height ?? undefined }}
        >
          <div data-testid="drawer-header" {...headerDrag} className="shrink-0 touch-none">
          <div data-testid="drawer-panel-grip" role="presentation" onClick={() => onOpenChange(false)} className="flex cursor-grab justify-center" style={{ height: GRIP_PX }}>
            <span className="mt-1 h-1 w-10 rounded-full bg-slate-300" />
          </div>
          <div className="flex items-center border-b border-slate-100 px-1">
            <div role="tablist" aria-label="Trade drawer" className="flex min-w-0 flex-1 items-center">
              {TABS.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`drawer-tab-${id}`} onClick={() => onTab(id)} className={"flex min-h-[44px] min-w-0 flex-1 items-center justify-center whitespace-nowrap border-b-2 px-1 text-[12px] font-semibold " + (tab === id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500")}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" aria-label="Close the trade drawer" data-testid="drawer-close" onClick={() => onOpenChange(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600">
              <ChevronDown size={20} aria-hidden />
            </button>
          </div>
          </div>
          <div role="tabpanel" data-testid={`drawer-panel-${tab}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" style={{ paddingBottom: `calc(12px + ${safe})` }}>
            {tabs[tab]}
          </div>
        </div>
      )}
    </>
  );
}
