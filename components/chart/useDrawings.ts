"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloneDrawing, newId, type Drawing, type ToolId } from "@/lib/chart/drawings";
import { canRedo, canUndo, commit, initialHistory, lockAll as lockAllIn, redo as redoH, reset, undo as undoH, without, withUpdated, type History } from "@/lib/chart/history";
import { createAutosaver, localDrawingStore, type DrawingStore } from "@/lib/chart/storage";

const defaultStore = localDrawingStore();

/**
 * The drawings of one symbol and everything done to them: selection, the active tool, undo and redo, the bulk actions, and the
 * debounced autosave. A drag is edited as a live copy and committed once when it ends, so it is one undo step. Switching symbol
 * saves the old one and loads the new one; nothing is saved before its own drawings have loaded (so a slow load never overwrites them).
 */
export function useDrawings(symbol: string, store: DrawingStore = defaultStore) {
  const [history, setHistory] = useState<History>(initialHistory());
  const [live, setLiveState] = useState<Drawing | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setToolState] = useState<ToolId>("select");
  const [stay, setStay] = useState(false);
  const [magnet, setMagnet] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const hist = useRef(history);
  const liveRef = useRef<Drawing | null>(null);
  const setLive = useCallback((d: Drawing | null) => {
    liveRef.current = d;
    setLiveState(d);
  }, []);
  const saver = useRef<ReturnType<typeof createAutosaver> | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    let cancelled = false;
    ready.current = false;
    const s = createAutosaver(store, symbol);
    saver.current = s;
    void store.load(symbol).then((ds) => {
      if (cancelled) return;
      const h = reset(ds);
      hist.current = h;
      setHistory(h);
      setLive(null);
      setSelectedId(null);
      setToolState("select");
      setHidden(false);
      ready.current = true;
      setLoadedFor(symbol);
    });
    const leave = () => void s.flush();
    window.addEventListener("pagehide", leave);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", leave);
      void s.flush();
      saver.current = null;
      ready.current = false;
      setLoadedFor(null);
    };
  }, [symbol, store, setLive]);

  const apply = useCallback((h: History) => {
    hist.current = h;
    setHistory(h);
    if (ready.current) saver.current?.schedule(h.present);
  }, []);
  const present = history.present;
  const drawings = useMemo(() => (live ? present.map((d) => (d.id === live.id ? live : d)) : present), [present, live]);

  const select = useCallback((id: string | null) => setSelectedId(id), []);
  const setTool = useCallback(
    (t: ToolId) => {
      setToolState(t);
      setLive(null);
      if (t !== "select") setSelectedId(null);
    },
    [setLive]
  );

  const add = useCallback(
    (d: Drawing) => {
      apply(commit(hist.current, [...hist.current.present, d]));
      setHidden(false);
      setSelectedId(d.id);
      if (!stay) setToolState("select");
    },
    [apply, stay]
  );
  const remove = useCallback(
    (id: string) => {
      apply(commit(hist.current, without(hist.current.present, id)));
      setSelectedId((s) => (s === id ? null : s));
    },
    [apply]
  );
  const update = useCallback((id: string, patch: Partial<Drawing>) => apply(commit(hist.current, withUpdated(hist.current.present, id, patch))), [apply]);
  const clone = useCallback(
    (id: string, dTime: number, dPrice: number) => {
      const d = hist.current.present.find((x) => x.id === id);
      if (!d) return;
      const c = cloneDrawing(d, newId(), dTime, dPrice);
      apply(commit(hist.current, [...hist.current.present, c]));
      setSelectedId(c.id);
    },
    [apply]
  );
  const toggleLock = useCallback(
    (id: string) => {
      const d = hist.current.present.find((x) => x.id === id);
      if (d) apply(commit(hist.current, withUpdated(hist.current.present, id, { locked: !d.locked })));
    },
    [apply]
  );
  /** one gesture = one step: the layer edits a live copy while dragging and commits it when the drag ends */
  const commitLive = useCallback(() => {
    const l = liveRef.current;
    setLive(null);
    if (l) apply(commit(hist.current, withUpdated(hist.current.present, l.id, l)));
  }, [apply, setLive]);

  const lockAll = useCallback(() => {
    const all = hist.current.present.length > 0 && hist.current.present.every((d) => d.locked);
    apply(commit(hist.current, lockAllIn(hist.current.present, !all)));
  }, [apply]);
  const deleteAll = useCallback(() => {
    apply(commit(hist.current, []));
    setSelectedId(null);
  }, [apply]);
  const undo = useCallback(() => {
    const h = undoH(hist.current);
    apply(h);
    setSelectedId((s) => (s && h.present.some((d) => d.id === s) ? s : null));
  }, [apply]);
  const redo = useCallback(() => {
    const h = redoH(hist.current);
    apply(h);
    setSelectedId((s) => (s && h.present.some((d) => d.id === s) ? s : null));
  }, [apply]);

  const selected = drawings.find((d) => d.id === selectedId) ?? null;
  return {
    loaded: loadedFor === symbol,
    drawings,
    selected,
    selectedId,
    tool,
    stay,
    magnet,
    hidden,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    allLocked: present.length > 0 && present.every((d) => d.locked),
    setTool,
    select,
    add,
    remove,
    update,
    clone,
    toggleLock,
    setLive,
    commitLive,
    lockAll,
    deleteAll,
    undo,
    redo,
    toggleStay: () => setStay((v) => !v),
    toggleMagnet: () => setMagnet((v) => !v),
    toggleHidden: () => setHidden((v) => !v),
  };
}

export type DrawingsApi = ReturnType<typeof useDrawings>;
