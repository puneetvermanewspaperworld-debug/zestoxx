# Zestoxx

Paper-trading terminal — charts, options chains, FII/DII flows and the composite **Pulse**
signal, all in one workspace. Ported from the single-file React artifact into a Next.js
App Router app.

## Stack

- **Next.js 16** (App Router) + **React 19**
- **Tailwind CSS v4** (CSS-first config in `app/globals.css`)
- **lucide-react** icons
- Persistence: `localStorage` shim (`lib/storage.ts`) — same async shape as the artifact's
  `window.storage`, so swapping in Prisma/Supabase-backed API routes is a one-file change.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000 — the landing page. "Start paper trading" enters the terminal
at `/app/dashboard`.

## Routes

| Route | View |
|---|---|
| `/` | Landing page |
| `/app/dashboard` | Portfolio summary, mini chart, movers, watchlist, news |
| `/app/trade/[symbol]` | Candlestick chart (MA/EMA/BB/RSI/volume), drawing tools, custom formula bar, order panel, depth ladder |
| `/app/pulse` | Composite signal per symbol |
| `/app/markets` | Sortable table + heatmap |
| `/app/options` | Options chain (index/stock) |
| `/app/fiidii` | FII/DII net flows — daily / weekly / monthly |
| `/app/news` | Market news |
| `/app/alerts` | Price alerts |
| `/app/orders` | Open limit orders + fill history |
| `/app/portfolio` | Holdings allocation + P&L |

## Structure

```
app/
  layout.tsx                  root layout, fonts (Inter + Space Grotesk via next/font)
  page.tsx                    -> <Landing/>
  globals.css                 Tailwind v4 entry, .font-display, ticker/fadeIn keyframes
  app/
    layout.tsx                -> <AppShell/>  (sidebar + topbar + ticker + provider)
    page.tsx                  redirect -> /app/dashboard
    <view>/page.tsx           thin wrappers around components/views/*
    trade/[symbol]/page.tsx   validates symbol, renders <TradeView symbol=… />
  api/
    market-data/route.ts      crypto proxy (CoinGecko); 501 stub for NSE/BSE vendor
    fiidii/route.ts           returns the seeded mock; wire a daily cron for real data
components/
  ZestoxxProvider.tsx         all terminal state + the sim/CoinGecko/persistence effects
  AppShell.tsx                provider + layout chrome
  CandleChart, RSIPanel, DepthLadder, Watchlist, OrderPanel, OptionsChain, TickerTape,
  Sidebar, TopBar, Toasts, Chip, Landing, nav.tsx
  views/                      one component per terminal view, each consuming useZestoxx()
lib/
  symbols.ts    indicators.ts    pulse.ts    formula.ts
  history.ts    helpers.ts       storage.ts  types.ts
```

## What changed from the artifact

- `Root` component's landing/app toggle → real routes (`/` and `/app/*`).
- `AppTerminal`'s giant prop-drilled state → `ZestoxxProvider` context; each view reads
  `useZestoxx()`. Tailwind classes and component logic are otherwise unchanged.
- `activeView` state → the URL. `setActiveView("trade")` → `router.push("/app/trade/<selected>")`.
- `window.storage` → `lib/storage.ts` (localStorage).
- Inline `<style>` font imports → `next/font/google`; keyframes moved to `globals.css`.
- Crypto (BTC/ETH/SOL) still fetches CoinGecko client-side; everything else is the seeded
  random walk. See `app/api/market-data/route.ts` and the handoff brief §4 for wiring a
  real vendor.

## Next steps (from the handoff brief)

1. Pick a market-data vendor, wire it into `app/api/market-data/route.ts`, add keys in
   Vercel env (see `.env.example`).
2. Add `prisma/schema.prisma` + `lib/db.ts`; replace the `storage` shim with API routes.
3. Deploy to Vercel, point `zestoxx.com` at it.
