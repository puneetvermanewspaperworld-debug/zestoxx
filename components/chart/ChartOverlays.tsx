"use client";

import React, { useState } from "react";
import { Check, ChevronLeft, ListChecks, Magnet, PencilRuler, Pin, Redo2, Star, Trash2, Undo2 } from "lucide-react";
import { TOOLS } from "@/lib/chart/drawings";
import { pinFirst } from "@/lib/chart/favourites";
import { TOOL_HINT, TOOL_ICON, tap44 } from "./toolMeta";
import type { DrawingsApi } from "./useDrawings";

/**
 * The tool rail (left edge of the chart, collapsible) and the floating quick-tool bar (top). Both float over the chart but only their
 * buttons take touches, so the rest of the chart pans, pinches and scrolls as usual. Every button is 44 px, the size of a finger.
 */
export function ToolRail({ api, open, onToggle, favs, onToggleFav, menu }: { /** phones: a button for the drawing actions (hide all, lock all, delete all, how many), kept off the screen's top rows */ menu?: { count: number; onOpen: () => void }; api: DrawingsApi; open: boolean; onToggle: () => void; /** the starred tools, in the order they were starred */ favs: string[]; onToggleFav: (id: string) => void }) {
  // Starring: a pin mode puts a 44 px star beside each tool (so the rail stays one button wide the rest of the time). Starred tools come
  // first, right after Select, which never moves.
  const [pinning, setPinning] = useState(false);
  const ordered = [...TOOLS.filter((t) => t.id === "select"), ...pinFirst(TOOLS.filter((t) => t.id !== "select"), favs, (t) => t.id)];
  return (
    <div className="pointer-events-none absolute bottom-1 left-1 top-1 z-20 flex flex-col items-start gap-1" data-testid="tool-rail" data-open={open ? "1" : "0"}>
      <button type="button" aria-label={open ? "Hide drawing tools" : "Show drawing tools"} aria-expanded={open} data-testid="rail-toggle" onClick={onToggle} className={tap44(false) + " shrink-0 bg-white/95 shadow ring-1 ring-slate-200"}>
        {open ? <ChevronLeft size={18} aria-hidden /> : <PencilRuler size={18} aria-hidden />}
      </button>
      {menu && (
        <button type="button" aria-label={`Drawing actions: ${menu.count} ${menu.count === 1 ? "drawing" : "drawings"}`} data-testid="rail-menu" onClick={menu.onOpen} className={tap44(false) + " pointer-events-auto relative shrink-0 bg-white/95 shadow ring-1 ring-slate-200"}>
          <ListChecks size={18} aria-hidden />
          {menu.count > 0 && (
            <span data-testid="rail-menu-count" className="pointer-events-none absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-blue-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
              {menu.count}
            </span>
          )}
        </button>
      )}
      {open && (
        <div role="toolbar" aria-label="Drawing tools" className="pointer-events-auto flex min-h-0 flex-col gap-0.5 overflow-y-auto rounded-lg bg-white/95 p-0.5 shadow ring-1 ring-slate-200">
          <button type="button" aria-pressed={pinning} aria-label={pinning ? "Done starring tools" : "Star tools to pin them to the top"} title="Star tools to pin them to the top" data-testid="tool-pin-mode" onClick={() => setPinning((v) => !v)} className={tap44(pinning) + " shrink-0"}>
            <Star size={18} aria-hidden fill={pinning ? "currentColor" : "none"} />
          </button>
          {ordered.map((t) => {
            const Icon = TOOL_ICON[t.id];
            const starred = favs.includes(t.id);
            return (
              <div key={t.id} className="flex shrink-0 gap-0.5" data-testid={`tool-row-${t.id}`}>
                <button type="button" title={t.label} aria-label={t.label} aria-pressed={api.tool === t.id} data-testid={`tool-${t.id}`} onClick={() => api.setTool(api.tool === t.id && t.id !== "select" ? "select" : t.id)} className={tap44(api.tool === t.id) + " relative shrink-0"}>
                  <Icon size={18} aria-hidden />
                  {starred && !pinning && <Star size={9} aria-hidden fill="currentColor" className="pointer-events-none absolute right-1 top-1 text-amber-500" data-testid={`tool-starred-${t.id}`} />}
                </button>
                {pinning && t.id !== "select" && (
                  <button type="button" aria-pressed={starred} aria-label={`${starred ? "Unstar" : "Star"} ${t.label}`} data-testid={`tool-star-${t.id}`} onClick={() => onToggleFav(t.id)} className={tap44(starred) + " shrink-0"}>
                    <Star size={16} aria-hidden fill={starred ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function QuickBar({ api, offset = "top-1", flow = false, minimal = false }: { api: DrawingsApi; /** where it sits (a Tailwind top class): lower when a legend line is above it */ offset?: string; /** not floating: laid out where it is put (the phone's stack at the foot of the plot) */ flow?: boolean; /** phones: only done and delete (undo, redo, magnet and stay are in the tool rail) */ minimal?: boolean }) {
  const Active = TOOL_ICON[api.tool];
  return (
    <div className={flow ? "pointer-events-none flex flex-col items-center gap-1" : "pointer-events-none absolute inset-x-0 z-20 flex flex-col items-end gap-1 pl-14 pr-16 " + offset} data-testid="quick-bar-wrap">
      <div role="toolbar" aria-label="Quick tools" data-testid="quick-bar" className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-white/95 p-0.5 shadow ring-1 ring-slate-200">
        {api.tool !== "select" && (
          <button type="button" aria-label="Done drawing" title="Done: back to select" data-testid="done" onClick={() => api.setTool("select")} className={tap44(true) + " rounded-full"}>
            <Active size={16} aria-hidden />
            <Check size={14} aria-hidden />
          </button>
        )}
        {!minimal && <button type="button" aria-label="Undo" title="Undo" disabled={!api.canUndo} onClick={api.undo} data-testid="undo" className={tap44() + " rounded-full"}>
          <Undo2 size={18} aria-hidden />
        </button>}
        {!minimal && <button type="button" aria-label="Redo" title="Redo" disabled={!api.canRedo} onClick={api.redo} data-testid="redo" className={tap44() + " rounded-full"}>
          <Redo2 size={18} aria-hidden />
        </button>}
        {!minimal && <button type="button" aria-label="Magnet" aria-pressed={api.magnet} title="Snap to a candle's open, high, low or close" onClick={api.toggleMagnet} data-testid="magnet" className={tap44(api.magnet) + " rounded-full"}>
          <Magnet size={18} aria-hidden />
        </button>}
        {!minimal && <button type="button" aria-label="Stay in drawing mode" aria-pressed={api.stay} title="Keep the tool after each drawing" onClick={api.toggleStay} data-testid="stay" className={tap44(api.stay) + " rounded-full"}>
          <Pin size={18} aria-hidden />
        </button>}
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
