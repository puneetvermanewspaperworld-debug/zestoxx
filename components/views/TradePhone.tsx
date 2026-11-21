"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CandlestickChart, ChevronUp, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import DataBadge from "@/components/DataBadge";
import OptionOrderSheet from "@/components/OptionOrderSheet";
import OptionsChain from "@/components/OptionsChain";
import OptionsStatsStrip from "@/components/OptionsStatsStrip";
import type { PhoneLayout } from "@/components/chart/ChartWithTools";
import type { PhoneExtras } from "@/components/chart/PhoneBars";
import type { ThemeId } from "@/lib/chart/theme";
import { fmt, fmtIsoDate, fmtSigned, istDateString } from "@/lib/helpers";
import { PAPER_BUY, PAPER_SELL } from "@/lib/labels";
import { atmContract } from "@/lib/sell-shortcut";
import { useOptionChain } from "@/lib/useOptionChain";
import type { AssetType } from "@/lib/types";
import TradeDrawer, { type DrawerTab } from "./TradeDrawer";

/** Height of the symbol header in pixels. */
export const HEADER_PX = 52;

export interface TradePhoneProps {
  mode: "portrait" | "landscape";
  selected: string;
  type: AssetType;
  price: number;
  chg: number;
  source: "live" | "sim" | undefined;
  /** the chart's theme: the whole screen follows it */
  theme: ThemeId;
  extras: PhoneExtras;
  /** the chart, for the layout it is given */
  renderChart: (layout: PhoneLayout) => React.ReactNode;
  /** the contents of the drawer's tabs, and how many open orders and positions there are for the symbol */
  tabs: Record<DrawerTab, React.ReactNode>;
  counts: { orders: number; positions: number };
}

type View = "chart" | "chain";
type Contract = { underlying: string; expiry: string; strike: number; type: "CE" | "PE" };

/**
 * The Trade chart page on a phone: a screen of its own (the app's top bar, ticker and tab bar are left off, see AppShell) that does not
 * scroll. From the top: one header row, one interval bar (inside the chart), the chart, which takes everything left, and the collapsed
 * trade drawer. Sideways the header and the interval bar share one row.
 */
