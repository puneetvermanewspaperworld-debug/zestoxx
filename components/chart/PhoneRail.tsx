"use client";

import React, { useState } from "react";
import { Eye, EyeOff, Lock, LockOpen, Magnet, Pin, Redo2, Star, Trash2, Undo2, ZoomIn } from "lucide-react";
import { TOOLS, type ToolId } from "@/lib/chart/drawings";
import { pinFirst } from "@/lib/chart/favourites";
import Sheet from "./Sheet";
import { TOOL_ICON, tap44 } from "./toolMeta";
import type { DrawingsApi } from "./useDrawings";

/** The tools in the order of the rail; the ones after the actions are the less used. Starred tools come first of all (after Select). */
const MAIN: ToolId[] = ["trend", "channel", "fib", "text", "brush", "measure"];
const MORE: ToolId[] = ["hline", "ray", "rect"];
const label = (id: ToolId) => TOOLS.find((t) => t.id === id)?.label ?? id;

/**
 * The phone's tool rail: a full-height column at the left of the plot, always there, every button 44 px, scrolling when the plot is too
 * short to show them all. Select, the drawing tools, zoom, then the drawing actions (the drawing magnet, stay in drawing mode, lock all,
 * hide all, delete), then the star mode and the less used tools. It takes room beside the plot, so nothing it holds covers a candle.
 */
