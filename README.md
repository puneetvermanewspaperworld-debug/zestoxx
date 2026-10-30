# Zestoxx

Paper-trading terminal — charts, options chains, FII/DII flows and the composite **Pulse**
signal, all in one workspace. Ported from the single-file React artifact into a Next.js
App Router app.

## Stack

- **Next.js 16** (App Router) + **React 19**
- **Tailwind CSS v4** (CSS-first config in `app/globals.css`)
- **lucide-react** icons
- **Prisma 6** ORM + **Postgres** (local dev points at a dev database on the same host)
- Persistence: the terminal reads/writes one portfolio blob through `lib/storage.ts`
  (`get`/`set`, unchanged signatures), now backed by `/api/portfolio` + Prisma instead
  of `localStorage`.

## Run

```bash
npm install                 # runs `prisma generate` via postinstall
cp .env.example .env         # fill in DATABASE_URL + DIRECT_URL (a dev Postgres db)
cp .env.example .env.local   # fill in UPSTOX_ANALYTICS_TOKEN (optional)
npm run db:deploy            # applies migrations to that database
npm run dev
```

Open http://localhost:3000 — the landing page. "Start paper trading" enters the terminal
at `/app/dashboard`. Without a Postgres URL the app builds and runs but the portfolio
won't persist; without an Upstox token, NSE/BSE symbols stay on the simulation.

## Routes

| Route | View |
|---|---|
| `/` | Landing page |
| `/app/dashboard` | Portfolio summary, mini chart, movers, watchlist, news |
| `/app/trade/[symbol]` | Candlestick chart (MA/EMA/BB/RSI/volume), drawing tools, custom formula bar, order panel, depth ladder |
| `/app/pulse` | Composite signal per symbol |
| `/app/markets` | Sortable table + heatmap |
| `/app/movers` | Market movers: Equity (all NSE) · F&O → Equity / Futures / Options (OPTIDX, OPTSTK; volume- or price-based) |
| `/app/options` | Real option chain (OI, ΔOI, IV) + ATM IV / PCR / India VIX / max pain / second-highest call & put OI |
| `/app/buildup` | Long/Short buildup: stacked LB/SC/SB/LU bar + per-strike heatmap for NIFTY, BANK NIFTY, FINNIFTY, MIDCPNIFTY |
| `/app/fiidii` | FII/DII — FII|DII × Cash|Derivatives × daily/weekly/monthly, Nifty % column, FII index-futures long/short (**simulated**) |
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
    options-chain/route.ts    live Upstox option chain + expiries + India VIX (or `{source:"unavailable"}`)
    fno-movers/route.ts       market-wide movers from Upstox bulk quotes (or `{source:"unavailable"}`)
    option-quote/route.ts     full quote for one option contract: OHLC, 5-level depth, buy/sell totals
    option-candles/route.ts   today's 5-minute candles for one option contract (order-sheet chart)
    option-marks/route.ts     last prices for held option contracts (portfolio mark-to-market)
    option-expiries/route.ts  upcoming expiry dates for an underlying (the "EXPIRY TODAY" badge)
    buildup-window/route.ts   buildup over a chosen intraday window (`?back=10` or `?from=09:45&to=10:30`)
    watchlist/route.ts        priced rows for a popular list (`?list=`) or any NSE symbols (`?symbols=`)
    watchlist-search/route.ts symbol/name search across all NSE equities and ETFs (no token needed)
components/
  ZestoxxProvider.tsx         all terminal state + the sim/CoinGecko/persistence effects
  AppShell.tsx                provider + layout chrome
  CandleChart, RSIPanel, DepthLadder, Watchlist, OrderPanel, OptionsChain, TickerTape,
  Sidebar, TopBar, Toasts, Chip, Landing, nav.tsx
  views/                      one component per terminal view, each consuming useZestoxx()
lib/
  symbols.ts    indicators.ts    pulse.ts    formula.ts
  history.ts    helpers.ts       types.ts
  upstox.ts                    Upstox instrument keys + LTP / historical / option-chain fetchers
  upstox-movers.ts             instrument-master universe loader + equity/futures/options rankers (server)
  movers.ts / useMovers.ts     shared types + the polling hook for the Movers view
  options.ts                   buildup classification, chain stats (PCR, max pain…), simulated chain
  useOptionChain.ts            client hook: live chain, else labelled simulation
  fiidii.ts                    simulated FII/DII generator + daily/weekly/monthly aggregation
  useIsClient.ts               defers date-dependent UI past hydration
  db.ts                        Prisma client singleton
  auth.ts                      getCurrentUser() — demo user until real auth
  portfolio.ts                 blob <-> relational tables (loadPortfolio / savePortfolio)
  storage.ts                   get/set shim -> fetch('/api/portfolio')
