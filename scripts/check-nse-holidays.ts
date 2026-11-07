/**
 * Diffs lib/market-calendar.ts against NSE's live trading-holiday list (equity derivatives segment).
 *
 *   npm run check:holidays
 *
 * Run it when NSE announces a change and at the start of each year. It prints what differs and exits 1
 * if anything does. After fixing the table, bump CALENDAR.verifiedOn. NSE's site sometimes blocks
 * automated requests (cloud IPs especially); if so, run it from your own machine.
 *
 * The Muhurat session isn't in NSE's holiday list (only an asterisk on the date) — its timings come
 * from the circular named in CALENDAR.muhuratCircular, so check that by hand.
 */
import { CALENDAR, HOLIDAYS } from "../lib/market-calendar";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

async function main() {
  // NSE wants a cookie from its front page before the API answers.
  const home = await fetch("https://www.nseindia.com/", { headers: { "User-Agent": UA } });
  const cookie = home.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const res = await fetch("https://www.nseindia.com/api/holiday-master?type=trading", {
    headers: { "User-Agent": UA, Accept: "application/json", Referer: CALENDAR.sourceUrl, Cookie: cookie },
  });
  if (!res.ok) {
    console.error(`NSE answered ${res.status}. Try again, or compare by hand: ${CALENDAR.sourceUrl}`);
    process.exit(2);
  }
  const fo = ((await res.json()) as { FO?: { tradingDate: string; description: string }[] }).FO ?? [];
  const nse = new Map<string, string>();
  for (const r of fo) {
    const [d, m, y] = r.tradingDate.split("-");
    nse.set(`${y}-${MONTHS[m]}-${d}`, r.description.replace(/\*+$/, "").trim());
  }

  const missing = [...nse].filter(([d]) => d.startsWith(`${CALENDAR.year}-`) && !(d in HOLIDAYS));
  const extra = Object.keys(HOLIDAYS).filter((d) => !nse.has(d));
  const renamed = Object.entries(HOLIDAYS).filter(([d, name]) => nse.has(d) && nse.get(d) !== name);

  console.log(`NSE lists ${nse.size} F&O holidays; our table has ${Object.keys(HOLIDAYS).length} (verified ${CALENDAR.verifiedOn}).`);
  for (const [d, n] of missing) console.log(`  MISSING from our table: ${d}  ${n}`);
  for (const d of extra) console.log(`  NOT on NSE's list:      ${d}  ${HOLIDAYS[d]}`);
  for (const [d, n] of renamed) console.log(`  name differs:           ${d}  ours "${n}"  NSE "${nse.get(d)}"`);
  if (!missing.length && !extra.length && !renamed.length) console.log("  identical.");
  process.exit(missing.length || extra.length || renamed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
