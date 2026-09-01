"use client";

import React from "react";
import { ZestoxxProvider } from "./ZestoxxProvider";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import TickerTape from "./TickerTape";
import Toasts from "./Toasts";

function ShellChrome({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-full min-h-screen w-full bg-slate-50 text-slate-900"
      style={{ fontFamily: "var(--font-inter), ui-sans-serif, system-ui" }}
    >
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <TickerTape />
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">{children}</div>
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
