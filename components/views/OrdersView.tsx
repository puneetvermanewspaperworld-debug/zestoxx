"use client";

import React from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { SYMBOL_MAP } from "@/lib/symbols";
import { fmt } from "@/lib/helpers";

export default function OrdersView() {
  const { orderLog, openOrders, cancelOrder } = useZestoxx();
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-display text-[13px] font-semibold text-slate-900">Open Orders</h2>
        {openOrders.length === 0 ? (
          <div className="py-3 text-center text-[12px] text-slate-400">
            No pending limit orders. Place one from the Trade view.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-slate-500">
                <th className="px-2 py-1.5 text-left">Symbol</th>
                <th className="px-2 py-1.5 text-left">Side</th>
                <th className="px-2 py-1.5 text-right">Qty</th>
                <th className="px-2 py-1.5 text-right">Limit</th>
                <th className="px-2 py-1.5 text-right">Placed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {openOrders.map((o) => (
                <tr key={o.id} className="border-t border-blue-50">
                  <td className="px-2 py-2 font-medium text-slate-900">{o.symbol}</td>
                  <td
                    className={
                      "px-2 py-2 font-medium " +
                      (o.side === "buy" ? "text-emerald-500" : "text-rose-500")
                    }
                  >
                    {o.side.toUpperCase()}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-500">{o.qty}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-900">
                    {fmt(o.limitPrice, SYMBOL_MAP[o.symbol].type)}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-400">{o.time}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => cancelOrder(o.id)}
                      className="text-[11px] text-rose-500 hover:underline"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-display text-[13px] font-semibold text-slate-900">Order History</h2>
        {orderLog.length === 0 ? (
          <div className="py-3 text-center text-[12px] text-slate-400">No filled orders yet.</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-slate-500">
                <th className="px-2 py-1.5 text-left">Symbol</th>
                <th className="px-2 py-1.5 text-left">Side</th>
                <th className="px-2 py-1.5 text-left">Type</th>
                <th className="px-2 py-1.5 text-right">Qty</th>
                <th className="px-2 py-1.5 text-right">Price</th>
                <th className="px-2 py-1.5 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {orderLog.map((o) => (
                <tr key={o.id} className="border-t border-blue-50">
                  <td className="px-2 py-2 font-medium text-slate-900">{o.symbol}</td>
                  <td
                    className={
                      "px-2 py-2 font-medium " +
                      (o.side === "buy" ? "text-emerald-500" : "text-rose-500")
                    }
                  >
                    {o.side.toUpperCase()}
                  </td>
                  <td className="px-2 py-2 capitalize text-slate-500">{o.mode}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-500">{o.qty}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-900">
                    {fmt(o.price, SYMBOL_MAP[o.symbol].type)}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-400">{o.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
