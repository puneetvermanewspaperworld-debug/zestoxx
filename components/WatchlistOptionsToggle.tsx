import React from "react";
import Link from "next/link";

/** The two-way switch at the top of the Watchlist and Options pages: Watchlist | Options. */
export default function WatchlistOptionsToggle({ active }: { active: "watchlist" | "options" }) {
  const item = (on: boolean) =>
    "flex-1 rounded px-4 py-1.5 text-center text-[12.5px] font-medium sm:flex-none " +
    (on ? "bg-blue-600 text-slate-50" : "text-slate-500 hover:text-slate-900");
  return (
    <nav aria-label="Watchlist or Options" className="flex gap-1 rounded-md border border-slate-200 bg-white p-0.5 sm:w-fit">
      <Link href="/app/watchlist" aria-current={active === "watchlist" ? "page" : undefined} className={item(active === "watchlist")}>
        Watchlist
      </Link>
      <Link href="/app/options" aria-current={active === "options" ? "page" : undefined} className={item(active === "options")}>
        Options
      </Link>
    </nav>
  );
}
