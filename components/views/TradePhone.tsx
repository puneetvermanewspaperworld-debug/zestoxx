"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import DataBadge from "@/components/DataBadge";
import OptionOrderSheet from "@/components/OptionOrderSheet";
import OptionsChain from "@/components/OptionsChain";
import OptionsStatsStrip from "@/components/OptionsStatsStrip";
import type { PhoneLayout } from "@/components/chart/ChartWithTools";
import type { PhoneExtras } from "@/components/chart/PhoneBars";
import { fmt, fmtIsoDate, fmtSigned } from "@/lib/helpers";
import { PAPER_BUY, PAPER_SELL } from "@/lib/labels";
import { atmContract } from "@/lib/sell-shortcut";
import { useOptionChain } from "@/lib/useOptionChain";
import type { AssetType } from "@/lib/types";

/** Height of the fixed Paper buy / Paper sell bar, and of the symbol header, in pixels (the chart block is the screen less these two). */
export const BAR_PX = 53;
export const HEADER_PX = 52;

export interface TradePhoneProps {
  mode: "portrait" | "landscape";
  selected: string;
  type: AssetType;
  price: number;
  chg: number;
  source: "live" | "sim" | undefined;
  extras: PhoneExtras;
  /** the chart, for the layout it is given */
  renderChart: (layout: PhoneLayout) => React.ReactNode;
  /** the order ticket (Paper trade) */
  orderPanel: React.ReactNode;
  /** the rows under the chart: recent orders, the order book, the watchlist */
  below: React.ReactNode;
}

type Tab = "chart" | "chain";
type Contract = { underlying: string; expiry: string; strike: number; type: "CE" | "PE" };

/**
 * The Trade chart page on a phone: a screen of its own (the app's top bar, ticker and tab bar are left off, see AppShell). Upright: the symbol
 * header, the chart block (the screen less the header and the order bar), then the rows that used to be around it, with room at the foot
 * for the fixed Paper buy / Paper sell bar. Sideways: the chart fills the screen under one slim toolbar and the page does not scroll.
 */
