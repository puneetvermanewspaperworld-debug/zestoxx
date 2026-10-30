"use client";

import { useEffect, useState } from "react";
import { toHHMM, type BuildupWindowResponse } from "./buildup-window";

/** What span of the day the buildup is measured over. */
export type RangeSel =
  | { kind: "prev" } // since the previous close (the default — needs no minute data)
  | { kind: "back"; minutes: number } // the last N minutes of the session so far
  | { kind: "custom"; from: number; to: number }; // chosen start/end, minutes after midnight IST

const DEBOUNCE_MS = 350;
const POLL_MS = 30_000;

function queryFor(underlying: string, expiry: string | null, sel: Exclude<RangeSel, { kind: "prev" }>): string {
  const q = new URLSearchParams({ underlying });
  if (expiry) q.set("expiry", expiry);
  if (sel.kind === "back") q.set("back", String(sel.minutes));
  else {
    q.set("from", toHHMM(sel.from));
    q.set("to", toHHMM(sel.to));
  }
  return q.toString();
}

/**
 * Fetches /api/buildup-window for the selected range (idle for "prev"). Changes are debounced so
 * dragging the slider doesn't fire a request per pixel. While a new range loads, the previous
 * answer stays in `res` and `loading` is true, so the page dims instead of flashing empty.
 * "Last N minutes" ranges re-poll, since their end moves with the clock.
 */
export function useBuildupWindow(
  underlying: string,
  expiry: string | null,
  sel: RangeSel,
  enabled: boolean
): { res: BuildupWindowResponse | null; loading: boolean } {
  const query = enabled && sel.kind !== "prev" ? queryFor(underlying, expiry, sel) : null;
  const poll = sel.kind === "back";
  const [state, setState] = useState<{ query: string; res: BuildupWindowResponse } | null>(null);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const load = async () => {
      let res: BuildupWindowResponse = { source: "unavailable", reason: "couldn't reach the server" };
      try {
        const r = await fetch(`/api/buildup-window?${query}`);
        if (r.ok) res = (await r.json()) as BuildupWindowResponse;
      } catch {
        // keep the unavailable answer
      }
      if (!cancelled) setState({ query, res });
    };
    const first = setTimeout(load, DEBOUNCE_MS);
    const timer = poll ? setInterval(load, POLL_MS) : null;
    return () => {
      cancelled = true;
      clearTimeout(first);
      if (timer) clearInterval(timer);
    };
  }, [query, poll]);

  return { res: query ? (state?.res ?? null) : null, loading: !!query && state?.query !== query };
}
