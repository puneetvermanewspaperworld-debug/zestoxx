"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "zestoxx:privacy:v1";
const EVENT = "zestoxx:privacy";

const read = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/**
 * Privacy mode: when on, the portfolio's value shows as **** and profit and loss as *** wherever they appear. Remembered on this device
 * (browser storage), shared by every component that uses it. On the server, and until the browser answers, nothing is hidden.
 */
export function usePrivacy(): { hidden: boolean; toggle: () => void } {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, read() ? "0" : "1");
    } catch {
      // blocked storage: the switch just does not stick
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { hidden, toggle };
}
