"use client";

import React, { useState } from "react";

type Message = { kind: "ok" | "error"; text: string };

const BY_STATUS: Record<number, string> = {
  401: "That password is not right. Nothing was changed.",
  404: "Claiming is not available: the claim secret is not set on the server, or there is no old data to claim.",
  409: "This browser already has its own account with data in it. Claiming would replace it. Tick the box below if that is what you want, then try again.",
  410: "The old data was already claimed (from this or another browser). It cannot be claimed twice, and this browser's account is a new, empty one.",
  429: "Too many new accounts from this network right now. Try again later.",
  503: "The server cannot save accounts right now. Try again later.",
};

/** A password field that posts to the claim route. The secret goes in an Authorization header of the one request: never in the address, never stored. */
export default function ClaimForm() {
  const [secret, setSecret] = useState("");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Message | null>(null);
  const [needsReplace, setNeedsReplace] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!secret || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account/claim-demo", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ replace }),
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      if (res.ok) {
        setMsg({ kind: "ok", text: "Done. Your old data now belongs to this browser's account. Open the app and check your holdings, orders and balance." });
        setSecret("");
        setNeedsReplace(false);
      } else {
        setNeedsReplace(res.status === 409);
        setMsg({ kind: "error", text: BY_STATUS[res.status] ?? `Something went wrong (code ${res.status}). Nothing was changed.` });
      }
    } catch {
      setMsg({ kind: "error", text: "Could not reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="claim-form" autoComplete="off">
      <p className="text-[13.5px] leading-relaxed text-slate-600">
        Attaches the old shared demo data (balance, watchlists, holdings, orders, alerts and SIPs) to this browser. It can be done once: the first browser to claim gets it.
      </p>
      <label className="block text-[13px] font-medium text-slate-700" htmlFor="claim-secret">
        Claim password
      </label>
      <input
        id="claim-secret"
        data-testid="claim-secret"
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-[14px] outline-none focus:border-blue-500"
      />
      {needsReplace && (
        <label className="flex min-h-[44px] items-center gap-2 text-[13px] text-slate-700">
          <input data-testid="claim-replace" type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-5 w-5" />
          Replace this browser&apos;s account with the old data
        </label>
      )}
      <button type="submit" disabled={busy || !secret} data-testid="claim-submit" className="min-h-[44px] w-full rounded-lg bg-blue-600 px-4 text-[14px] font-semibold text-white disabled:opacity-50">
        {busy ? "Claiming…" : "Claim my data"}
      </button>
      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} data-testid={msg.kind === "ok" ? "claim-success" : "claim-error"} className={"rounded-lg px-3 py-2 text-[13.5px] " + (msg.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
