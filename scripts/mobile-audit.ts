/**
 * Phone audit: opens every route at 360x800, 390x844 and 414x896, saves full-page screenshots, and
 * measures the problems that make a page hard to use on a phone.
 *
 *   npm run build && npx next start -p 3100        (in another terminal)
 *   npm run audit:mobile -- before                 -> docs/mobile-audit/before/
 *   npm run audit:mobile -- after                  -> docs/mobile-audit/after/
 *
 * Uses your installed Chrome (no browser download). Screenshots are JPEG to keep the repo small.
 * Each route/size gets a row in REPORT.md plus a findings.json with the offending elements.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

export const ROUTES: { path: string; name: string; ready?: string }[] = [
  { path: "/", name: "landing" },
  { path: "/app/dashboard", name: "dashboard" },
  { path: "/app/watchlist", name: "watchlist" },
  { path: "/app/trade/RELIANCE", name: "trade" },
  { path: "/app/pulse", name: "pulse" },
  { path: "/app/markets", name: "markets" },
  { path: "/app/movers", name: "movers" },
  { path: "/app/options", name: "options" },
  { path: "/app/buildup", name: "buildup" },
  { path: "/app/fiidii", name: "fiidii" },
  { path: "/app/fno", name: "fno", ready: "#fno-und" },
  { path: "/app/news", name: "news" },
  { path: "/app/alerts", name: "alerts" },
  { path: "/app/orders", name: "orders" },
  { path: "/app/portfolio", name: "portfolio" },
];

export const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
];

interface Measured {
  pageScroll: number;
  clipped: string[];
  tableOverflow: string[];
  under12: number;
  under14: number;
  smallTargets: number;
  totalTargets: number;
  smallInputs: number;
  lowContrast: number;
  overlaps: string[];
  tickerHeight: number | null;
}

/** Runs inside the page. Everything is measured, nothing is changed. */
export function measure(): Record<string, unknown> {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const short = (el: Element) => {
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    const cls = typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className.split(" ").slice(0, 3).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${t ? ` "${t}"` : ""}`;
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
  };
  // Inside a horizontally scrollable box, sticking out is fine: the page itself doesn't move.
  const insideScroller = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth && p.getBoundingClientRect().width < vw * 0.97) return true;
      if (o === "hidden" || o === "clip") return true; // clipped, reported separately
    }
    return false;
  };
  // The app scrolls inside a page-wide container rather than the document, so measure that too.
  const shell = document.querySelector(".flex-1.overflow-y-auto") as HTMLElement | null;
  const shellOverflow = shell ? shell.scrollWidth - shell.clientWidth : 0;
  const all = Array.from(document.querySelectorAll("body *")).filter(visible);

  const pageScroll = Math.max(doc.scrollWidth - vw, shellOverflow);
  const wide = all
    .filter((el) => el.getBoundingClientRect().right > vw + 1 && !insideScroller(el) && getComputedStyle(el).position !== "fixed")
    .slice(0, 6)
    .map((el) => `${short(el)} right=${Math.round(el.getBoundingClientRect().right)}`);

  // Content cut off by an overflow:hidden box.
  const clipped = all
    .filter((el) => {
      const s = getComputedStyle(el);
      return (s.overflowX === "hidden" || s.overflowX === "clip") && el.scrollWidth > el.clientWidth + 2 && !el.matches("body,html");
    })
    .filter((el) => !el.closest(".animate-\\[ticker_30s_linear_infinite\\]") && !(el.firstElementChild && el.firstElementChild.className.toString().includes("ticker")))
    .slice(0, 6)
    .map((el) => `${short(el)} scroll=${el.scrollWidth} client=${el.clientWidth}`);

  // Text sizes (leaf text nodes only).
  const smallText: Record<string, number> = {};
  let under14 = 0;
  let under12 = 0;
  const samples: string[] = [];
  for (const el of all) {
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0);
    if (!own) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 14) under14++;
    if (px < 12) {
      under12++;
      smallText[px + "px"] = (smallText[px + "px"] ?? 0) + 1;
      if (samples.length < 5) samples.push(`${px}px ${short(el)}`);
    }
  }

  // Tap targets: real size, or a pseudo-element hit area of at least 44px.
  const targets = all.filter((el) => el.matches("a[href], button, [role=tab], select, input:not([type=hidden]):not([type=range]), summary, textarea"));
  const small = targets.filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width >= 44 && r.height >= 44) return false;
    for (const pseudo of ["::after", "::before"]) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content !== "none" && ps.position === "absolute" && parseFloat(ps.width) >= 44 && parseFloat(ps.height) >= 44) return false;
    }
    // A link inside running text isn't a "target" in the WCAG sense; skip inline text links in paragraphs.
    return true;
  });

  const inputs = all.filter((el) => el.matches("input:not([type=range]):not([type=checkbox]):not([type=radio]), select, textarea"));
  const smallInputs = inputs.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16);

  // Contrast (approximate): text colour against the nearest opaque background.
  // Tailwind v4 colours are oklch(); a 1x1 canvas converts any CSS colour to plain RGBA.
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true })!;
  const parse = (c: string): [number, number, number, number] => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const bgOf = (el: Element): [number, number, number] => {
    for (let p: Element | null = el; p; p = p.parentElement) {
      const [r, g, b, a] = parse(getComputedStyle(p).backgroundColor);
      if (a > 0.9) return [r, g, b];
    }
    return [255, 255, 255];
  };
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  let lowContrast = 0;
  const lowSamples: string[] = [];
  for (const el of all) {
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0);
    if (!own) continue;
    const [r, g, b, a] = parse(getComputedStyle(el).color);
    const bg = bgOf(el);
    const fg = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)];
    const L1 = lum(fg);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (ratio < 4.5) {
      lowContrast++;
      if (lowSamples.length < 5) lowSamples.push(`${ratio.toFixed(2)}:1 ${short(el)}`);
    }
  }

  // Fixed / sticky bars that sit on top of each other.
  const bars = all
    .filter((el) => getComputedStyle(el).position === "fixed")
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.height < window.innerHeight * 0.6 && r.width > 100);
  const overlaps: string[] = [];
  for (let i = 0; i < bars.length; i++)
    for (let j = i + 1; j < bars.length; j++) {
      const a = bars[i].r, b = bars[j].r;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 20 && oy > 8 && !bars[i].el.contains(bars[j].el) && !bars[j].el.contains(bars[i].el)) overlaps.push(`${short(bars[i].el)} x ${short(bars[j].el)}`);
    }

  // Tables wider than the screen, and charts (svg) wider/narrower than their box.
  const tables = Array.from(document.querySelectorAll("table")).filter(visible).map((t) => ({ w: Math.round(t.getBoundingClientRect().width), right: Math.round(t.getBoundingClientRect().right), scroller: insideScroller(t), label: short(t) }));
  const tableOverflow = tables.filter((t) => t.right > vw + 1 && !t.scroller).map((t) => `${t.label} right=${t.right}`);
  const wideScrollTables = tables.filter((t) => t.right > vw + 1 && t.scroller).length;

  const ticker = document.querySelector("[class*='ticker_30s']")?.parentElement?.getBoundingClientRect().height ?? null;

  return {
    pageScroll,
    wide,
    clipped,
    under14,
    under12,
    smallText,
    smallSamples: samples,
    smallTargets: small.length,
    smallTargetSamples: small.slice(0, 6).map((el) => `${short(el)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`),
    totalTargets: targets.length,
    smallInputs: smallInputs.length,
    smallInputSamples: smallInputs.slice(0, 4).map((el) => `${short(el)} ${getComputedStyle(el).fontSize}`),
    lowContrast,
    lowSamples,
    overlaps,
    tableOverflow,
    wideScrollTables,
    tickerHeight: ticker,
    height: doc.scrollHeight,
  };
}

async function main() {
  const phase = process.argv[2] ?? "before";
  const base = process.argv[3] ?? "http://localhost:3100";
  const only = process.argv[4]; // optional route name filter
  const outDir = path.join("docs", "mobile-audit", phase);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const rows: string[] = [];
  const findings: Record<string, unknown> = {};

  for (const route of ROUTES) {
    if (only && route.name !== only) continue;
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: vp,
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
      });
      const page = await ctx.newPage();
      // tsx adds a __name() helper to function bodies; give the page one so measure() can be sent as-is.
      await page.addInitScript("window.__name = function (f) { return f; };");
      const key = `${route.name}@${vp.width}`;
      try {
        await page.goto(base + route.path, { waitUntil: "domcontentloaded", timeout: 45_000 });
        if (route.ready) await page.waitForSelector(route.ready, { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(route.ready ? 3500 : 3000);
        const m = (await page.evaluate(measure)) as unknown as Measured;
        findings[key] = m;
        await page.addStyleTag({ content: ".overflow-y-auto{overflow:visible !important} html,body{height:auto !important}" });
        await page.screenshot({ path: path.join(outDir, `${route.name}-${vp.width}.jpg`), fullPage: true, type: "jpeg", quality: 60 });
        rows.push(
          `| ${route.name} | ${vp.width} | ${m.pageScroll > 1 ? "**+" + m.pageScroll + "px**" : "ok"} | ${m.clipped.length + m.tableOverflow.length} | ${m.under12} / ${m.under14} | ${m.smallTargets}/${m.totalTargets} | ${m.smallInputs} | ${m.lowContrast} | ${m.overlaps.length} | ${m.tickerHeight == null ? "-" : Math.round(m.tickerHeight)} |`
        );
        console.log(key, "scroll", m.pageScroll, "targets", m.smallTargets, "text<12", m.under12);
      } catch (e) {
        rows.push(`| ${route.name} | ${vp.width} | ERROR ${(e as Error).message.slice(0, 60)} | | | | | | | |`);
        console.error(key, e);
      }
      await ctx.close();
    }
  }
  await browser.close();

  if (!only) {
    fs.writeFileSync(path.join(outDir, "findings.json"), JSON.stringify(findings, null, 1));
    fs.writeFileSync(
      path.join(outDir, "REPORT.md"),
      `# Mobile audit (${phase})\n\nMeasured with Chrome at ${new Date().toISOString().slice(0, 10)}. "Cut off" = content clipped by an overflow-hidden box or a table sticking out of the page. Text counts are elements with text under 12px / under 14px. Targets are interactive elements under 44px (a 44px invisible hit area counts as ok).\n\n| route | width | page scroll | cut off | text <12 / <14 | small targets | inputs <16px | low contrast | overlapping bars | ticker px |\n|---|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n`
    );
  }
}

if (process.argv[1] && process.argv[1].includes("mobile-audit")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
