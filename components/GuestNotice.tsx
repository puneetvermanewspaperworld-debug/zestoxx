"use client";

import React, { useSyncExternalStore } from "react";
import { X } from "lucide-react";

const KEY = "zestoxx:guest-notice:v1";
const EVENT = "zestoxx:guest-notice";

/** What the notice says, one short sentence, also shown in the account panel. */
/** The one line shown at the top of a page; the whole explanation is on the Account page. */
export const GUEST_NOTICE_SHORT = "Your paper account is kept in a cookie on this device.";
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
    <div role="note" data-testid="guest-notice" className="mb-2 flex h-9 items-center gap-1 rounded-lg border border-blue-100 bg-blue-50/60 pl-3 pr-1 text-[12px] text-slate-600">
      <p className="min-w-0 flex-1 truncate">{GUEST_NOTICE_SHORT}</p>
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
        data-compact
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
