import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during SSR and the hydration render, true afterwards. Use it to defer anything
 * that depends on the current date/time or the browser, so the server-prerendered HTML
 * (baked at build time) can't disagree with the client and trigger a hydration error.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
