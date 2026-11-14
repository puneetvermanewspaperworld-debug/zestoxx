"use client";

import React, { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, Lock, LockOpen, Trash2 } from "lucide-react";
import { COLORS, DASHES, WIDTHS, type Dash, type Drawing, type Width } from "@/lib/chart/drawings";
import type { DrawingsApi } from "./useDrawings";

const btn = (on = false, danger = false) =>
  "flex min-h-[40px] min-w-[40px] items-center justify-center gap-1 rounded-md border px-2 text-[11.5px] font-medium transition-colors disabled:opacity-40 " +
  (on ? "border-blue-300 bg-blue-50 text-blue-700" : danger ? "border-slate-200 text-slate-500 hover:text-rose-500" : "border-slate-200 text-slate-600 hover:text-slate-900");

export default function ChartToolbox({ api, cloneBy }: { api: DrawingsApi; cloneBy: (d: Drawing) => { dTime: number; dPrice: number } }) {
  const { selected } = api;

  // Keys: Delete removes the selected drawing; Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === "Delete" || e.key === "Backspace") && api.selectedId) {
        e.preventDefault();
        api.remove(api.selectedId);
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) api.redo();
        else api.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        api.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);

  return (
    <div className="mb-2 space-y-2 border-b border-blue-50 pb-2.5" data-testid="chart-toolbox">
      <div role="toolbar" aria-label="Drawing actions" className="flex flex-wrap items-center gap-1">
        <button type="button" aria-label={api.hidden ? "Show all drawings" : "Hide all drawings"} aria-pressed={api.hidden} onClick={api.toggleHidden} data-testid="hide-all" className={btn(api.hidden)}>
          {api.hidden ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />} <span className="hidden sm:inline">{api.hidden ? "Show all" : "Hide all"}</span>
        </button>
        <button type="button" aria-label={api.allLocked ? "Unlock all drawings" : "Lock all drawings"} aria-pressed={api.allLocked} disabled={api.drawings.length === 0} onClick={api.lockAll} data-testid="lock-all" className={btn(api.allLocked)}>
          {api.allLocked ? <Lock size={16} aria-hidden /> : <LockOpen size={16} aria-hidden />} <span className="hidden sm:inline">{api.allLocked ? "Unlock all" : "Lock all"}</span>
        </button>
        <button type="button" aria-label="Delete all drawings" disabled={api.drawings.length === 0} onClick={api.deleteAll} data-testid="delete-all" className={btn(false, true)}>
          <Trash2 size={16} aria-hidden /> <span className="hidden sm:inline">Delete all</span>
        </button>
        <span data-testid="drawing-count" className="ml-auto text-[10.5px] text-slate-400">
          {api.drawings.length} {api.drawings.length === 1 ? "drawing" : "drawings"}
        </span>
      </div>


      {selected && <Properties key={`${selected.id}|${selected.kind === "text" ? selected.text : ""}|${selected.kind === "hline" ? selected.price : ""}`} d={selected} api={api} cloneBy={cloneBy} />}
    </div>
  );
}

/** Style and actions for the selected drawing. A text or price field is applied when it is left or Enter is pressed: one undo step, not one per key. */
function Properties({ d, api, cloneBy }: { d: Drawing; api: DrawingsApi; cloneBy: (d: Drawing) => { dTime: number; dPrice: number } }) {
  const [price, setPrice] = useState(d.kind === "hline" ? String(d.price) : "");
  const [text, setText] = useState(d.kind === "text" ? d.text : "");
  const commitPrice = () => {
    const v = Number(price);
    if (d.kind === "hline" && Number.isFinite(v) && v > 0 && v !== d.price) api.update(d.id, { price: v } as Partial<Drawing>);
    else if (d.kind === "hline") setPrice(String(d.price));
  };
  const commitText = () => {
    if (d.kind === "text") {
      const v = text.trim() || "Note";
      if (v !== d.text) api.update(d.id, { text: v } as Partial<Drawing>);
    }
  };
  return (
    <div role="group" aria-label="Selected drawing" data-testid="properties" className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
      <div role="group" aria-label="Colour" className="flex gap-1">
        {COLORS.map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={d.color === c} data-testid={`colour-${c.slice(1)}`} onClick={() => api.update(d.id, { color: c })} className={"h-8 w-8 rounded-full border-2 " + (d.color === c ? "border-slate-900" : "border-white")} style={{ background: c }} />
        ))}
      </div>
      <div role="group" aria-label="Line width" className="flex gap-1">
        {WIDTHS.map((w) => (
          <button key={w} type="button" aria-label={`Width ${w}`} aria-pressed={d.width === w} data-testid={`width-${w}`} onClick={() => api.update(d.id, { width: w as Width })} className={btn(d.width === w)}>
            {w}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Line style" className="flex gap-1">
        {DASHES.map((s) => (
          <button key={s} type="button" aria-label={`Style ${s}`} aria-pressed={d.dash === s} data-testid={`dash-${s}`} onClick={() => api.update(d.id, { dash: s as Dash })} className={btn(d.dash === s)}>
            {s === "solid" ? "──" : s === "dashed" ? "– –" : "···"}
          </button>
        ))}
      </div>
      {d.kind === "hline" && (
        <label className="flex items-center gap-1 text-[11.5px] text-slate-600">
          Price
          <input
            data-testid="level-price"
            type="number"
            inputMode="decimal"
            step="any"
            value={price}
            disabled={d.locked}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), undefined)}
            className="w-28 rounded-md border border-slate-200 bg-white px-2 py-2 font-mono text-[12px] outline-none focus:border-blue-400"
          />
        </label>
      )}
      {d.kind === "text" && (
        <label className="flex items-center gap-1 text-[11.5px] text-slate-600">
          Text
          <input data-testid="note-text" value={text} maxLength={120} disabled={d.locked} onChange={(e) => setText(e.target.value)} onBlur={commitText} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), undefined)} className="w-40 rounded-md border border-slate-200 bg-white px-2 py-2 text-[12px] outline-none focus:border-blue-400" />
        </label>
      )}
      {d.kind === "rect" && (
        <button type="button" aria-pressed={d.midline} data-testid="midline" disabled={d.locked} onClick={() => api.update(d.id, { midline: !d.midline } as Partial<Drawing>)} className={btn(d.midline)}>
          Midline
        </button>
      )}
      <div className="ml-auto flex gap-1">
        <button type="button" aria-label={d.locked ? "Unlock" : "Lock"} aria-pressed={d.locked} data-testid="lock" onClick={() => api.toggleLock(d.id)} className={btn(d.locked)}>
          {d.locked ? <Lock size={16} aria-hidden /> : <LockOpen size={16} aria-hidden />}
        </button>
        <button
          type="button"
          aria-label="Clone"
          data-testid="clone"
          onClick={() => {
            const o = cloneBy(d);
            api.clone(d.id, o.dTime, o.dPrice);
          }}
          className={btn()}
        >
          <Copy size={16} aria-hidden />
        </button>
        <button type="button" aria-label="Delete" data-testid="delete" onClick={() => api.remove(d.id)} className={btn(false, true)}>
          <Trash2 size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