export default function TradePhone(p: TradePhoneProps) {
  const router = useRouter();
  const [view, setView] = useState<View>("chart");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("trade");
  const [contract, setContract] = useState<Contract | null>(null);
  const [expiryFor, setExpiryFor] = useState<Record<string, string>>({});
  const hasChain = p.type !== "crypto";
  const isIndex = p.type === "index";
  const { chain } = useOptionChain(p.selected, expiryFor[p.selected] ?? null, p.price, { enabled: hasChain && (isIndex || view === "chain") });
  const sheet = chain && contract && contract.underlying === chain.underlying && contract.expiry === chain.expiry ? contract : null;
  const landscape = p.mode === "landscape";
  // an index whose nearest expiry is today
  const expiresToday = isIndex && !!chain && chain.expiries.includes(istDateString());

  const back = () => (window.history.length > 1 ? router.back() : router.push("/app/dashboard"));
  const buyAtm = (type: "CE" | "PE") => {
    const atm = chain ? atmContract(chain, type) : null;
    if (chain && atm) setContract({ underlying: chain.underlying, expiry: chain.expiry, ...atm });
  };
  const openDrawer = (tab: DrawerTab) => {
    setDrawerTab(tab);
    setDrawerOpen(true);
  };

  const backButton = (
    <button type="button" onClick={back} aria-label="Back" data-testid="trade-back" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:text-slate-900">
      <ArrowLeft size={20} aria-hidden />
    </button>
  );
  const titleBlock = (
    <div className="min-w-0 flex-1" data-testid="trade-header-title">
      <div className="flex items-center gap-1.5">
        <h1 className="font-display text-[14px] font-semibold leading-tight text-slate-900">{p.selected}</h1>
        {expiresToday && (
          <span data-testid="expiry-today" className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-800">
            Expiry today
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span data-testid="header-price" className="font-mono text-[13px] font-semibold leading-tight text-slate-900">
          {fmt(p.price, p.type)}
        </span>
        <span data-testid="header-change" className={"flex items-center gap-0.5 font-mono text-[11.5px] leading-tight " + (p.chg >= 0 ? "text-emerald-600" : "text-rose-500")}>
          {p.chg >= 0 ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
          {fmtSigned(p.chg, 2, "%")}
        </span>
        {!landscape && <DataBadge source={p.source} type={p.type} className="shrink-0 !px-1.5 !py-0 text-[10px]" />}
      </div>
    </div>
  );
  /** the Option Chain page of this symbol, and the way back to the chart */
  const chainToggle = hasChain ? (
    view === "chart" ? (
      <button type="button" aria-label="Option Chain" title="Option Chain" data-testid="tab-chain" onClick={() => setView("chain")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-blue-700">
        <SlidersHorizontal size={19} aria-hidden />
      </button>
    ) : (
      <button type="button" aria-label="Chart" title="Chart" data-testid="tab-chart" onClick={() => setView("chart")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-blue-700">
        <CandlestickChart size={19} aria-hidden />
      </button>
    )
  ) : null;

  const header = (
    <header data-testid="trade-header" style={{ height: HEADER_PX }} className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-1">
      {backButton}
      {titleBlock}
      {chainToggle}
    </header>
  );

  /** the order buttons: filling the collapsed drawer's row upright, or compact in the toolbar row sideways */
  const orderButtons = (small: boolean) =>
    isIndex ? (
    <>
      {(["CE", "PE"] as const).map((t) => (
        <button
          key={t}
          type="button"
          disabled={!chain}
          onClick={() => buyAtm(t)}
          data-testid={t === "CE" ? "paper-buy-call" : "paper-buy-put"}
          className={"min-h-[44px] rounded-md text-[13px] font-semibold leading-tight text-white disabled:opacity-40 " + (small ? "shrink-0 whitespace-nowrap px-2.5 " : "flex-1 px-1 ") + (t === "CE" ? "bg-emerald-500" : "bg-rose-500")}
        >
          {t === "CE" ? `${PAPER_BUY} Call` : `${PAPER_BUY} Put`}
        </button>
      ))}
    </>
  ) : (
    <>
      <button type="button" onClick={() => openDrawer("trade")} data-testid="paper-buy" className={"min-h-[44px] rounded-md bg-emerald-500 text-[13px] font-semibold text-white " + (small ? "shrink-0 whitespace-nowrap px-2.5" : "flex-1")}>
        {PAPER_BUY}
      </button>
      <button type="button" onClick={() => openDrawer("trade")} data-testid="paper-sell" className={"min-h-[44px] rounded-md bg-rose-500 text-[13px] font-semibold text-white " + (small ? "shrink-0 whitespace-nowrap px-2.5" : "flex-1")}>
        {PAPER_SELL}
      </button>
    </>
  );

  const drawer = (
    <TradeDrawer symbol={p.selected} pullUp={landscape} buttons={orderButtons(false)} tabs={p.tabs} counts={p.counts} open={drawerOpen} onOpenChange={setDrawerOpen} tab={drawerTab} onTab={setDrawerTab} />
  );
  const optionSheet = chain && sheet && <OptionOrderSheet chain={chain} strike={sheet.strike} type={sheet.type} onPick={(strike, type) => setContract({ ...sheet, strike, type })} onClose={() => setContract(null)} />;

  const chainView = (
    <section data-testid="chain-tab" aria-label="Option chain" className="min-h-0 flex-1 overflow-y-auto bg-white">
      {chain ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3">
            <span className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
              Spot {fmt(chain.spot ?? p.price, p.type)}
              <DataBadge source={chain.source === "live" ? "live" : "sim"} />
              {chain.expiry === istDateString() && (
                <span data-testid="chain-expiry-today" className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">
                  Expiry today
                </span>
              )}
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

  const lead = (
    <>
      {backButton}
      <div className="flex w-[150px] shrink-0" data-testid="trade-header">
        {titleBlock}
      </div>
      {chainToggle}
    </>
  );
  const layout: PhoneLayout = {
    mode: p.mode,
    extras: p.extras,
    lead: landscape ? lead : undefined,
    // sideways the order buttons join the toolbar row (with an arrow that pulls the drawer up), so the drawer has no row of its own
    trail: landscape ? (
      <div className="flex shrink-0 items-center gap-1 border-l border-slate-100 pl-1">
        {orderButtons(true)}
        <button type="button" aria-label="Open the trade drawer" aria-expanded={drawerOpen} data-testid="drawer-toggle" onClick={() => setDrawerOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600">
          <ChevronUp size={20} aria-hidden />
        </button>
      </div>
    ) : undefined,
    footer: landscape ? <DataBadge source={p.source} type={p.type} className="shrink-0 !px-1.5 !py-0 text-[10px]" /> : undefined,
  };

  return (
    <div data-testid="trade-screen" data-mode={p.mode} className={"fixed inset-0 z-30 flex flex-col overflow-hidden " + (p.theme === "dark" ? "zx-dark" : "bg-slate-50")}>
      {landscape ? null : header}
      {view === "chart" ? (
        <section data-testid="chart-block" aria-label="Chart" className="min-h-0 flex-1 bg-white">
          {p.renderChart(layout)}
        </section>
      ) : (
        <>
          {landscape && header}
          {chainView}
        </>
      )}
      {drawer}
      {optionSheet}
    </div>
  );
}
