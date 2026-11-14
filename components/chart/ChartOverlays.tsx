"use client";

import React from "react";
import { Check, ChevronLeft, Magnet, PencilRuler, Pin, Redo2, Trash2, Undo2 } from "lucide-react";
import { TOOLS } from "@/lib/chart/drawings";
import { TOOL_HINT, TOOL_ICON, tap44 } from "./toolMeta";
import type { DrawingsApi } from "./useDrawings";

/**
 * The tool rail (left edge of the chart, collapsible) and the floating quick-tool bar (top). Both float over the chart but only their
 * buttons take touches, so the rest of the chart pans, pinches and scrolls as usual. Every button is 44 px, the size of a finger.
 */
export function ToolRail({ api, open, onToggle }: { api: DrawingsApi; open: boolean; onToggle: () => void }) {
  return (
    <div className="pointer-events-none absolute bottom-1 left-1 top-1 z-20 flex flex-col items-start gap-1" data-testid="tool-rail" data-open={open ? "1" : "0"}>
      <button type="button" aria-label={open ? "Hide drawing tools" : "Show drawing tools"} aria-expanded={open} data-testid="rail-toggle" onClick={onToggle} className={tap44(false) + " shrink-0 bg-white/95 shadow ring-1 ring-slate-200"}>
        {open ? <ChevronLeft size={18} aria-hidden /> : <PencilRuler size={18} aria-hidden />}
      </button>
      {open && (
        <div role="toolbar" aria-label="Drawing tools" className="pointer-events-auto flex min-h-0 flex-col gap-0.5 overflow-y-auto rounded-lg bg-white/95 p-0.5 shadow ring-1 ring-slate-200">
          {TOOLS.map((t) => {
            const Icon = TOOL_ICON[t.id];
            return (
              <button key={t.id} type="button" title={t.label} aria-label={t.label} aria-pressed={api.tool === t.id} data-testid={`tool-${t.id}`} onClick={() => api.setTool(api.tool === t.id && t.id !== "select" ? "select" : t.id)} className={tap44(api.tool === t.id) + " shrink-0"}>
                <Icon size={18} aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function QuickBar({ api }: { api: DrawingsApi }) {
  const Active = TOOL_ICON[api.tool];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1 z-20 flex flex-col items-end gap-1 pl-14 pr-16" data-testid="quick-bar-wrap">
      <div role="toolbar" aria-label="Quick tools" data-testid="quick-bar" className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-white/95 p-0.5 shadow ring-1 ring-slate-200">
        {api.tool !== "select" && (
          <button type="button" aria-label="Done drawing" title="Done: back to select" data-testid="done" onClick={() => api.setTool("select")} className={tap44(true) + " rounded-full"}>
            <Active size={16} aria-hidden />
            <Check size={14} aria-hidden />
          </button>
        )}
        <button type="button" aria-label="Undo" title="Undo" disabled={!api.canUndo} onClick={api.undo} data-testid="undo" className={tap44() + " rounded-full"}>
          <Undo2 size={18} aria-hidden />
        </button>
        <button type="button" aria-label="Redo" title="Redo" disabled={!api.canRedo} onClick={api.redo} data-testid="redo" className={tap44() + " rounded-full"}>
          <Redo2 size={18} aria-hidden />
        </button>
        <button type="button" aria-label="Magnet" aria-pressed={api.magnet} title="Snap to a candle's open, high, low or close" onClick={api.toggleMagnet} data-testid="magnet" className={tap44(api.magnet) + " rounded-full"}>
          <Magnet size={18} aria-hidden />
        </button>
        <button type="button" aria-label="Stay in drawing mode" aria-pressed={api.stay} title="Keep the tool after each drawing" onClick={api.toggleStay} data-testid="stay" className={tap44(api.stay) + " rounded-full"}>
          <Pin size={18} aria-hidden />
        </button>
        {api.selectedId && (
          <button type="button" aria-label="Delete selected drawing" title="Delete" data-testid="quick-delete" onClick={() => api.selectedId && api.remove(api.selectedId)} className={tap44(false, true) + " rounded-full"}>
            <Trash2 size={18} aria-hidden />
          </button>
        )}
      </div>
      {api.tool !== "select" && (
        <p data-testid="tool-hint" className="pointer-events-none rounded-full bg-slate-900/85 px-3 py-1 text-[11.5px] text-white">
          {TOOL_HINT[api.tool]}
        </p>
      )}
    </div>
  );
}
