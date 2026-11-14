"use client";

import React, { useState } from "react";
import { ChevronDown, FunctionSquare, Plus, Search, Trash2 } from "lucide-react";
import { PATTERNS, PATTERN_THRESHOLDS } from "@/lib/chart/patterns";
import { MAX_STUDIES } from "@/lib/chart/settings";
import { STUDIES, STUDY_MAP, checkParams, searchStudies, studyAvailability, studyTitle, type StudyContext, type StudyInstance, type StudyResult } from "@/lib/chart/studies";
import Sheet, { Badge, controlBtn, rowClass } from "./Sheet";

export interface StudiesApi {
  studies: StudyInstance[];
  results: StudyResult[];
  /** what the bars on the chart allow */
  context: StudyContext;
  add: (id: string) => void;
  remove: (uid: number) => void;
  clear: () => void;
  setParams: (uid: number, params: Record<string, number>) => void;
}

/** The Studies button and its menu: the studies on the chart (with editable parameters, remove and Clear all) and a searchable list to add from. */
export default function StudiesMenu({ api, openFor, onClosed }: { api: StudiesApi; /** open straight on this study's parameters (from the legend) */ openFor: { uid: number; n: number } | null; onClosed: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [seenRequest, setSeenRequest] = useState(0);

  // asked from the legend: open on that study's parameters
  if (openFor && openFor.n !== seenRequest) {
    setSeenRequest(openFor.n);
    setEditing(openFor.uid);
    setOpen(true);
  }
  const close = () => {
    setOpen(false);
    setEditing(null);
    onClosed();
  };
  const full = api.studies.length >= MAX_STUDIES;
  const list = searchStudies(query);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Studies: ${api.studies.length} on the chart`} data-testid="studies-button" className={controlBtn(api.studies.length > 0)}>
        <FunctionSquare size={18} aria-hidden />
        <span className="hidden sm:inline">Studies</span>
        {api.studies.length > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[10.5px] text-white">{api.studies.length}</span>}
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <Sheet title="Studies" onClose={close} testId="studies-sheet">
          <section aria-label="Current studies" data-testid="current-studies">
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Current studies</h3>
              {api.studies.length > 0 && (
                <button type="button" onClick={api.clear} data-testid="studies-clear" className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-rose-600 hover:bg-rose-50">
                  <Trash2 size={14} aria-hidden /> Clear all
                </button>
              )}
            </div>
            {api.studies.length === 0 && <p className="px-3 pb-2 text-[12px] text-slate-400">No studies on the chart. Add one below.</p>}
            {api.studies.map((s) => {
              const def = STUDY_MAP[s.id];
              if (!def) return null;
              const result = api.results.find((r) => r.instance.uid === s.uid);
              const avail = result?.availability ?? studyAvailability(def, api.context);
              const isEditing = editing === s.uid;
              return (
                <div key={s.uid} data-testid={`current-${s.uid}`} className="rounded-lg border border-slate-100 p-1">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setEditing(isEditing ? null : s.uid)} aria-expanded={isEditing} data-testid={`current-edit-${s.uid}`} className={rowClass(isEditing) + " flex-1"} disabled={def.params.length === 0}>
                      <span className="flex-1">{studyTitle(def, s.params)}</span>
                      {def.experimental && <Badge>Experimental</Badge>}
                      {!avail.ok && <span className="text-[11px] text-amber-700">{avail.reason}</span>}
                      {def.params.length > 0 && <span className="text-[11.5px] text-blue-600">{isEditing ? "Done" : "Edit"}</span>}
                    </button>
                    <button type="button" onClick={() => api.remove(s.uid)} aria-label={`Remove ${studyTitle(def, s.params)}`} data-testid={`current-remove-${s.uid}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-rose-500">
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                  {isEditing && <ParamEditor key={`${s.uid}`} instance={s} onValid={(values) => api.setParams(s.uid, values)} />}
                </div>
              );
            })}
          </section>

          <section aria-label="Add a study" className="mt-1 border-t border-slate-100 pt-1">
            <h3 className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Add a study</h3>
            <label className="relative mx-2 mb-1 block">
              <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search studies"
                aria-label="Search studies"
                data-testid="studies-search"
                className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] outline-none focus:border-blue-400"
              />
            </label>
            {full && (
              <p role="status" data-testid="studies-full" className="px-3 pb-1 text-[11.5px] text-amber-700">
                {MAX_STUDIES} studies is the most; remove one to add another.
              </p>
            )}
            {list.length === 0 && (
              <p data-testid="studies-none" className="px-3 py-2 text-[12px] text-slate-400">
                No study matches “{query}”.
              </p>
            )}
            {list.map((def) => {
              const avail = studyAvailability(def, api.context);
              const off = !avail.ok || full;
              return (
                <button key={def.id} type="button" disabled={off} aria-disabled={off} onClick={() => api.add(def.id)} data-testid={`add-${def.id}`} className={rowClass() + (off ? " opacity-50" : "")}>
                  <Plus size={16} aria-hidden className="shrink-0 text-slate-400" />
                  <span className="flex-1">
                    {def.name}
                    {def.note && <span className="block text-[11px] text-slate-400">{def.note}</span>}
                  </span>
                  {def.experimental && <Badge>Experimental</Badge>}
                  {!avail.ok ? <span className="text-[11px] text-amber-700">{avail.reason}</span> : <span className="text-[11px] text-slate-400">{def.placement === "pane" ? "own pane" : "on price"}</span>}
                </button>
              );
            })}
          </section>
          <details className="mx-3 mb-1 text-[11px] text-slate-500" data-testid="pattern-rules">
            <summary className="flex min-h-[44px] cursor-pointer items-center">How the candlestick patterns are decided</summary>
            <p className="pb-2 leading-relaxed">
              Fixed rules on the shape of a candle (a body of at most {PATTERN_THRESHOLDS.dojiBody * 100}% of its range for a doji; shadows {PATTERN_THRESHOLDS.longShadow}x and {PATTERN_THRESHOLDS.shortShadow}x the body for a hammer or shooting star). No trend filter and no prediction: they describe what a candle looks like. They are not buy or sell signals.
            </p>
            <ul className="space-y-0.5 pb-2">
              {PATTERNS.map((p) => (
                <li key={p.id}>
                  <b>{p.label}</b>: {p.rule}
                </li>
              ))}
            </ul>
          </details>
          <p className="px-3 pb-2 pt-1 text-[11px] leading-relaxed text-slate-400">{STUDIES.length} studies. Volume studies and VWAP need real volume (indices and crypto have none here); VWAP is for intraday charts only.</p>
        </Sheet>
      )}
    </>
  );
}

