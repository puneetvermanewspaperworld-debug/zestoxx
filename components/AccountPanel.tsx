"use client";

import React, { useState } from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { GUEST_COOKIE_NOTICE } from "@/components/GuestNotice";

/** "Reset my paper account", with the cookie notice. Resetting asks first, then clears this guest's account (and only this guest's). */
export default function AccountPanel() {
  const { resetPaperAccount } = useZestoxx();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="account-panel">
      <h3 className="mb-1 font-display text-[13px] font-semibold text-slate-900">Paper account</h3>
      <p className="text-[12px] leading-relaxed text-slate-500">{GUEST_COOKIE_NOTICE}</p>
      {!asking ? (
        <button type="button" onClick={() => setAsking(true)} data-testid="reset-account" className="mt-3 min-h-[44px] rounded-lg border border-slate-200 px-4 text-[13px] font-medium text-slate-700 hover:text-rose-600">
          Reset my paper account
        </button>
      ) : (
        <div className="mt-3 space-y-2" role="group" aria-label="Confirm reset">
          <p data-testid="reset-account-question" className="text-[12.5px] text-slate-700">
            This clears your balance, holdings, orders, alerts, SIPs and watchlists, and starts again with ₹10,00,000. It cannot be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              data-testid="reset-account-confirm"
              onClick={async () => {
                setBusy(true);
                setFailed(false);
                const ok = await resetPaperAccount();
                if (!ok) {
                  setBusy(false);
                  setFailed(true);
                }
              }}
              className="min-h-[44px] rounded-lg bg-rose-600 px-4 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Resetting…" : "Yes, reset it"}
            </button>
            <button type="button" disabled={busy} onClick={() => setAsking(false)} data-testid="reset-account-cancel" className="min-h-[44px] rounded-lg border border-slate-200 px-4 text-[13px] text-slate-600">
              Cancel
            </button>
          </div>
          {failed && (
            <p role="alert" data-testid="reset-account-error" className="text-[12px] text-rose-500">
              Could not reset the account. Try again in a moment.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
