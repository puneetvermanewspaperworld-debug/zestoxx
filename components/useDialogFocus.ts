"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * What a dialog does when it opens: put focus on its panel (or close button) once, and close on Escape.
 *
 * It must not depend on `onClose`. A parent usually passes a new `onClose` function on every render, and the app re-renders every couple of
 * seconds (the price tick), so an effect that re-ran with each new `onClose` would take focus back from whatever the user was typing in:
 * on a phone the keyboard closed after a digit. The latest `onClose` is kept in a ref instead, and focus moves only on mount.
 */
export function useDialogFocus(focusTarget: RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    focusTarget.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusTarget]);
}
