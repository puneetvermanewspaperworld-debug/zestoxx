"use client";

import React, { useState } from "react";
import PromoCard from "@/components/PromoCard";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { displayName } from "@/lib/contract";
import { fmt, fmtINR, fmtIsoDate, istClock } from "@/lib/helpers";
import {
  MAX_SIPS,
  ORDER_TYPE_LABEL,
  SIP_MIN_AMOUNT,
  gtdBounds,
  type OrderStatus,
  type OrderType,
  type SipFrequency,
} from "@/lib/orders";
import { SYMBOLS, typeOf } from "@/lib/symbols";
import type { OpenOrder, OrderLogEntry } from "@/lib/types";

type Top = "orderbook" | "positions" | "mf";
type Sub = "open" | "closed" | "gtd" | "sip";

const SIP_STOCKS = SYMBOLS.filter((s) => s.type === "stock");

/* ------------------------------------------------------------ small parts ---- */

function Tabs<T extends string>({
  label,
  value,
  onChange,
  tabs,
  size = "md",
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  tabs: { id: T; label: string; count?: number }[];
  size?: "md" | "sm";
}) {
  return (
    <div role="tablist" aria-label={label} className="flex overflow-x-auto border-b border-slate-200 px-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={
            "shrink-0 border-b-2 whitespace-nowrap font-medium " +
            (size === "md" ? "px-4 py-2.5 text-[13px] " : "px-3 py-2 text-[12px] ") +
            (value === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-900")
          }
        >
          {t.label}
          {t.count != null && t.count > 0 && (
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th className={"px-3 py-2 font-medium " + (right ? "text-right" : "text-left")}>{children}</th>
);

const Empty = ({ title, children }: { title: string; children?: React.ReactNode }) => (
  <div className="px-4 py-10">
    <div className="text-center font-display text-[15px] font-semibold text-slate-700">{title}</div>
    {children}
  </div>
);

const SideCell = ({ side }: { side: "buy" | "sell" }) => (
  <td className={"px-3 py-2.5 font-medium " + (side === "buy" ? "text-emerald-500" : "text-rose-500")}>
    {side.toUpperCase()}
  </td>
);

function TypeChip({ type }: { type: OrderType }) {
  const tone =
    type === "GTD" ? "bg-amber-50 text-amber-700" : type === "SIP" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600";
  return <span className={"rounded px-1.5 py-0.5 text-[10.5px] font-semibold " + tone}>{ORDER_TYPE_LABEL[type]}</span>;
}

function StatusChip({ status }: { status: OrderStatus }) {
  const tone =
    status === "filled" ? "text-emerald-600" : status === "cancelled" ? "text-slate-500" : "text-amber-600";
  return <span className={"text-[12px] font-medium capitalize " + tone}>{status}</span>;
}

/* ------------------------------------------------------------- order tabs ---- */

function OpenOrdersTable({ orders, onCancel }: { orders: OpenOrder[]; onCancel: (id: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[12px]">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <Th>Symbol</Th>
            <Th>Side</Th>
            <Th>Type</Th>
            <Th right>Qty</Th>
            <Th right>Limit</Th>
            <Th right>Valid till</Th>
            <Th right>Placed</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-blue-50">
              <td className="px-3 py-2.5 font-medium text-slate-900">{displayName(o.symbol)}</td>
              <SideCell side={o.side} />
              <td className="px-3 py-2.5">
                <TypeChip type={o.orderType} />
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-500">{o.qty}</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-900">{fmt(o.limitPrice, typeOf(o.symbol))}</td>
              <td className="px-3 py-2.5 text-right text-slate-500">
                {o.orderType === "GTD" && o.expiryDate ? fmtIsoDate(o.expiryDate) : "Today"}
              </td>
              <td className="px-3 py-2.5 text-right text-slate-400">{o.time}</td>
              <td className="px-3 py-2.5 text-right">
                <button type="button" onClick={() => onCancel(o.id)} className="text-[11.5px] text-rose-500 hover:underline">
                  Cancel
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClosedOrdersTable({ log }: { log: OrderLogEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[12px]">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <Th>Symbol</Th>
            <Th>Side</Th>
            <Th>Type</Th>
            <Th right>Qty</Th>
            <Th right>Price</Th>
            <Th>Status</Th>
            <Th right>Time</Th>
          </tr>
        </thead>
        <tbody>
          {log.map((o) => {
            const type: OrderType = o.orderType ?? (o.mode === "limit" ? "LIMIT" : "MARKET");
            const status: OrderStatus = o.status ?? "filled";
            return (
              <tr key={o.id} className="border-b border-blue-50">
                <td className="px-3 py-2.5 font-medium text-slate-900">{displayName(o.symbol)}</td>
                <SideCell side={o.side} />
                <td className="px-3 py-2.5">
                  <TypeChip type={type} />
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-500">{o.qty}</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-900">
                  {fmt(o.price, typeOf(o.symbol))}
                  {status !== "filled" && <span className="ml-1 font-sans text-[10px] text-slate-400">limit</span>}
                </td>
                <td className="px-3 py-2.5">
                  <StatusChip status={status} />
                </td>
                <td className="px-3 py-2.5 text-right text-slate-400">{o.time}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- Stock SIP ---- */

function SipForm({ onDone }: { onDone: () => void }) {
  const { createSip } = useZestoxx();
  const [symbol, setSymbol] = useState(SIP_STOCKS[0].id);
  const [amount, setAmount] = useState("5000");
  const [frequency, setFrequency] = useState<SipFrequency>("monthly");
  const [startDate, setStartDate] = useState(() => istClock().date);
  const [error, setError] = useState<string | null>(null);
  const { min, max } = gtdBounds(istClock().date);

  const field =
    "mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-900 outline-none focus:border-blue-400";

  const submit = () => {
    const err = createSip({ symbol, amount: Number(amount), frequency, startDate });
    if (err) setError(err);
    else onDone();
  };

  return (
    <div className="border-b border-slate-200 bg-slate-50 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label htmlFor="sip-symbol" className="text-[11px] text-slate-500">
            Stock
          </label>
          <select id="sip-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} className={field}>
            {SIP_STOCKS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sip-amount" className="text-[11px] text-slate-500">
            Amount per installment (₹)
          </label>
          <input
            id="sip-amount"
            type="number"
            min={SIP_MIN_AMOUNT}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            className={field + " font-mono"}
          />
        </div>
        <div>
          <label htmlFor="sip-frequency" className="text-[11px] text-slate-500">
            Frequency
          </label>
          <select
            id="sip-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as SipFrequency)}
            className={field}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label htmlFor="sip-start" className="text-[11px] text-slate-500">
            First installment
          </label>
          <input
            id="sip-start"
            type="date"
            min={min}
            max={max}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setError(null);
            }}
            className={field + " font-mono"}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={submit} className="rounded-md bg-blue-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white">
          Start SIP
        </button>
        <button type="button" onClick={onDone} className="text-[12.5px] text-slate-500">
          Cancel
        </button>
        {error && <span className="text-[12px] text-rose-500">{error}</span>}
      </div>
    </div>
  );
}

function SipTab() {
  const { sips, setSipStatus, cancelSip } = useZestoxx();
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <p className="max-w-xl text-[11.5px] leading-snug text-slate-400">
          Buys a fixed ₹ amount of a stock on a schedule, in whole shares, as a paper trade. Installments run on weekdays
          after the 9:15 IST open <b>while Zestoxx is open</b>; one missed while it was closed is skipped, not bought
          later in a lump. Exchange holidays aren&apos;t modelled.
        </p>
        {!creating && sips.length < MAX_SIPS && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md border border-blue-200 px-3 py-1.5 text-[12px] font-medium text-blue-600 hover:bg-blue-50"
          >
            + New SIP
          </button>
        )}
      </div>
      {creating && <SipForm onDone={() => setCreating(false)} />}
      {sips.length === 0 ? (
        !creating && (
          <Empty title="No Stock SIPs">
            <PromoCard
              title="Invest a little, regularly"
              body="Set up a weekly or monthly Stock SIP and Zestoxx will place the paper trade for you on each date."
              cta="Start a Stock SIP"
              onClick={() => setCreating(true)}
            />
          </Empty>
        )
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[600px] text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <Th>Stock</Th>
                <Th right>Amount</Th>
                <Th>Frequency</Th>
                <Th>Next installment</Th>
                <Th right>Done</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {sips.map((p) => (
                <tr key={p.id} className="border-b border-blue-50">
                  <td className="px-3 py-2.5 font-medium text-slate-900">{p.symbol}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-900">{fmtINR(p.amount)}</td>
                  <td className="px-3 py-2.5 capitalize text-slate-500">{p.frequency}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.status === "paused" ? "—" : fmtIsoDate(p.nextDate)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500">{p.installments}</td>
                  <td className={"px-3 py-2.5 text-[12px] font-medium " + (p.status === "active" ? "text-emerald-600" : "text-amber-600")}>
                    {p.status === "active" ? "Active" : "Paused"}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSipStatus(p.id, p.status === "active" ? "paused" : "active")}
                      className="mr-3 text-[11.5px] text-blue-600 hover:underline"
                    >
                      {p.status === "active" ? "Pause" : "Resume"}
                    </button>
                    <button type="button" onClick={() => cancelSip(p.id)} className="text-[11.5px] text-rose-500 hover:underline">
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- positions -- */

function PositionsTab() {
  const { holdings, live, exitPosition } = useZestoxx();
  const [confirming, setConfirming] = useState<string | null>(null);
  const rows = Object.entries(holdings);

  if (rows.length === 0) {
    return (
      <Empty title="No Open Positions">
        <PromoCard
          title="Make your first paper trade"
          body="Buy a stock from the Trade view, or pick an option contract from the Options chain."
          cta="Open Trade"
          href="/app/trade/RELIANCE"
        />
      </Empty>
    );
  }

  const mark = (id: string, avg: number) => live[id] ?? avg;
  const invested = rows.reduce((s, [, h]) => s + h.qty * h.avgPrice, 0);
  const current = rows.reduce((s, [id, h]) => s + h.qty * mark(id, h.avgPrice), 0);
  const pnl = current - invested;

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 px-4 pt-3">
        {(
          [
            ["Invested", fmtINR(invested), "text-slate-900"],
            ["Current", fmtINR(current), "text-slate-900"],
            ["P&L", `${pnl >= 0 ? "+" : ""}${fmtINR(pnl)}`, pnl >= 0 ? "text-emerald-500" : "text-rose-500"],
          ] as const
        ).map(([k, v, cls]) => (
          <div key={k}>
            <div className="text-[10.5px] uppercase tracking-wide text-slate-400">{k}</div>
            <div className={"font-mono text-[14px] font-semibold " + cls}>{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[600px] text-[12px]">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <Th>Symbol</Th>
              <Th right>Qty</Th>
              <Th right>Avg</Th>
              <Th right>LTP</Th>
              <Th right>P&amp;L</Th>
              <Th right>P&amp;L %</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, h]) => {
              const ltp = live[id];
              const p = (mark(id, h.avgPrice) - h.avgPrice) * h.qty;
              const pct = h.avgPrice > 0 ? ((mark(id, h.avgPrice) - h.avgPrice) / h.avgPrice) * 100 : 0;
              const tone = p >= 0 ? "text-emerald-500" : "text-rose-500";
              return (
                <tr key={id} className="border-b border-blue-50">
                  <td className="px-3 py-2.5 font-medium text-slate-900">{displayName(id)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500">{h.qty}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500">{fmt(h.avgPrice, typeOf(id))}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-900">{ltp == null ? "--" : fmt(ltp, typeOf(id))}</td>
                  <td className={"px-3 py-2.5 text-right font-mono " + tone}>
                    {p >= 0 ? "+" : ""}
                    {fmtINR(p)}
                  </td>
                  <td className={"px-3 py-2.5 text-right font-mono " + tone}>
                    {pct >= 0 ? "+" : ""}
                    {pct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {confirming === id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            exitPosition(id);
                            setConfirming(null);
                          }}
                          disabled={ltp == null}
                          className="mr-2 rounded bg-rose-500 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                        >
                          Confirm exit
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className="text-[11.5px] text-slate-500">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirming(id)} className="text-[11.5px] text-rose-500 hover:underline">
                        Exit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-[11px] text-slate-400">Exit sells the whole position at the last price, as a paper trade.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ the view -- */

export default function OrdersView() {
  const { orderLog, openOrders, cancelOrder, setActiveView } = useZestoxx();
  const [top, setTop] = useState<Top>("orderbook");
  const [sub, setSub] = useState<Sub>("open");
  const gtd = openOrders.filter((o) => o.orderType === "GTD");

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <Tabs
        label="Orders sections"
        value={top}
        onChange={setTop}
        tabs={[
          { id: "orderbook", label: "Orderbook" },
          { id: "positions", label: "Positions" },
          { id: "mf", label: "Mutual Fund" },
        ]}
      />

      {top === "orderbook" && (
        <>
          <Tabs
            label="Order status"
            size="sm"
            value={sub}
            onChange={setSub}
            tabs={[
              { id: "open", label: "Open", count: openOrders.length },
              { id: "closed", label: "Closed" },
              { id: "gtd", label: "GTD", count: gtd.length },
              { id: "sip", label: "Stock SIP" },
            ]}
          />
          <div role="tabpanel">
            {sub === "open" &&
              (openOrders.length === 0 ? (
                <Empty title="No Open Orders">
                  <PromoCard
                    title="Place a limit or GTD order"
                    body="Name your price and let it wait. A limit order lasts for the day; a GTD order stays until the date you choose."
                    cta="Go to Trade"
                    onClick={() => setActiveView("trade")}
                  />
                </Empty>
              ) : (
                <OpenOrdersTable orders={openOrders} onCancel={cancelOrder} />
              ))}
            {sub === "gtd" &&
              (gtd.length === 0 ? (
                <Empty title="No GTD Orders">
                  <PromoCard
                    title="Good-till-date orders"
                    body="Choose GTD in the order panel to keep a limit order working for up to a year, until it fills or you cancel it."
                    cta="Go to Trade"
                    onClick={() => setActiveView("trade")}
                  />
                </Empty>
              ) : (
                <OpenOrdersTable orders={gtd} onCancel={cancelOrder} />
              ))}
            {sub === "closed" &&
              (orderLog.length === 0 ? (
                <Empty title="No Closed Orders">
                  <PromoCard
                    title="Your order history will show up here"
                    body="Filled, cancelled and expired orders are listed here, newest first."
                    cta="Go to Trade"
                    onClick={() => setActiveView("trade")}
                  />
                </Empty>
              ) : (
                <ClosedOrdersTable log={orderLog} />
              ))}
            {sub === "sip" && <SipTab />}
          </div>
        </>
      )}

      {top === "positions" && (
        <div role="tabpanel">
          <PositionsTab />
        </div>
      )}

      {top === "mf" && (
        <div role="tabpanel">
          <Empty title="No Mutual Fund Holdings">
            <p className="mx-auto mt-2 max-w-md text-center text-[12px] leading-relaxed text-slate-400">
              This tab is for information only. Zestoxx is a paper-trading platform: it doesn&apos;t buy, sell or run SIPs in
              mutual funds, and it doesn&apos;t hold real fund units. Your paper trades in stocks and options are under
              Positions.
            </p>
          </Empty>
        </div>
      )}
    </div>
  );
}
