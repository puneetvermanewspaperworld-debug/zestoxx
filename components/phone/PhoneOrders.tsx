"use client";

import React, { useState } from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import AlertsView from "@/components/views/AlertsView";
import { SipTab } from "@/components/views/OrdersView";
import { fmt, fmtIsoDate } from "@/lib/helpers";
import { gttKind } from "@/lib/gtt";
import { ORDER_TYPE_LABEL } from "@/lib/orders";
import { typeOf } from "@/lib/symbols";
import { displayName } from "@/lib/contract";
import type { OpenOrder, OrderLogEntry } from "@/lib/types";
import PhoneTabs from "./PhoneTabs";

type Tab = "open" | "executed" | "gtt" | "baskets" | "sips" | "alerts";

const Empty = ({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) => (
  <div data-testid={id} className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
    <p className="text-[14px] font-semibold text-slate-700">{title}</p>
    {children && <p className="mx-auto mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-slate-500">{children}</p>}
  </div>
);

const Chip = ({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "amber" | "rose" | "emerald" }) => (
  <span className={"rounded px-1.5 py-0.5 text-[10.5px] font-semibold " + { slate: "bg-slate-100 text-slate-600", amber: "bg-amber-100 text-amber-800", rose: "bg-rose-50 text-rose-600", emerald: "bg-emerald-50 text-emerald-700" }[tone]}>{children}</span>
);

function OpenCard({ o, onCancel }: { o: OpenOrder; onCancel: (id: number) => void }) {
  const gtt = o.orderType === "GTT";
  return (
    <li data-testid={`open-order-${o.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-slate-900">
            <span className={o.side === "buy" ? "text-emerald-600" : "text-rose-500"}>{o.side.toUpperCase()}</span> {o.qty} {displayName(o.symbol)}
          </p>
          <p className="mt-0.5 font-mono text-[12.5px] text-slate-600">
            {gtt ? `Trigger ${o.trigger === "above" ? "at or above" : "at or below"} ` : "Limit "}
            {fmt(o.limitPrice, typeOf(o.symbol))}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Chip tone={gtt ? "amber" : "slate"}>{gtt ? gttKind(o.side, o.trigger ?? "above") : ORDER_TYPE_LABEL[o.orderType]}</Chip>
          <span className="text-[11px] text-slate-400">{o.orderType === "GTD" && o.expiryDate ? `till ${fmtIsoDate(o.expiryDate)}` : o.orderType === "GTT" ? "till triggered" : "today"}</span>
        </div>
      </div>
      <button type="button" onClick={() => onCancel(o.id)} data-testid={`cancel-order-${o.id}`} aria-label={`Cancel ${o.side} ${o.qty} ${displayName(o.symbol)}`} className="mt-2 min-h-[44px] w-full rounded-lg border border-slate-200 text-[13px] font-medium text-rose-600">
        Cancel order
      </button>
    </li>
  );
}

function LogCard({ o }: { o: OrderLogEntry }) {
  const status = o.status ?? "filled";
  return (
    <li data-testid={`log-order-${o.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-slate-900">
            <span className={o.side === "buy" ? "text-emerald-600" : "text-rose-500"}>{o.side.toUpperCase()}</span> {o.qty} {displayName(o.symbol)}
          </p>
          <p className="mt-0.5 font-mono text-[12.5px] text-slate-600">
            {status === "filled" ? "Filled at " : "Price "}
            {fmt(o.price, typeOf(o.symbol))}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Chip tone={status === "filled" ? "emerald" : "rose"}>{status === "filled" ? "Executed" : status === "cancelled" ? "Cancelled" : "Expired"}</Chip>
          <span className="text-[11px] text-slate-400">
            {o.date ? `${fmtIsoDate(o.date, false)} · ` : ""}
            {o.time}
          </span>
        </div>
      </div>
      {(o.orderType === "GTT" || o.simulated) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {o.orderType === "GTT" && <Chip tone="amber">GTT</Chip>}
          {o.simulated && (
            <span data-testid={`simulated-${o.id}`} className="text-[11.5px] leading-snug text-amber-800">
              Simulated: filled at the first candle that crossed the trigger. Zestoxx cannot watch prices while it is closed.
            </span>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Orders on a phone: Open, Executed, GTT, Baskets, SIPs and Alerts. GTT and stop-loss orders trigger while the app is open; on the next visit
 * the app fills one that crossed its trigger while it was shut at the first candle that crossed, and says the fill is simulated.
 */
export default function PhoneOrders() {
  const { openOrders, orderLog, cancelOrder, alerts, sips } = useZestoxx();
  const [tab, setTab] = useState<Tab>("open");
  const resting = openOrders.filter((o) => o.orderType !== "GTT");
  const gttOpen = openOrders.filter((o) => o.orderType === "GTT");
  const gttDone = orderLog.filter((o) => o.orderType === "GTT");
  return (
    <div className="space-y-2.5" data-testid="phone-orders">
      <h1 className="font-display text-[20px] font-semibold text-slate-900">Orders</h1>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <PhoneTabs
          label="Order sections"
          testId="orders-tab"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "open", label: "Open", count: resting.length },
            { id: "executed", label: "Executed" },
            { id: "gtt", label: "GTT", count: gttOpen.length },
            { id: "baskets", label: "Baskets" },
            { id: "sips", label: "SIPs", count: sips.length },
            { id: "alerts", label: "Alerts", count: alerts.length },
          ]}
        />
      </div>
      <div role="tabpanel" className="space-y-2">
        {tab === "open" &&
          (resting.length === 0 ? (
            <Empty id="no-open-orders" title="No open orders">
              A limit order lasts for the day and a GTD order until its date. Market orders fill at once, so they are never open.
            </Empty>
          ) : (
            <ul className="space-y-2">{resting.map((o) => <OpenCard key={o.id} o={o} onCancel={cancelOrder} />)}</ul>
          ))}
        {tab === "executed" &&
          (orderLog.length === 0 ? (
            <Empty id="no-executed" title="Nothing executed yet">Filled, cancelled and expired orders are listed here, newest first.</Empty>
          ) : (
            <ul className="space-y-2">{orderLog.map((o) => <LogCard key={o.id} o={o} />)}</ul>
          ))}
        {tab === "gtt" && (
          <>
            <p data-testid="gtt-explainer" className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
              A GTT or stop-loss trades when its trigger price is reached. It fires while Zestoxx is open. If Zestoxx was shut, the next visit checks the candles since you placed it and fills it at the first one that crossed the trigger, marked as simulated: Zestoxx cannot watch prices in the background.
            </p>
            {gttOpen.length === 0 && gttDone.length === 0 ? (
              <Empty id="no-gtt" title="No GTT orders">Open a symbol in your watchlist and tap Create GTT to set a stop-loss or a target.</Empty>
            ) : (
              <>
                {gttOpen.length > 0 && <ul className="space-y-2">{gttOpen.map((o) => <OpenCard key={o.id} o={o} onCancel={cancelOrder} />)}</ul>}
                {gttDone.length > 0 && <ul className="space-y-2">{gttDone.map((o) => <LogCard key={o.id} o={o} />)}</ul>}
              </>
            )}
          </>
        )}
        {tab === "baskets" && (
          <Empty id="baskets-empty" title="Baskets are not available yet">
            Zestoxx does not have baskets (several orders placed together). Place orders one at a time for now.
          </Empty>
        )}
        {tab === "sips" && <SipTab />}
        {tab === "alerts" && <AlertsView />}
      </div>
    </div>
  );
}
