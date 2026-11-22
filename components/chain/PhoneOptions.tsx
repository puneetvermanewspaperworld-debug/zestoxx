"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { useOptionChain } from "@/lib/useOptionChain";
import { useScreenMode } from "@/lib/useScreenMode";
import { daysLabel, daysToExpiry } from "@/lib/chain-view";
import { fmtIsoDate, istDateString } from "@/lib/helpers";
import { typeOf } from "@/lib/symbols";
import ChainView from "./ChainView";
import ContractSheet from "./ContractSheet";
import UnderlyingSearch, { type QuoteOf } from "./UnderlyingSearch";

/**
 * The option chain on a phone, as a full screen like the action screens: no brand bar, ticker, cookie notice or tab bar (see AppShell), so the table
 * has almost all of the height. The top row is a back arrow, a search box for the underlying (anything with options, with its live price and change)
 * and the expiry; under it the chain (see ChainView). Tapping a Call or Put cell opens the Buy/Sell screen for that contract.
 */
export default function PhoneOptions() {
  const { selected, setSelected, price, sym, live, chgFor, hasFeedQuote, prevCloseFor } = useZestoxx();
  // the contract whose sheet is open: its strike and type, tied to the chain it was tapped in
  const [picked, setPicked] = useState<{ underlying: string; expiry: string; strike: number; type: "CE" | "PE" } | null>(null);
  const router = useRouter();
  const isCrypto = sym.type === "crypto";
  const landscape = useScreenMode() === "landscape";

  // each underlying has its own expiries, so the choice is kept per underlying; none chosen is the nearest
  const [expiryFor, setExpiryFor] = useState<Record<string, string>>({});
  const { chain } = useOptionChain(selected, expiryFor[selected] ?? null, price, { enabled: !isCrypto });

  // a price from the quote feed only: before it answers, the app's own stand-in price is not shown as if it were live, and the chain's own spot is used
  const quoteOf = (symbol: string): QuoteOf => {
    const real = hasFeedQuote(symbol) && live[symbol] > 0;
    return { price: real ? live[symbol] : null, pct: real ? chgFor(symbol) : null };
  };
  const cur = quoteOf(selected);
  const change = cur.price != null && cur.pct != null ? cur.price - prevCloseFor(selected) : null;
  const back = () => (window.history.length > 1 ? router.back() : router.push("/app/explore"));
  const today = istDateString();

  const header = (
    <header data-testid="chain-header" className={"relative z-50 flex h-14 shrink-0 items-center gap-1.5 bg-white pl-1 pr-2 " + (landscape ? "" : "border-b border-slate-200")}>
      <button type="button" onClick={back} aria-label="Back" data-testid="chain-back" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-700">
        <ArrowLeft size={20} aria-hidden />
      </button>
      <UnderlyingSearch selected={selected} quoteOf={quoteOf} typeOf={typeOf} onPick={(id) => setSelected(id)} />
      {chain && (
        <select
          aria-label="Expiry"
          data-testid="chain-expiry-select"
          value={chain.expiry}
          onChange={(e) => setExpiryFor((m) => ({ ...m, [selected]: e.target.value }))}
          className="h-11 w-[132px] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-[16px] text-slate-900"
        >
          {chain.expiries.map((e) => (
            <option key={e} value={e}>
              {fmtIsoDate(e, false)} · {daysLabel(daysToExpiry(e, today))}
            </option>
          ))}
        </select>
      )}
      {chain && chain.expiry === today && (
        <span data-testid="chain-expiry-today" className="sr-only">
          Expiry today
        </span>
      )}
    </header>
  );

  return (
    <div data-testid="phone-options" className="zx-app flex min-h-0 flex-1 flex-col bg-white">
      {isCrypto ? (
        <>
          {header}
          <p className="px-4 py-16 text-center text-[13px] text-slate-500">Options chain isn&apos;t available for crypto pairs on Zestoxx yet. Search for a stock or an index above.</p>
        </>
      ) : (
        <ChainView top={header} chain={chain} price={cur.price ?? 0} change={change} pct={cur.pct} onPick={(strike, type) => chain && setPicked({ underlying: chain.underlying, expiry: chain.expiry, strike, type })} />
      )}
      {chain && picked && picked.underlying === chain.underlying && picked.expiry === chain.expiry && <ContractSheet chain={chain} strike={picked.strike} type={picked.type} onClose={() => setPicked(null)} />}
    </div>
  );
}
