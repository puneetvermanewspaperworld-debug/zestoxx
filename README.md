# Zestoxx

Paper-trading terminal — charts, options chains, FII/DII flows and the composite **Pulse**
signal, all in one workspace. Ported from the single-file React artifact into a Next.js
App Router app.

## Stack

- **Next.js 16** (App Router) + **React 19**
- **Tailwind CSS v4** (CSS-first config in `app/globals.css`)
- **lucide-react** icons
- **Prisma 6** ORM — SQLite locally, Postgres in production
- Persistence: the terminal reads/writes one portfolio blob through `lib/storage.ts`
  (`get`/`set`, unchanged signatures), now backed by `/api/portfolio` + Prisma instead
  of `localStorage`.

## Run

```bash
npm install            # runs `prisma generate` via postinstall
cp .env.example .env    # DATABASE_URL="file:./dev.db" is the only required var
npm run db:migrate      # creates prisma/dev.db and applies migrations
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
    market-data/route.ts      CoinGecko (crypto) + Upstox (NSE/BSE) proxy
    fiidii/route.ts           returns the seeded mock; wire a daily cron for real data
    portfolio/route.ts        GET/PUT the portfolio blob, backed by Prisma
components/
  ZestoxxProvider.tsx         all terminal state + the sim/CoinGecko/persistence effects
  AppShell.tsx                provider + layout chrome
  CandleChart, RSIPanel, DepthLadder, Watchlist, OrderPanel, OptionsChain, TickerTape,
  Sidebar, TopBar, Toasts, Chip, Landing, nav.tsx
  views/                      one component per terminal view, each consuming useZestoxx()
lib/
  symbols.ts    indicators.ts    pulse.ts    formula.ts
  history.ts    helpers.ts       types.ts
  upstox.ts                    Upstox instrument keys + LTP / historical fetchers
  db.ts                        Prisma client singleton
  auth.ts                      getCurrentUser() — demo user until real auth
  portfolio.ts                 blob <-> relational tables (loadPortfolio / savePortfolio)
  storage.ts                   get/set shim -> fetch('/api/portfolio')
prisma/
  schema.prisma                User, Watchlist, Holding, Order, Alert
  migrations/                  committed; run `npm run db:migrate` to apply
```

## Data layer

The terminal keeps the authoritative portfolio in React state and, 600 ms after any
change, `PUT`s the whole blob (`watchlist`, `cash`, `holdings`, `orderLog`, `alerts`)
to `/api/portfolio`. The route decomposes it across the relational tables in one
transaction (`lib/portfolio.ts`); `GET` reassembles the same shape, or returns `null`
when nothing is saved yet so the client keeps its default watchlist.

There is no auth yet, so every request resolves to one shared demo user
(`lib/auth.ts` → `getCurrentUser()`). Wiring real auth (NextAuth / Clerk / Supabase
Auth) touches only that function.

Useful scripts: `npm run db:migrate` (dev migration), `npm run db:studio` (Prisma
Studio), `npm run db:reset` (drop + re-seed), `npm run db:deploy` (apply migrations in
CI/prod).

### Switching to Postgres for production

1. In `prisma/schema.prisma`, change the datasource:
   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
2. Set `DATABASE_URL` to your Postgres/Supabase connection string (in Vercel project
   env vars, not committed) — e.g.
   `postgresql://user:pass@host:5432/zestoxx?schema=public&sslmode=require`.
3. Regenerate the migration history against Postgres (SQLite and Postgres migration
   SQL differ), then deploy:
   ```bash
   rm -rf prisma/migrations          # local only, before first Postgres migrate
   npm run db:migrate -- --name init # creates the Postgres migration
   ```
   In CI/production the build runs `prisma generate`; add `npm run db:deploy` to your
   deploy step (or a Vercel build command) to apply migrations.
4. No application code changes — `lib/db.ts`, `lib/portfolio.ts` and the route are
   provider-agnostic.

## Live market data

Every symbol starts as a seeded random walk. `ZestoxxProvider` then asks
`/api/market-data` for real data and, per symbol that a feed answers for, swaps in real
candles + price and flips that symbol's badge from **Simulated** to **Live data**:

| Symbols | Feed | Auth | Refresh |
|---|---|---|---|
| BTC, ETH, SOL | CoinGecko | none | price 25 s, history on load |
| RELIANCE, TCS, INFY, HDFCBANK, SBIN, TATAMOTORS, NIFTY50, SENSEX, BANKNIFTY | Upstox v3 | `UPSTOX_ANALYTICS_TOKEN` | LTP 25 s (cached 10 s), ~400 d of daily candles on load (cached 1 h) |

Both are proxied server-side through `app/api/market-data/route.ts` so no credential or
CORS issue reaches the browser. The Upstox token is a **long-lived, read-only Analytics
Token** used as a static `Authorization: Bearer` header — there is no OAuth login or
callback route. Instrument keys live in `lib/upstox.ts` (`UPSTOX_KEYS`).

Setup: put the token in `.env.local` (gitignored) as `UPSTOX_ANALYTICS_TOKEN=…`, or in
Vercel project env for production. With no token the equity endpoints return `{}` and
those symbols stay simulated — nothing breaks.

### "Chg %" — day-change

`chgFor(id)` / `prevCloseFor(id)` on the context are the single source of truth for
day-change, used by the ticker, watchlist, Trade header, movers, Markets table/heatmap
and the Pulse "Momentum". It is `(price − previousClose) / previousClose`, where
`previousClose` is:

- **equities/indices** — Upstox's `cp` (previous session close) from the LTP feed
- **crypto** — the price 24 h ago, derived from CoinGecko `usd_24h_change` (a 24/7
  market has no session close; this is the crypto-standard reference)
- **simulated symbols** — the prior candle's close in the generated history

Before the Indian market opens (09:15 IST) equities correctly read 0.00% — they
haven't traded yet that day; indices already move in the pre-open session.

## What changed from the artifact

- `Root` component's landing/app toggle → real routes (`/` and `/app/*`).
- `AppTerminal`'s giant prop-drilled state → `ZestoxxProvider` context; each view reads
  `useZestoxx()`. Tailwind classes and component logic are otherwise unchanged.
- `activeView` state → the URL. `setActiveView("trade")` → `router.push("/app/trade/<selected>")`.
- `window.storage` → `lib/storage.ts`, now hitting `/api/portfolio` (Prisma) — see
  "Data layer" above. Same `get`/`set` signatures, so components are untouched.
- Inline `<style>` font imports → `next/font/google`; keyframes moved to `globals.css`.
- Market data: see "Live market data" below. Crypto via CoinGecko, NSE/BSE via Upstox,
  both proxied through `/api/market-data`; anything a feed doesn't answer for stays a
  seeded random walk.

## Next steps (from the handoff brief)

1. Pick a market-data vendor, wire it into `app/api/market-data/route.ts`, add keys in
   Vercel env (see `.env.example`).
2. ~~Add Prisma + replace the `storage` shim with API routes.~~ ✅ done — see "Data layer".
3. Add real auth; update `lib/auth.ts` `getCurrentUser()`.
4. Deploy to Vercel with Postgres (see "Switching to Postgres"), point `zestoxx.com` at it.
