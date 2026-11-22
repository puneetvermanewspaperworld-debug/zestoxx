"use client";

import React, { Suspense } from "react";
import { usePathname } from "next/navigation";
import { ZestoxxProvider } from "./ZestoxxProvider";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import TickerTape from "./TickerTape";
import Toasts from "./Toasts";
import BottomNav from "./BottomNav";
import GuestNotice from "./GuestNotice";
import ActionHost from "./action/ActionHost";

function ShellChrome({ children }: { children: React.ReactNode }) {
  // The Trade chart page is a screen of its own on a phone (upright or sideways): no sidebar, top bar, ticker or tab bar around it, and
  // no padding, so the chart gets the whole screen. It has its own header, with a back button. Elsewhere, and on a wide screen, nothing changes.
  const pathname = usePathname();
  const chartScreen = pathname.startsWith("/app/trade");
  // the option chain is one screen on a phone, filling what is left under the top bar and above the tab bar (see PhoneOptions)
  const chainScreen = pathname === "/app/options";
  const hideOnPhone = chartScreen ? "phone:hidden" : "contents";
  // sideways the option chain also gives up the top bar (the tab bar stays): every line of height is a strike
  const hideTop = chartScreen ? "phone:hidden" : chainScreen ? "contents short:hidden" : "contents";
  return (
    <div
      // Phones: exactly the visible height (dvh), so the page itself never scrolls and carries the top bar and
      // ticker off the top edge; only the content area below them scrolls. Desktop keeps its old sizing.
      className="zx-app flex h-full min-h-screen w-full bg-slate-50 text-slate-900 max-md:h-dvh max-md:min-h-0 max-md:overflow-hidden"
      style={{ fontFamily: "var(--font-inter), ui-sans-serif, system-ui" }}
    >
      {/* the sidebar is for tablets and desktops: a phone has the bottom bar */}
      <div className="contents phone:hidden">
        <Sidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col phone:h-dvh phone:overflow-hidden">
        <div className={hideTop}>
          <TopBar />
          <div className="contents short:hidden">
            <TickerTape />
          </div>
        </div>
        <div
          data-testid="app-content"
          className={"flex-1 overflow-y-auto p-3 pb-[calc(76px+env(safe-area-inset-bottom))] sm:p-4 md:pb-4 phone:md:pb-[calc(64px+env(safe-area-inset-bottom))]" + (chartScreen ? " phone:overflow-x-hidden phone:p-0 phone:pb-0 phone:sm:p-0 phone:md:pb-0" : "") + (chainScreen ? " phone:flex phone:flex-col phone:overflow-x-hidden phone:pb-[calc(48px+env(safe-area-inset-bottom))] phone:md:pb-[calc(48px+env(safe-area-inset-bottom))]" : "")}
        >
          {/* sideways the option chain needs every line of height, so the cookie notice waits until the phone is upright again */}
          {!chartScreen && (chainScreen ? <div className="short:hidden"><GuestNotice /></div> : <GuestNotice />)}
          {children}
        </div>
      </div>
      <div className={hideOnPhone}>
        <BottomNav />
      </div>
      <Toasts />
      {/* a phone's action screens (Buy/Sell, GTT, alerts ...): a layer over the page, named by the address */}
      <Suspense fallback={null}>
        <ActionHost />
      </Suspense>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ZestoxxProvider>
      <ShellChrome>{children}</ShellChrome>
    </ZestoxxProvider>
  );
}