prisma/
  schema.prisma                User, Watchlist, Holding, Order, Alert (postgresql)
  migrations/                  committed; `npm run db:deploy` applies them
vercel.json                    build command incl. `prisma migrate deploy`
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

Useful scripts: `npm run db:deploy` (apply committed migrations — used locally and by
the Vercel build), `npm run db:migrate` (create a new dev migration after a schema
change), `npm run db:studio` (Prisma Studio), `npm run db:reset` (drop + reapply).

## Deploying to Vercel

The repo is Vercel-ready: `vercel.json` sets the build command to
`prisma generate && prisma migrate deploy && next build`, so each deploy regenerates
the client and applies any pending migrations to your database.

1. **Create a Postgres database.** In the Vercel project, **Storage → Create Database →
   Postgres** (Neon-backed). Connecting it to the project auto-adds `DATABASE_URL` and a
   non-pooled URL (`DATABASE_URL_UNPOOLED` / `POSTGRES_URL_NON_POOLING`) to the env.
2. **Environment variables** (Project Settings → Environment Variables), for
   *Production* and *Preview*:

   | Variable | Value | Notes |
   |---|---|---|
   | `DATABASE_URL` | pooled Postgres URL | auto-added when you connect the DB in step 1 |
   | `DIRECT_URL` | direct / non-pooled Postgres URL | **add manually** — paste the value of the non-pooled URL the DB gave you (`DATABASE_URL_UNPOOLED` etc.). If you have no pooler, set it equal to `DATABASE_URL`. |
   | `UPSTOX_ANALYTICS_TOKEN` | your Upstox Analytics Token | **add manually**. Omit to ship with equities on the simulation. |

   `NODE_ENV` is set by Vercel; nothing else is needed. CoinGecko needs no key.
3. **Push to GitHub and import the repo** into Vercel (or `vercel --prod`). The first
   build runs `prisma migrate deploy` against `DIRECT_URL`, creating the tables.
4. For **local dev**, put a *separate* dev database's URLs in `.env` (the Prisma CLI
   reads `.env`, not `.env.local`) and the token in `.env.local`, then `npm run db:deploy`.

No application code is Postgres-specific — `lib/db.ts`, `lib/portfolio.ts` and the
routes are provider-agnostic.

## Live market data

Every symbol starts as a seeded random walk. `ZestoxxProvider` then asks
`/api/market-data` for real data and, per symbol that a feed answers for, swaps in real
candles + price and flips that symbol's badge from **Simulated** to **Live data**:

| Symbols | Feed | Auth | Refresh |
|---|---|---|---|
| BTC, ETH, SOL | CoinGecko | none | price 25 s, history on load |
| RELIANCE, TCS, INFY, HDFCBANK, SBIN, TATAMOTORS, NIFTY50, SENSEX, BANKNIFTY | Upstox v3 | `UPSTOX_ANALYTICS_TOKEN` | LTP 25 s (cached 10 s), ~400 d of daily candles on load (cached 1 h) |
| Option chains (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, the stocks above, SENSEX) + India VIX | Upstox v2 `option/chain`, `option/contract` | same token | chain re-polled every 30 s (cached 15 s), expiry list cached 1 h |
| FII/DII flows | — | — | **simulated** (NSE blocks scraping; see `app/api/fiidii/route.ts` for the ingest plan) |

Both are proxied server-side through `app/api/market-data/route.ts` so no credential or
CORS issue reaches the browser. The Upstox token is a **long-lived, read-only Analytics
Token** used as a static `Authorization: Bearer` header — there is no OAuth login or
callback route. Instrument keys live in `lib/upstox.ts` (`UPSTOX_KEYS`).

Setup: put the token in `.env.local` (gitignored) as `UPSTOX_ANALYTICS_TOKEN=…`, or in
Vercel project env for production. With no token the equity endpoints return `{}` and
those symbols stay simulated — nothing breaks.

### Market movers

`/api/fno-movers` ranks the whole market from Upstox bulk quotes (up to 500 instruments per call,
price + previous close + volume). The F&O universe and each month's *current* futures/option
keys are read from Upstox's public NSE instrument master (~1.9 MB gzipped, re-read every 6 h),
so new expiries and new F&O stocks appear without code changes.

