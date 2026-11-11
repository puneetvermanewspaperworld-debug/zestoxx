"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Width of an element in CSS pixels, kept current as it resizes (rotation, sidebar toggles). Charts draw
 * their SVG at this real width so text keeps its true size instead of being scaled down with a viewBox.
 * Returns `fallback` until measured (first render and server render).
 */
export function useElementWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(1, Math.round(el.clientWidth)));
    const first = setTimeout(measure, 0);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      clearTimeout(first);
      ro.disconnect();
    };
  }, []);
  return [ref, width];
}
