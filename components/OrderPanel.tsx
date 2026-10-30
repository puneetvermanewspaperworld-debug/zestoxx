"use client";

import React, { useState } from "react";
import { fmt, fmtIsoDate, istClock } from "@/lib/helpers";
import { addDaysIso, gtdBounds } from "@/lib/orders";
import { useIsClient } from "@/lib/useIsClient";
import type { AssetType, Holdings } from "@/lib/types";

interface OrderPanelProps {
  symId: string;
  price: number;
  type: AssetType;
  cash: number;
  holdings: Holdings;
  onTrade: (t: {
    mode: "market" | "limit" | "gtd";
    side: "buy" | "sell";
    qty: number;
    limitPrice?: number;
    expiryDate?: string;
  }) => void;
}

export default function OrderPanel({ symId, price, type, cash, holdings, onTrade }: OrderPanelProps) {
  const [qty, setQty] = useState(1);
  const [orderType, setOrderType] = useState<"market" | "limit" | "gtd">("market");
  const [expiry, setExpiry] = useState("");
  const isClient = useIsClient();
  const [limitPrice, setLimitPrice] = useState(price?.toFixed(2) || "");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; text: string } | null>(null);
  const held = holdings[symId]?.qty || 0;
  const resting = orderType !== "market";
  const effPrice = resting ? parseFloat(limitPrice) || price : price;
  const cost = (effPrice || 0) * qty;

  const submit = (side: "buy" | "sell") => {
    if (orderType === "market") {
      if (side === "buy" && cost > cash) {
        setMsg({ t: "err", text: "Not enough virtual cash for this order." });
        return;
      }
      if (side === "sell" && qty > held) {
        setMsg({ t: "err", text: `You only hold ${held} unit(s) of ${symId}.` });
        return;
      }
      onTrade({ mode: "market", side, qty });
      setMsg({ t: "ok", text: `${side === "buy" ? "Bought" : "Sold"} ${qty} ${symId} @ ${fmt(price, type)}` });
    } else {
      if (!limitPrice || parseFloat(limitPrice) <= 0) {
        setMsg({ t: "err", text: "Enter a valid limit price." });
        return;
      }
      if (orderType === "gtd") {
        const { min, max } = gtdBounds(istClock().date);
        if (!expiry || expiry < min || expiry > max) {
          setMsg({ t: "err", text: `Pick an expiry date between ${fmtIsoDate(min)} and ${fmtIsoDate(max)}.` });
          return;
        }
        onTrade({ mode: "gtd", side, qty, limitPrice: parseFloat(limitPrice), expiryDate: expiry });
        setMsg({
          t: "ok",
          text: `GTD ${side} order placed: ${qty} ${symId} @ ${fmt(parseFloat(limitPrice), type)}, valid till ${fmtIsoDate(expiry)}`,
        });
      } else {
        onTrade({ mode: "limit", side, qty, limitPrice: parseFloat(limitPrice) });
        setMsg({
          t: "ok",
          text: `Limit ${side} order placed (valid today): ${qty} ${symId} @ ${fmt(parseFloat(limitPrice), type)}`,
        });
      }
    }
    setTimeout(() => setMsg(null), 2800);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-[12.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          Paper Trade
        </h3>
        <span className="text-[11px] text-slate-400">
          Holding: <span className="font-mono text-slate-900">{held}</span>
        </span>
      </div>
      <div className="mb-3 flex gap-1 rounded-md border border-slate-200 p-0.5">
        {(["market", "limit", "gtd"] as const).map((ot) => (
          <button
            key={ot}
            onClick={() => {
              setOrderType(ot);
              if (ot === "gtd" && !expiry) setExpiry(addDaysIso(istClock().date, 7));
            }}
            className={
              "flex-1 rounded px-2 py-1 text-[11.5px] font-medium " +
              (orderType === ot ? "bg-blue-600 text-slate-50" : "text-slate-500")
            }
          >
            {ot === "gtd" ? "GTD" : ot === "limit" ? "Limit" : "Market"}
          </button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-slate-500">Qty</label>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="mt-0.5 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[13px] text-slate-900 outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-500">
            {resting ? "Limit Price" : "Est. Cost"}
          </label>
          {resting ? (
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[13px] text-slate-900 outline-none focus:border-blue-400"
            />
          ) : (
            <div className="mt-0.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[13px] text-slate-900">
              {fmt(cost, type)}
            </div>
          )}
        </div>
      </div>
      {orderType === "gtd" && (
        <div className="mb-3">
          <label htmlFor="gtd-expiry" className="text-[11px] text-slate-500">
            Valid till (good-till-date)
          </label>
          <input
            id="gtd-expiry"
            type="date"
            value={expiry}
            min={isClient ? gtdBounds(istClock().date).min : undefined}
            max={isClient ? gtdBounds(istClock().date).max : undefined}
            onChange={(e) => setExpiry(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[13px] text-slate-900 outline-none focus:border-blue-400"
          />
        </div>
      )}
      {orderType === "limit" && (
        <p className="mb-3 text-[11px] text-slate-400">Day order — cancelled automatically if not filled today.</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => submit("buy")}
          className="flex-1 rounded-md bg-emerald-500 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Buy
        </button>
        <button
          onClick={() => submit("sell")}
          className="flex-1 rounded-md bg-rose-500 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Sell
        </button>
      </div>
      {msg && (
        <div
          className={"mt-2.5 text-[11.5px] " + (msg.t === "err" ? "text-rose-500" : "text-emerald-500")}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
