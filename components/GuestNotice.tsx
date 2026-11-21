"use client";

import React, { useSyncExternalStore } from "react";
import { X } from "lucide-react";

const KEY = "zestoxx:guest-notice:v1";
const EVENT = "zestoxx:guest-notice";

/** What the notice says, one short sentence, also shown in the account panel. */
export const GUEST_COOKIE_NOTICE = "Zestoxx has no sign-up yet. It keeps your paper account in a cookie on this device, so clearing cookies starts a new account.";

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/** A one-line notice that a cookie keeps the guest's paper account. Dismissible; the choice is remembered on this device. */
export default function GuestNotice() {
  // on the server it counts as dismissed, so nothing is drawn before the browser has answered
  const hide = useSyncExternalStore(subscribe, dismissed, () => true);
  if (hide) return null;
  return (
    <div role="note" data-testid="guest-notice" className="mb-3 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[12px] leading-relaxed text-slate-600">
      <p className="min-w-0 flex-1">{GUEST_COOKIE_NOTICE}</p>
      <button
        type="button"
        aria-label="Dismiss this notice"
        data-testid="guest-notice-dismiss"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, "1");
          } catch {
            // blocked storage: it just comes back next time
          }
          window.dispatchEvent(new Event(EVENT));
        }}
        className="-my-1.5 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
