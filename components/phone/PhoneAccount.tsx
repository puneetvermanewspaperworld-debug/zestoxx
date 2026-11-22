"use client";

import React from "react";
import AccountPanel from "@/components/AccountPanel";
import PrivacyEye from "@/components/PrivacyEye";
import { usePrivacy } from "@/components/usePrivacy";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { fmtINR } from "@/lib/helpers";
import { portfolioTotals } from "@/lib/portfolio-totals";
import { maskPnl, maskValue } from "@/lib/privacy";

/** Account: the balance (hidden with the eye), privacy mode, Reset my paper account, and the notice about the guest cookie. */
export default function PhoneAccount() {
  const { hidden, toggle } = usePrivacy();
  const { cash, holdings, live } = useZestoxx();
  const t = portfolioTotals(cash, holdings, live);
  const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmtINR(Math.abs(n));
  return (
    <div className="space-y-3" data-testid="phone-account">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-[20px] font-semibold text-slate-900">Account</h1>
        <PrivacyEye />
      </div>
      <section className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4" aria-label="Balance" data-testid="acct-balance">
        {(
          [
            ["Virtual cash", "acct-cash", maskValue(fmtINR(cash), hidden), "text-slate-900"],
            ["Total value", "acct-total", maskValue(fmtINR(t.total), hidden), "text-slate-900"],
            ["Unrealised P&L", "acct-pnl", maskPnl(signed(t.pnl), hidden), hidden ? "text-slate-500" : t.pnl > 0 ? "text-emerald-600" : t.pnl < 0 ? "text-rose-500" : "text-slate-500"],
          ] as const
        ).map(([label, id, value, cls]) => (
          <div key={id} className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-[13px] text-slate-500">{label}</span>
            <span data-testid={id} className={"font-mono text-[15px] font-semibold " + cls}>
              {value}
            </span>
          </div>
        ))}
      </section>
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