export default function PhoneRail({ api, zoomOn, onZoom, onPick, favs, onToggleFav }: { /** a tool was chosen (so zoom, which is not a drawing tool, lets go of the plot) */ onPick: () => void; api: DrawingsApi; zoomOn: boolean; onZoom: () => void; favs: string[]; onToggleFav: (id: string) => void }) {
  // Star mode: a tap on a tool stars it instead of choosing it. Starred tools come first.
  const [pinning, setPinning] = useState(false);
  // delete with nothing selected means all of them: one tap is not enough for that, it asks first
  const [askDeleteAll, setAskDeleteAll] = useState(false);
  const ordered = pinFirst([...MAIN, ...MORE], favs, (id) => id);
  const starred = ordered.filter((id) => favs.includes(id));
  const rest = ordered.filter((id) => !favs.includes(id));
  const count = api.drawings.length;

  const toolButton = (id: ToolId) => {
    const Icon = TOOL_ICON[id];
    const isStarred = favs.includes(id);
    return (
      <div key={id} className="relative shrink-0" data-testid={`tool-row-${id}`}>
        <button
          type="button"
          title={label(id)}
          aria-label={label(id)}
          aria-pressed={api.tool === id}
          data-testid={`tool-${id}`}
          onClick={() => {
            if (pinning) return onToggleFav(id);
            onPick();
            api.setTool(api.tool === id ? "select" : id);
          }}
          className={tap44(api.tool === id && !pinning) + " relative"}
        >
          <Icon size={18} aria-hidden />
          {isStarred && <Star size={9} aria-hidden fill="currentColor" className="pointer-events-none absolute right-1 top-1 text-amber-500" data-testid={`tool-starred-${id}`} />}
        </button>
        {pinning && (
          <button type="button" aria-pressed={isStarred} aria-label={`${isStarred ? "Unstar" : "Star"} ${label(id)}`} data-testid={`tool-star-${id}`} onClick={() => onToggleFav(id)} className="absolute inset-0 flex items-start justify-end rounded-lg bg-slate-900/10 p-1 text-amber-500">
            <Star size={14} aria-hidden fill={isStarred ? "currentColor" : "none"} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div role="toolbar" aria-label="Drawing tools" aria-orientation="vertical" data-testid="tool-rail" data-open="1" className="flex w-[52px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto overscroll-contain border-r border-slate-100 bg-white py-1">
      <div className="shrink-0" data-testid="tool-row-select">
        <button type="button" title="Select" aria-label="Select" aria-pressed={api.tool === "select" && !zoomOn} data-testid="tool-select" onClick={() => {
            onPick();
            api.setTool("select");
          }}
          className={tap44(api.tool === "select" && !zoomOn) + " shrink-0"}
        >
          <TOOL_ICON.select size={18} aria-hidden />
        </button>
      </div>
      {starred.map(toolButton)}
      {rest.filter((id) => MAIN.includes(id)).map(toolButton)}
      <button type="button" title="Zoom: drag across the part of the chart to fill the screen with" aria-label="Zoom" aria-pressed={zoomOn} data-testid="rail-zoom" onClick={onZoom} className={tap44(zoomOn) + " shrink-0"}>
        <ZoomIn size={18} aria-hidden />
      </button>
      <span className="my-0.5 h-px w-8 shrink-0 bg-slate-200" aria-hidden />
      <button type="button" title="Snap to a candle's open, high, low or close" aria-label="Magnet" aria-pressed={api.magnet} data-testid="magnet" onClick={api.toggleMagnet} className={tap44(api.magnet) + " shrink-0"}>
        <Magnet size={18} aria-hidden />
      </button>
      <button type="button" title="Keep the tool after each drawing" aria-label="Stay in drawing mode" aria-pressed={api.stay} data-testid="stay" onClick={api.toggleStay} className={tap44(api.stay) + " shrink-0"}>
        <Pin size={18} aria-hidden />
      </button>
      <button type="button" aria-label={api.allLocked ? "Unlock all drawings" : "Lock all drawings"} aria-pressed={api.allLocked} disabled={count === 0} data-testid="lock-all" onClick={api.lockAll} className={tap44(api.allLocked) + " shrink-0"}>
        {api.allLocked ? <Lock size={18} aria-hidden /> : <LockOpen size={18} aria-hidden />}
      </button>
      <button type="button" aria-label={api.hidden ? "Show all drawings" : "Hide all drawings"} aria-pressed={api.hidden} data-testid="hide-all" onClick={api.toggleHidden} className={tap44(api.hidden) + " shrink-0"}>
        {api.hidden ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
      <button
        type="button"
        aria-label={api.selectedId ? "Delete the selected drawing" : `Delete all drawings (${count})`}
        title={api.selectedId ? "Delete the selected drawing" : "Delete all drawings"}
        disabled={count === 0}
        data-testid="rail-delete"
        data-count={count}
        onClick={() => (api.selectedId ? api.remove(api.selectedId) : setAskDeleteAll(true))}
        className={tap44(false, true) + " relative shrink-0"}
      >
        <Trash2 size={18} aria-hidden />
        {count > 0 && (
          <span aria-hidden className="pointer-events-none absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-blue-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {count}
          </span>
        )}
      </button>
      <button type="button" aria-label="Undo" title="Undo" disabled={!api.canUndo} data-testid="rail-undo" onClick={api.undo} className={tap44() + " shrink-0"}>
        <Undo2 size={18} aria-hidden />
      </button>
      <button type="button" aria-label="Redo" title="Redo" disabled={!api.canRedo} data-testid="rail-redo" onClick={api.redo} className={tap44() + " shrink-0"}>
        <Redo2 size={18} aria-hidden />
      </button>
      <span className="my-0.5 h-px w-8 shrink-0 bg-slate-200" aria-hidden />
      <button type="button" aria-pressed={pinning} aria-label={pinning ? "Done starring tools" : "Star tools to pin them to the top"} title="Star tools to pin them to the top" data-testid="tool-pin-mode" onClick={() => setPinning((v) => !v)} className={tap44(pinning) + " shrink-0"}>
        <Star size={18} aria-hidden fill={pinning ? "currentColor" : "none"} />
      </button>
      {rest.filter((id) => MORE.includes(id)).map(toolButton)}
      {askDeleteAll && (
        <Sheet title="Delete all drawings?" onClose={() => setAskDeleteAll(false)} testId="delete-all-sheet">
          <p className="px-3 pb-3 pt-1 text-[13px] leading-relaxed text-slate-600">
            This removes all {count} {count === 1 ? "drawing" : "drawings"} on this chart. Undo brings them back.
          </p>
          <div className="flex flex-wrap gap-2 px-3 pb-2">
            <button
              type="button"
              data-testid="delete-all-confirm"
              onClick={() => {
                api.deleteAll();
                setAskDeleteAll(false);
              }}
              className="min-h-[44px] rounded-lg bg-rose-600 px-4 text-[13px] font-semibold text-white"
            >
              Delete all {count}
            </button>
            <button type="button" data-testid="delete-all-cancel" onClick={() => setAskDeleteAll(false)} className="min-h-[44px] rounded-lg border border-slate-200 px-4 text-[13px] text-slate-600">
              Cancel
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