- **Equity** — all ~2,700 NSE stocks, skipping anything priced under ₹10 or that has traded
  under ₹5 Cr today (`EQUITY_FILTER` in `lib/movers.ts`; the UI states it). **F&O → Equity** is
  the ~218 F&O-eligible stocks.
- **Futures** — near-month stock futures plus NIFTY/BANKNIFTY/FINNIFTY/MIDCPNIFTY/NIFTYNXT50.
- **Options** — nearest expiry only. OPTIDX = the four index options; OPTSTK = the 25 stocks whose
  futures trade the most value today. The 100 most-traded contracts by value are returned and
  the UI re-sorts them (volume, value, or price gainers/losers).
- Results are computed at most once per 15 s per instance and CDN-cacheable for 15 s, so many
  viewers don't multiply calls against Upstox's shared limit (500/min per token).
- **No simulation fallback** — unlike the option chain, a market-wide ranking can't be simulated
  honestly, so without the feed the page says "unavailable".
- Mutual Funds is a disabled "Soon" tab until a fund-data source is chosen.

### Option chain, buildup and the stats strip

`/api/options-chain` returns per-strike LTP, previous close, OI, previous OI, volume and IV
for calls and puts. Everything on the Options and Buildup views is computed from that one
payload in `lib/options.ts`:

- **PCR** = total put OI ÷ total call OI · **ATM IV** = mean of the ATM call/put IV ·
  **Max pain** = strike minimising option writers' payout · **second-highest call/put** = the
  strikes with the 2nd-largest OI.
- **Buildup** — each call and put is classified on its *own* premium and OI vs the previous
  session: premium↑ OI↑ long buildup, premium↑ OI↓ short covering, premium↓ OI↑ short buildup,
  premium↓ OI↓ long unwinding. Only contracts that traded today with a prior-session reference
  count. A put's "long buildup" is bearish for the index; the in-app explainer says so.

With no token (or if Upstox errors) the route answers `{source:"unavailable"}` and the client
shows a deterministic simulated chain, badged **Simulated**.

### Buildup time window

The Buildup page has a **Time window** bar: *Since prev close* (default), the last 1 / 5 / 10 / 30 / 60 / 100
minutes, or **Custom** — a two-handle slider plus typed start and end times. Each 1-minute option candle
carries the contract's close and its open interest, so the premium change and OI change between any two times
come from two bars (`lib/buildup-window.ts`, unit-tested and cross-checked against raw candles). A window
starting before the first bar is measured from the first bar's open price and OI.

- Windows cover the strikes within **12 of the money** (not the whole chain) and need live data; with a
  simulated chain only *Since prev close* is offered.
- **Which day:** today's bars while the session is on (and until midnight); otherwise the latest earlier day
  that has minute data — Upstox's history lags about a day, so on a weekend or pre-open you see the last full
  session, and the page says which date.
- **Rate limits matter here.** A burst of ~200 parallel minute-candle calls got the dev machine rate-limited by
  Upstox's edge (Cloudflare 1015, ~5 min Retry-After). `lib/upstox-buildup.ts` fetches nearest strikes first,
  paced (~6 requests/s, 3 in flight), caches every contract's bars (a finished day for 6 h, a live one for
  1 min), and on a 429 stops, remembers the Retry-After and doesn't call Upstox again until it passes. A cold
  window takes ~8 s; after that, moving the window is instant. The 52-week watchlist job was slowed for the same
  reason.

### Greeks

The Options chain has an **OI & IV | Greeks** switch. Greeks view shows OI, delta, theta, vega and gamma
for calls and puts (mirrored around the strike), and the order sheet's Scrip Details lists them for the
selected contract. Live values are Upstox's own (`option_greeks`), passed through untouched — a Greek the
feed doesn't send shows "--", never 0. A simulated chain computes Black–Scholes Greeks instead
(`blackScholesGreeks` in `lib/options.ts`; 6.5% rate), badged Simulated with the rest of the chain.
Units: theta is ₹ per day, vega is ₹ per 1-point IV move. Stock and index Trade pages have an
**Option Chain** link that opens the chain for that symbol.

### Option order sheet and paper-trading options

