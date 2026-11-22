"use client";

import React from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { ChartsTab } from "@/components/OptionOrderSheet";
import { contractLabel } from "@/lib/movers";
import { fmtIsoDate } from "@/lib/helpers";
import { useContractQuote } from "@/lib/useContractQuote";
import { useOptionChain } from "@/lib/useOptionChain";
import ActionScreen from "./ActionScreen";
import { FormCard, Notice, PriceStrip } from "./ActionParts";
import { useAction } from "./useAction";

/**
 * A contract's chart, full screen: today's 5-minute premium line with the previous close dashed (the same chart the order sheet has), under the
 * contract's live premium and change. A simulated contract has no intraday data, and the screen says so rather than drawing one.
 */
export default function ContractChartScreen({ underlying, expiry, strike, type, onClose }: { underlying: string; expiry: string; strike: number; type: "CE" | "PE"; onClose: () => void }) {
  const { live } = useZestoxx();
  const { openAction } = useAction();
  const { chain, loading } = useOptionChain(underlying, expiry, live[underlying] ?? 0);
  const row = chain?.rows.find((r) => r.strike === strike);
  const leg = row ? (type === "CE" ? row.call : row.put) : null;
  const { quote } = useContractQuote(leg?.key);
  const short = underlying === "NIFTY50" ? "NIFTY" : underlying;
  const label = contractLabel({ symbol: short, expiry, strike, type });
  const liveQuote = quote?.source === "live" ? quote : null;
  const ltp = liveQuote ? liveQuote.ltp : (leg?.ltp ?? 0);
  const prev = liveQuote ? liveQuote.prevClose : (leg?.prevClose ?? 0);
  const change = liveQuote ? liveQuote.change : ltp > 0 && prev > 0 ? ltp - prev : null;
  const pct = liveQuote ? liveQuote.changePct : change != null && prev > 0 ? (change / prev) * 100 : null;
  const strip = <PriceStrip exchange="NSE F&O" price={ltp > 0 ? ltp : null} type="stock" change={change} pct={pct} />;

  return (
    <ActionScreen label="Chart" symbol={label} onBack={onClose} strip={strip} footer={leg && ltp > 0 ? { label: `Buy ${label}`, onPress: () => openAction({ kind: "option", underlying, expiry, strike, type, side: "buy" }), tone: "buy", testId: "contract-chart-buy" } : undefined}>
      {loading ? (
        <Notice tone="info" testId="contract-chart-loading">Loading the contract…</Notice>
      ) : !leg ? (
        <Notice tone="warn" testId="contract-chart-missing">This contract is not in the option chain right now (the expiry may have passed, or the chain could not be loaded).</Notice>
      ) : (
        <FormCard testId="contract-chart-card">
          <div className="space-y-2 px-3 py-3">
            <p className="text-[12px] text-slate-500">
              {type === "CE" ? "Call" : "Put"} · expires {fmtIsoDate(expiry)} · today&apos;s premium
            </p>
            <div data-testid="contract-chart-plot">
              <ChartsTab liveKey={leg.key} prevClose={prev} active />
            </div>
          </div>
        </FormCard>
      )}
    </ActionScreen>
  );
}
