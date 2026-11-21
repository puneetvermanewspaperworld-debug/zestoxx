"use client";

import React from "react";
import AccountPanel from "@/components/AccountPanel";
import { usePrivacy } from "@/components/usePrivacy";

/** Account: privacy mode, Reset my paper account, and the notice about the guest cookie. */
export default function PhoneAccount() {
  const { hidden, toggle } = usePrivacy();
  return (
    <div className="space-y-3" data-testid="phone-account">
      <h1 className="font-display text-[20px] font-semibold text-slate-900">Account</h1>
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Privacy mode">
        <h2 className="mb-1 font-display text-[13px] font-semibold text-slate-900">Privacy mode</h2>
        <p className="text-[12px] leading-relaxed text-slate-500">Hides your portfolio value as **** and your profit and loss as ***, wherever they appear. Remembered on this device.</p>
        <button type="button" role="switch" aria-checked={hidden} onClick={toggle} data-testid="privacy-switch" className="mt-3 flex min-h-[44px] w-full items-center justify-between rounded-lg border border-slate-200 px-3 text-[14px] font-medium text-slate-800">
          <span>Hide values</span>
          <span className={"rounded-full px-2.5 py-0.5 text-[12px] font-semibold " + (hidden ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600")}>{hidden ? "On" : "Off"}</span>
        </button>
      </section>
      <AccountPanel />
    </div>
  );
}