Clicking a CE/PE LTP in the Options chain opens a sheet (bottom sheet on phones) for that
contract: header with LTP and change, tabs **Charts** (today's 5-minute closes) · **Option
Chain** (neighbouring strikes — click to switch contract) · **Scrip Details**, then
Open/High/Low/Prev Close, a 5-level depth ladder, and a buy/sell quantity bar.

- Live contracts come from `/api/option-quote` (Upstox full quote, polled every 5 s). The
  bar uses the exchange's *whole-book* buy/sell totals, not just the five levels shown.
  Previous close is `last_price − net_change`, because the API's own `ohlc.close` tracks the
  live price intraday. Without Upstox the sheet falls back to a deterministic simulation
  (badged **Simulated**; no chart).
- **Paper Trade**: quantity is in lots (lot size comes from the exchange contract list).
  Market orders only, filled at the last traded price. `sell` closes a position you hold —
  short selling/writing isn't modelled, and the sheet says so.
- Holdings/orders for contracts use ids like `NIFTY 03 NOV 22900 CE#NSE_FO|53750`
  (`lib/contract.ts`): readable label + the Upstox key used to mark the position to market
  every 30 s (`/api/option-marks`). Simulated contracts carry a `sim|…` key and are re-priced
  from the simulated chain. Expired contracts stop being marked and are valued at cost —
  there is no expiry/settlement logic yet.
- Instrument keys proxied by these routes must match `NSE_FO|<digits>` (or BSE_FO/MCX_FO) —
  the routes are not a general Upstox passthrough.

### Watchlists

`/app/watchlist` has live NIFTY 50 / NIFTY BANK cards (an **Expiry today** badge appears when the
nearest option expiry — from `/api/option-expiries`, or the generated calendar if Upstox is
down — is today in IST), and three kinds of tab: **Explore** (Popular Watchlists), **My
Watchlist** (the sidebar list) and your own custom lists (**+ Create Watchlist**, up to 10 lists
× 50 symbols).

- **Popular lists** (`lib/watchlists.ts`): sector/ETF lists are fixed NSE symbols that are
  validated against the instrument master each time (a delisted one just drops out);
  *Top Gainers/Losers* reuse the movers ranking; *All/Gold/Silver ETF* are the fund-unit
  (`INF…` ISIN) instruments, most traded first; *52 Week High/Low* rank the F&O stocks by
  distance from their extreme, from a year of daily candles (≈220 calls, cached an hour);
  *Festive Season* is Zestoxx's own editorial theme. Curated for browsing — not recommendations.
- **Custom lists hold any NSE symbol**, found through `/api/watchlist-search` and priced by
  bulk LTP. They are quote-only: charts and paper trading still cover only the symbols in
  `lib/symbols.ts` (the page says so). **My Watchlist** stays limited to those.
- Persistence: `Watchlist.listName` (migration `20261030000000_watchlist_lists`; existing rows
  default to "My Watchlist"). An empty custom list is kept as a marker row with symbol `""`.

### Order book, GTD orders and Stock SIPs

`/app/orders` has **Orderbook | Positions | Mutual Fund** tabs; Orderbook has **Open | Closed | GTD | Stock
SIP**. Order metadata is `orderType: MARKET | LIMIT | GTD | SIP` (plus `expiryDate` for GTD) —
`lib/orders.ts` holds the rules and is unit-testable on its own.

- **LIMIT is a day order**: it rests until the price crosses, and is moved to Closed as *Expired* once
  the IST date turns. **GTD** is the same limit order but stays valid through its expiry date (up to
  365 days out). Place either from the Trade view's order panel. Open lists every resting order; GTD
  filters to GTD ones; Closed holds filled, cancelled and expired orders.
- **Stock SIP**: a fixed ₹ amount (min ₹500) bought on a weekly or monthly schedule, in whole shares.
  Plans can be paused, resumed and cancelled. SIPs are executed **by the open terminal**, not a server
  job: on weekdays from 09:15 IST, once the first market-data answer is in (never at seed prices). An
  installment missed while the terminal was closed is skipped, not bought later in one lump; one that
  costs more than the virtual cash, or buys less than a whole share, is skipped with a notice.
  Exchange holidays aren't modelled.
- **Positions** lists holdings (stocks and option contracts) with P&L and a two-step **Exit** (sells the
  whole position at the last price). The **Mutual Fund** tab is informational only — Zestoxx doesn't
  buy, sell or track fund units.
- Resting orders, SIPs and cancelled/expired history now persist (migration
  `20261031000000_order_types_and_sips`: `Order.orderType/expiryDate/placedDate` and a `Sip` table).

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
