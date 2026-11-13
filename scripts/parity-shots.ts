import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";

/**
 * Parity audit screenshots: every page state the HDFC checklist maps to, at desktop (1280x800) and phone (390x844).
 *   npx tsx --tsconfig tsconfig.json scripts/parity-shots.ts [baseUrl]      (default http://localhost:3100)
 * Writes docs/parity/<id>-<name>-desktop.jpg and -phone.jpg, and prints which steps worked, so a missing control is reported, not hidden.
 */
const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = "docs/parity";
/** optional: only shots whose "<id>-<name>" contains this text */
const ONLY = process.argv[3];

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Rows shaped like the stored NSE data, for showing the FII/DII layout when no database is connected. */
function fiiFixture() {
  const rows: unknown[] = [];
  let i = 0;
  for (let d = "2026-10-05"; d <= "2026-11-06"; d = addDays(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    i++;
    const fiiNet = Math.round(((i % 7) - 3) * 1450.37 * 100) / 100;
    const diiNet = Math.round(((i % 5) - 2) * 1120.11 * 100) / 100;
    rows.push({
      date: d,
      cash: { fii: { buy: 20000 + Math.max(fiiNet, 0), sell: 20000 + Math.max(-fiiNet, 0), net: fiiNet }, dii: { buy: 15000 + Math.max(diiNet, 0), sell: 15000 + Math.max(-diiNet, 0), net: diiNet } },
      idxFut: { long: 50000 + i * 1300, short: 120000 - i * 900 },
      provisional: true,
    });
  }
  return rows;
}

const tab = (page: Page, name: string | RegExp) => page.getByRole("tab", { name }).first().click({ timeout: 4000 });
const btn = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).first().click({ timeout: 4000 });

interface Shot {
  id: string;
  name: string;
  path: string;
  steps?: (p: Page) => Promise<void>;
  setup?: (p: Page) => Promise<void>;
  full?: boolean;
  /** phone only (the desktop layout has no such control) */
  phoneOnly?: boolean;
}

const SHOTS: Shot[] = [
  { id: "01", name: "orders-open", path: "/app/orders" },
  { id: "01", name: "orders-gtd", path: "/app/orders", steps: (p) => tab(p, /GTD/) },
  { id: "01", name: "orders-closed", path: "/app/orders", steps: (p) => tab(p, /Closed/) },
  { id: "01", name: "orders-stock-sip", path: "/app/orders", steps: (p) => tab(p, /Stock SIP/) },
  { id: "01", name: "orders-positions", path: "/app/orders", steps: (p) => tab(p, /Positions/) },
  { id: "01", name: "orders-mutual-fund", path: "/app/orders", steps: (p) => tab(p, /Mutual Fund/) },
  { id: "02", name: "watchlist-explore", path: "/app/watchlist", full: true },
  { id: "02", name: "watchlist-create", path: "/app/watchlist", steps: (p) => btn(p, /Create Watchlist/) },
  {
    id: "03", name: "option-sheet", path: "/app/options",
    steps: async (p) => {
      await p.locator("table tbody tr").nth(8).locator("button").first().click({ timeout: 5000 });
      await p.waitForSelector("#order-sheet-title", { timeout: 8000 });
      await p.waitForTimeout(1500);
    },
  },
  {
    id: "03", name: "option-sheet-details", path: "/app/options",
    steps: async (p) => {
      await p.locator("table tbody tr").nth(8).locator("button").first().click({ timeout: 5000 });
      await p.waitForSelector("#order-sheet-title", { timeout: 8000 });
      await tab(p, /Scrip Details/);
      await p.waitForTimeout(1200);
    },
  },
  { id: "04", name: "movers-equity", path: "/app/movers" },
  { id: "04", name: "movers-fno-options", path: "/app/movers", steps: async (p) => { await tab(p, /^F&O/); await tab(p, /^Options/); await p.waitForTimeout(2500); } },
  { id: "05", name: "movers-fno-futures", path: "/app/movers", steps: async (p) => { await tab(p, /^F&O/); await tab(p, /^Futures/); await p.waitForTimeout(2500); } },
  { id: "17", name: "options-chain-stats", path: "/app/options" },
  { id: "17", name: "buildup-heatmap", path: "/app/buildup", full: true },
  { id: "19", name: "fiidii-live-state", path: "/app/fiidii" },
  {
    id: "19", name: "fiidii-with-sample-rows", path: "/app/fiidii", full: true,
    setup: async (p) => void (await p.route("**/api/fiidii", (r) => r.fulfill({ json: { status: "ok", rows: fiiFixture() } }))),
  },
  { id: "20", name: "dashboard", path: "/app/dashboard", full: true },
  { id: "nav", name: "bottom-nav-more-sheet", path: "/app/dashboard", phoneOnly: true, steps: (p) => p.getByRole("navigation", { name: "Main" }).getByRole("button", { name: /More/ }).click({ timeout: 4000 }) },
  { id: "21", name: "chart-trade-page", path: "/app/trade/RELIANCE" },
  { id: "21", name: "chart-trendline-active", path: "/app/trade/RELIANCE", steps: (p) => p.locator('button[title="Trendline"]').first().click({ timeout: 4000 }) },
  { id: "better", name: "fno-analyzer-long-call", path: "/app/fno", full: true },
];

const CONTEXTS = [
  { tag: "desktop", opts: { viewport: { width: 1280, height: 800 } } },
  {
    tag: "phone",
    opts: {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
    },
  },
] as const;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser: Browser = await chromium.launch({ channel: "chrome" });
  const report: string[] = [];
  for (const c of CONTEXTS) {
    const ctx = await browser.newContext(c.opts);
    for (const s of SHOTS) {
      if (s.phoneOnly && c.tag !== "phone") continue;
      if (ONLY && !`${s.id}-${s.name}`.includes(ONLY)) continue;
      const page = await ctx.newPage();
      const file = path.join(OUT, `${s.id}-${s.name}-${c.tag}.jpg`);
      let note = "ok";
      try {
        await s.setup?.(page);
        await page.goto(BASE + s.path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3500);
        if (s.steps) await s.steps(page);
        await page.waitForTimeout(600);
        if (s.full) await page.addStyleTag({ content: ".overflow-y-auto{overflow:visible !important} html,body{height:auto !important} .max-md\\:h-dvh{height:auto !important}" });
        await page.screenshot({ path: file, fullPage: !!s.full, type: "jpeg", quality: 62 });
      } catch (e) {
        note = "STEP FAILED: " + String(e).split("\n")[0].slice(0, 110);
        try {
          await page.screenshot({ path: file.replace(".jpg", "-STEPFAILED.jpg"), type: "jpeg", quality: 55 });
        } catch {}
      }
      report.push(`${c.tag.padEnd(7)} ${(s.id + "-" + s.name).padEnd(30)} ${note}`);
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  console.log(report.join("\n"));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
