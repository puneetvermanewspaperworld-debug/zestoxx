"use client";

import { useSyncExternalStore } from "react";

/**
 * Which layout the Trade chart page uses:
 *   "wide"      a tablet or desktop window
 *   "portrait"  a phone held upright (a window narrower than 768 px)
 *   "landscape" a phone turned sideways (short and wide: 500 px tall or less, 950 px wide or less)
 * It matches the `phone` variant in app/globals.css, so the CSS and the code agree on which screens are phones.
 */
export type ScreenMode = "wide" | "portrait" | "landscape";

const LANDSCAPE = "(max-height: 500px) and (max-width: 950px) and (orientation: landscape)";
const PORTRAIT = "(max-width: 767px)";

/** The mode for a window of this size and orientation (the same rule as the two media queries above). */
export function screenModeFor(width: number, height: number): ScreenMode {
  if (height <= 500 && width <= 950 && width > height) return "landscape";
  if (width <= 767) return "portrait";
  return "wide";
}

function current(): ScreenMode {
  if (typeof window === "undefined" || !window.matchMedia) return "wide";
  if (window.matchMedia(LANDSCAPE).matches) return "landscape";
  return window.matchMedia(PORTRAIT).matches ? "portrait" : "wide";
}

function subscribe(onChange: () => void) {
  const lists = [window.matchMedia(LANDSCAPE), window.matchMedia(PORTRAIT)];
  lists.forEach((l) => l.addEventListener("change", onChange));
  return () => lists.forEach((l) => l.removeEventListener("change", onChange));
}

/** Whether this window is a phone layout right now (read once, for things that start from a default: the chart's theme). */
export const isPhoneNow = (): boolean => current() !== "wide";

export function useScreenMode(): ScreenMode {
  return useSyncExternalStore(subscribe, current, () => "wide");
}
