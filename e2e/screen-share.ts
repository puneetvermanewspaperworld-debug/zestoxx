import type { Page } from "@playwright/test";

/**
 * How much of the screen the Trade chart takes. "Chart" is the plot with its time axis (the element the chart library draws into), measured
 * in CSS pixels against the viewport. Also what stands above it, what covers it (fixed bars), and whether the page itself scrolls.
 */
export interface ScreenShare {
  viewport: { w: number; h: number };
  /** the chart element's own size */
  chart: { w: number; h: number };
  /** height of the chart as a share of the viewport height */
  share: number;
  /** pixels from the top of the viewport to the chart at the scroll position the page opens on */
  chartTop: number;
  /** pixels of the chart that are inside the viewport and not under a fixed bar, as a share of the viewport height */
  visibleShare: number;
  /** pixels of the chart covered by a fixed or sticky bar at that scroll position */
  coveredPx: number;
  /** how far the whole page can scroll (0: it does not scroll) */
  pageScroll: number;
  /** fixed or sticky elements over the viewport, by what they say */
  bars: { label: string; y: number; h: number }[];
}

export async function measureShare(page: Page): Promise<ScreenShare> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const chartEl = document.querySelector('[data-testid="trade-chart"]') as HTMLElement;
    const r = chartEl.getBoundingClientRect();
    // fixed and sticky bars that sit over the page
    const bars: { label: string; y: number; h: number }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const cs = getComputedStyle(el);
      if ((cs.position === "fixed" || cs.position === "sticky") && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().width > vw * 0.5) {
        const b = el.getBoundingClientRect();
        if (b.bottom <= 0 || b.top >= vh) continue;
        // ignore full-screen overlays that are not showing (none are) and the chart's own overlays
        if (chartEl.contains(el) || el.contains(chartEl)) continue;
        bars.push({ label: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28), y: Math.round(b.top), h: Math.round(b.height) });
      }
    }
    let covered = 0;
    const visTop = Math.max(r.top, 0);
    const visBottom = Math.min(r.bottom, vh);
    for (const b of bars) {
      const t = Math.max(r.top, b.y);
      const bt = Math.min(r.bottom, b.y + b.h);
      if (bt > t) covered += bt - t;
    }
    // the visible part: inside the viewport, minus what the bars cover
    let visible = Math.max(0, visBottom - visTop) - covered;
    visible = Math.max(0, visible);
    let n: HTMLElement | null = chartEl;
    let scroll = 0;
    while (n) {
      const s = getComputedStyle(n);
      if ((s.overflowY === "auto" || s.overflowY === "scroll") && n.scrollHeight > n.clientHeight) scroll = Math.max(scroll, n.scrollHeight - n.clientHeight);
      n = n.parentElement;
    }
    scroll = Math.max(scroll, document.documentElement.scrollHeight - vh);
    return {
      viewport: { w: vw, h: vh },
      chart: { w: Math.round(r.width), h: Math.round(r.height) },
      share: Math.round((r.height / vh) * 1000) / 10,
      chartTop: Math.round(r.top),
      visibleShare: Math.round((visible / vh) * 1000) / 10,
      coveredPx: Math.round(covered),
      pageScroll: Math.round(scroll),
      bars,
    };
  });
}
