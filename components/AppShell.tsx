"use client";

import React from "react";
import { ZestoxxProvider } from "./ZestoxxProvider";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import TickerTape from "./TickerTape";
import Toasts from "./Toasts";
import BottomNav from "./BottomNav";

function ShellChrome({ children }: { children: React.ReactNode }) {
  return (
    <div
      // Phones: exactly the visible height (dvh), so the page itself never scrolls and carries the top bar and
      // ticker off the top edge; only the content area below them scrolls. Desktop keeps its old sizing.
      className="flex h-full min-h-screen w-full bg-slate-50 text-slate-900 max-md:h-dvh max-md:min-h-0 max-md:overflow-hidden"
      style={{ fontFamily: "var(--font-inter), ui-sans-serif, system-ui" }}
    >
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <TickerTape />
        <div className="flex-1 overflow-y-auto p-3 pb-[calc(76px+env(safe-area-inset-bottom))] sm:p-4 md:pb-4">{children}</div>
      </div>
      <BottomNav />
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
