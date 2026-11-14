import React from "react";
import { Brush, Layers, Minus, MousePointer2, MoveUpRight, Rows2, Ruler, Square, TrendingUp, Type } from "lucide-react";
import type { ToolId } from "@/lib/chart/drawings";

/** Our own icons from the lucide set (ISC licence); none of TradingView's. */
export const TOOL_ICON: Record<ToolId, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  select: MousePointer2,
  hline: Minus,
  trend: TrendingUp,
  ray: MoveUpRight,
  rect: Square,
  channel: Rows2,
  fib: Layers,
  brush: Brush,
  text: Type,
  measure: Ruler,
};

export const TOOL_HINT: Record<ToolId, string> = {
  select: "Tap a drawing to select it.",
  hline: "Tap where the level should go.",
  trend: "Tap two points.",
  ray: "Tap two points; the ray runs on from the second.",
  rect: "Tap two opposite corners.",
  channel: "Tap two points; drag the middle handle for the width.",
  fib: "Tap where the move starts, then where it ends.",
  brush: "Press and drag to draw freehand; lift to finish.",
  text: "Tap where the note goes, then type it.",
  measure: "Drag between two points, or tap two.",
};

/** a 44 px button, the size of a finger */
export const tap44 = (on = false, danger = false) =>
  "pointer-events-auto flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-lg px-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-35 " +
  (on ? "bg-blue-600 text-white" : danger ? "text-slate-500 hover:text-rose-500" : "text-slate-600 hover:bg-slate-100");
