import type { Drawing } from "./drawings";

/**
 * Undo and redo for the drawings. A gesture (a drag, a resize, a colour change) is one step: it is committed once, when it ends,
 * so one undo reverses the whole gesture. Pure: the history is a value, and every function returns a new one.
 */
export interface History {
  past: Drawing[][];
  present: Drawing[];
  future: Drawing[][];
}

export const MAX_STEPS = 100;

export const initialHistory = (present: Drawing[] = []): History => ({ past: [], present, future: [] });

/** Make `next` the present; the old present becomes an undo step and the redo steps are gone. A no-op change adds no step. */
export function commit(h: History, next: Drawing[]): History {
  if (next === h.present || JSON.stringify(next) === JSON.stringify(h.present)) return h;
  return { past: [...h.past, h.present].slice(-MAX_STEPS), present: next, future: [] };
}

export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;

export function undo(h: History): History {
  if (!canUndo(h)) return h;
  const past = h.past.slice(0, -1);
  return { past, present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (!canRedo(h)) return h;
  const [next, ...future] = h.future;
  return { past: [...h.past, h.present], present: next, future };
}

/** Replace the whole history with a fresh one (a different symbol was opened, or drawings were loaded). */
export const reset = (present: Drawing[]): History => initialHistory(present);

/** Bulk actions, each one step. */
export const lockAll = (ds: Drawing[], locked = true): Drawing[] => ds.map((d) => (d.locked === locked ? d : { ...d, locked }));
export const deleteAll = (): Drawing[] => [];
export const withUpdated = (ds: Drawing[], id: string, patch: Partial<Drawing>): Drawing[] => ds.map((d) => (d.id === id ? ({ ...d, ...patch } as Drawing) : d));
export const without = (ds: Drawing[], id: string): Drawing[] => ds.filter((d) => d.id !== id);