export default function TradePhone(p: TradePhoneProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("chart");
  const [orderOpen, setOrderOpen] = useState(false);
  const [contract, setContract] = useState<Contract | null>(null);
  const [expiryFor, setExpiryFor] = useState<Record<string, string>>({});
  const hasChain = p.type !== "crypto";
  const isIndex = p.type === "index";
  const { chain } = useOptionChain(p.selected, expiryFor[p.selected] ?? null, p.price, { enabled: hasChain && (isIndex || tab === "chain") });
  const sheet = chain && contract && contract.underlying === chain.underlying && contract.expiry === chain.expiry ? contract : null;
  const landscape = p.mode === "landscape";

  const back = () => (window.history.length > 1 ? router.back() : router.push("/app/dashboard"));
  const buyAtm = (type: "CE" | "PE") => {
    const atm = chain ? atmContract(chain, type) : null;
    if (chain && atm) setContract({ underlying: chain.underlying, expiry: chain.expiry, ...atm });
  };

  const priceText = (
    <span data-testid="header-price" className="font-mono text-[13px] font-semibold leading-tight text-slate-900">
      {fmt(p.price, p.type)}
    </span>
  );
  const changeText = (
    <span data-testid="header-change" className={"flex items-center gap-0.5 font-mono text-[11.5px] leading-tight " + (p.chg >= 0 ? "text-emerald-600" : "text-rose-500")}>
      {p.chg >= 0 ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
      {fmtSigned(p.chg, 2, "%")}
    </span>
  );
  const backButton = (
    <button type="button" onClick={back} aria-label="Back" data-testid="trade-back" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:text-slate-900">
      <ArrowLeft size={20} aria-hidden />
    </button>
  );
  const tabs = hasChain ? (
    <div role="tablist" aria-label="Chart or option chain" className="flex shrink-0 items-center">
      {(
        [
          ["chart", "Chart"],
          ["chain", "Option Chain"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          data-testid={`tab-${id}`}
          onClick={() => setTab(id)}
          className={"flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-2 text-[12.5px] font-semibold " + (tab === id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500")}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null;

  const header = (
    <header data-testid="trade-header" style={{ height: HEADER_PX }} className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-1">
      {backButton}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <h1 className="font-display text-[14px] font-semibold leading-tight text-slate-900">{p.selected}</h1>
          {priceText}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {changeText}
          <DataBadge source={p.source} type={p.type} className="shrink-0 !px-1.5 !py-0 text-[10px]" />
        </div>
      </div>
      {tabs}
    </header>
  );

  const orderButtons = (small: boolean) => (
    <>
      <button type="button" onClick={() => setOrderOpen(true)} data-testid="paper-buy" className={"min-h-[44px] rounded-md bg-emerald-500 font-semibold text-white " + (small ? "shrink-0 px-2 text-[12px]" : "flex-1 text-[13px]")}>
        {PAPER_BUY}
      </button>
      <button type="button" onClick={() => setOrderOpen(true)} data-testid="paper-sell" className={"min-h-[44px] rounded-md bg-rose-500 font-semibold text-white " + (small ? "shrink-0 px-2 text-[12px]" : "flex-1 text-[13px]")}>
        {PAPER_SELL}
      </button>
    </>
  );
  /** an index has options: buy a call or a put at the at-the-money strike */
  const atmButtons = (small: boolean) =>
    isIndex ? (
      <>
        {(["CE", "PE"] as const).map((t) => (
          <button
            key={t}
            type="button"
            disabled={!chain}
            onClick={() => buyAtm(t)}
            data-testid={t === "CE" ? "paper-buy-call" : "paper-buy-put"}
            className={"min-h-[44px] rounded-md border-2 bg-white font-semibold leading-tight disabled:opacity-40 " + (t === "CE" ? "border-emerald-500 text-emerald-700" : "border-rose-500 text-rose-600") + (small ? " w-full text-[13px]" : " flex-1 text-[11.5px]")}
          >
            {t === "CE" ? `${PAPER_BUY} Call` : `${PAPER_BUY} Put`}
          </button>
        ))}
      </>
    ) : null;

  const orderSheet = orderOpen && (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-900/40" onClick={() => setOrderOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Paper trade ticket" data-testid="order-sheet" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="font-display text-[15px] font-semibold text-slate-900">Paper trade · {p.selected}</span>
          <button type="button" onClick={() => setOrderOpen(false)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded text-[20px] text-slate-600">
            ×
          </button>
        </div>
        {p.orderPanel}
      </div>
    </div>
  );
  const optionSheet = chain && sheet && <OptionOrderSheet chain={chain} strike={sheet.strike} type={sheet.type} onPick={(strike, type) => setContract({ ...sheet, strike, type })} onClose={() => setContract(null)} />;

  const chainTab = (
    <section data-testid="chain-tab" aria-label="Option chain" className="bg-white">
      {chain ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3">
            <span className="flex items-center gap-2 text-[12px] text-slate-500">
              Spot {fmt(chain.spot ?? p.price, p.type)}
              <DataBadge source={chain.source === "live" ? "live" : "sim"} />
            </span>
            <select
              aria-label="Expiry"
              value={chain.expiry}
              onChange={(e) => setExpiryFor((m) => ({ ...m, [p.selected]: e.target.value }))}
              className="min-h-[44px] rounded-md border border-slate-200 bg-slate-50 px-2 text-[12.5px] text-slate-900 outline-none"
            >
              {chain.expiries.map((e) => (
                <option key={e} value={e}>
                  {fmtIsoDate(e)}
                </option>
              ))}
            </select>
          </div>
          <div className="border-b border-slate-100 p-3">
            <OptionsStatsStrip chain={chain} />
          </div>
          <div className="overflow-auto">
            <OptionsChain chain={chain} onPick={(strike, type) => setContract({ underlying: chain.underlying, expiry: chain.expiry, strike, type })} />
          </div>
        </>
      ) : (
        <div className="h-[420px] animate-pulse bg-slate-50" aria-busy="true" />
      )}
    </section>
  );

  if (landscape) {
    const lead = (
      <>
        {backButton}
        <div className="shrink-0 leading-tight" data-testid="trade-header">
          <h1 className="font-display text-[13px] font-semibold text-slate-900">{p.selected}</h1>
          <span className="flex items-baseline gap-1.5">
            {priceText}
            {changeText}
          </span>
        </div>
        {hasChain && (
          <button type="button" aria-label="Option Chain" title="Option Chain" data-testid="tab-chain" onClick={() => setTab("chain")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-blue-700">
            <SlidersHorizontal size={18} aria-hidden />
          </button>
        )}
      </>
    );
    const trail = <div className="flex shrink-0 gap-1">{orderButtons(true)}</div>;
    const layout: PhoneLayout = {
      mode: "landscape",
      extras: { ...p.extras, more: <LandscapeMore extras={p.extras} atm={atmButtons(true)} /> },
      lead,
      trail,
      footer: <DataBadge source={p.source} type={p.type} className="shrink-0 !px-1.5 !py-0 text-[10px]" />,
    };
    return (
      <div data-testid="trade-screen" data-mode="landscape" className="fixed inset-0 z-[45] flex flex-col bg-white">
        {tab === "chart" ? (
          p.renderChart(layout)
        ) : (
          <>
            {header}
            <div className="min-h-0 flex-1 overflow-y-auto">{chainTab}</div>
          </>
        )}
        {orderSheet}
        {optionSheet}
      </div>
    );
  }

  return (
    <div data-testid="trade-screen" data-mode="portrait" className="flex min-h-full flex-col bg-slate-50">
      {header}
      {tab === "chart" ? (
        <>
          <section data-testid="chart-block" aria-label="Chart" className="shrink-0 bg-white" style={{ height: `calc(100dvh - ${HEADER_PX}px - ${BAR_PX}px - env(safe-area-inset-bottom))` }}>
            {p.renderChart({ mode: "portrait", extras: p.extras })}
          </section>
          {/* room at the foot, so the last row can be scrolled clear of the fixed bar */}
          <div data-testid="below-chart" className="space-y-3 p-3" style={{ paddingBottom: `calc(${BAR_PX}px + env(safe-area-inset-bottom) + 16px)` }}>
            {p.below}
          </div>
        </>
      ) : (
        <div style={{ paddingBottom: `calc(${BAR_PX}px + env(safe-area-inset-bottom) + 16px)` }}>{chainTab}</div>
      )}
      <div
        data-testid="paper-bar"
        className="fixed inset-x-0 bottom-0 z-30 flex gap-1.5 border-t border-slate-200 bg-white px-1.5 pt-1"
        style={{ height: `calc(${BAR_PX}px + env(safe-area-inset-bottom))`, paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {orderButtons(false)}
        {atmButtons(false)}
      </div>
      {orderSheet}
      {optionSheet}
    </div>
  );
}

/** The More sheet's extra rows in landscape, where the bar has no room for the index buttons. */
function LandscapeMore({ atm }: { extras: PhoneExtras; atm: React.ReactNode }) {
  if (!atm) return null;
  return (
    <section aria-label="Options" className="border-t border-slate-100 px-3 pb-2 pt-2">
      <h3 className="pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Options at the money</h3>
      <div className="grid grid-cols-2 gap-2">{atm}</div>
    </section>
  );
}
