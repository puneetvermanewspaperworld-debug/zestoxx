"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ZestoxxProvider } from "./ZestoxxProvider";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import TickerTape from "./TickerTape";
import Toasts from "./Toasts";
import BottomNav from "./BottomNav";

function ShellChrome({ children }: { children: React.ReactNode }) {
  // The Trade chart page is a screen of its own on a phone (upright or sideways): no sidebar, top bar, ticker or tab bar around it, and
  // no padding, so the chart gets the whole screen. It has its own header, with a back button. Elsewhere, and on a wide screen, nothing changes.
  const chartScreen = usePathname().startsWith("/app/trade");
  const hideOnPhone = chartScreen ? "phone:hidden" : "contents";
  return (
    <div
      // Phones: exactly the visible height (dvh), so the page itself never scrolls and carries the top bar and
      // ticker off the top edge; only the content area below them scrolls. Desktop keeps its old sizing.
      className="flex h-full min-h-screen w-full bg-slate-50 text-slate-900 max-md:h-dvh max-md:min-h-0 max-md:overflow-hidden"
      style={{ fontFamily: "var(--font-inter), ui-sans-serif, system-ui" }}
    >
      <div className={hideOnPhone}>
        <Sidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col phone:h-dvh phone:overflow-hidden">
        <div className={hideOnPhone}>
          <TopBar />
          <TickerTape />
        </div>
        <div
          data-testid="app-content"
          className={"flex-1 overflow-y-auto p-3 pb-[calc(76px+env(safe-area-inset-bottom))] sm:p-4 md:pb-4" + (chartScreen ? " phone:overflow-x-hidden phone:p-0 phone:pb-0 phone:sm:p-0 phone:md:pb-0" : "")}
        >
          {children}
        </div>
      </div>
      <div className={hideOnPhone}>
        <BottomNav />
      </div>
      <Toasts />
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