/** The parameters of one study as fields. A value is applied as soon as it is valid; one that is not is explained and not applied. */
function ParamEditor({ instance, onValid }: { instance: StudyInstance; onValid: (values: Record<string, number>) => void }) {
  const def = STUDY_MAP[instance.id];
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(def.params.map((q) => [q.key, String(instance.params[q.key] ?? q.def)])));
  const [message, setMessage] = useState<string | null>(null);
  const change = (key: string, v: string) => {
    const next = { ...text, [key]: v };
    setText(next);
    const chk = checkParams(def, next);
    if (chk.ok) {
      setMessage(null);
      onValid(chk.values);
    } else setMessage(chk.message);
  };
  return (
    <div className="space-y-2 px-3 pb-2 pt-1" data-testid={`params-${instance.uid}`}>
      <div className="flex flex-wrap gap-3">
        {def.params.map((q) => (
          <label key={q.key} className="flex items-center gap-2 text-[12px] text-slate-600">
            {q.label}
            <input
              data-testid={`param-${instance.uid}-${q.key}`}
              inputMode={q.integer ? "numeric" : "decimal"}
              value={text[q.key]}
              onChange={(e) => change(q.key, e.target.value)}
              aria-invalid={!!message}
              className="min-h-[44px] w-24 rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-[13px] outline-none focus:border-blue-400"
            />
          </label>
        ))}
      </div>
      {message && (
        <p role="alert" data-testid={`param-error-${instance.uid}`} className="text-[12px] text-rose-500">
          {message}
        </p>
      )}
    </div>
  );
}
