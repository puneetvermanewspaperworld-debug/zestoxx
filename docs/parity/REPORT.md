# HDFC parity audit

Audit only: nothing was built or changed in the app. Checked against `main` at `0f0fc24`, the production build run locally with live Upstox
data (the market was closed, which shows in a few screens). Screenshots are in this folder as `<id>-<name>-desktop.jpg` (1280x800) and
`-phone.jpg` (390x844). Items marked Missing have no screenshot because there is nothing to show. Regenerate with
`npx tsx --tsconfig tsconfig.json scripts/parity-shots.ts`.

Status: **Done** = built and matches the checklist item; **Partial** = built, with the gap named; **Missing** = not in the app.
Size: small (a few hours), medium (about a day), large (several days, or needs a new data source).

| # | Item | Status | Route | What is missing | Size | Screenshots |
|---|---|---|---|---|---|---|
| 1.1 | Orders tabs: Orderbook, Positions, Mutual Fund | Done | /app/orders | The Mutual Fund tab is an information note only (by design) | - | 01-orders-open, 01-orders-positions, 01-orders-mutual-fund |
| 1.2 | Sub-tabs Open, Closed, GTD, Stock SIP with counts | Partial | /app/orders | Counts show only on Open and GTD and are hidden at zero (HDFC shows "Open (0)"); none on Closed or Stock SIP | small | 01-orders-open, 01-orders-gtd, 01-orders-closed, 01-orders-stock-sip |
| 1.3 | Empty state "No Open Orders" with skeleton rows | Partial | /app/orders | Title is there; a "Go to Trade" card replaces the skeleton rows | small | 01-orders-open |
| 1.4 | Row checkboxes for bulk cancel | Missing | /app/orders | Only a per-row Cancel link; no selection, no bulk cancel | medium | - |
| 1.5 | GTD order type in the paper engine | Done | /app/orders, Trade order panel | - | - | 01-orders-gtd |
| 1.6 | Stock SIP as a recurring paper order | Done | /app/orders | Runs only while the app is open (stated on the page) | - | 01-orders-stock-sip |
| 1.7 | Better: charges paid and net P&L on each closed order | Missing | /app/orders | Closed table has Symbol, Side, Type, Qty, Price, Status, Time only | medium | 01-orders-closed (current state) |
| 2.1 | Heading with an Options toggle beside Watchlist | Missing | /app/watchlist | Options is a separate page (/app/options), no toggle | small | - |
| 2.2 | Top cards NIFTY 50 and NIFTY BANK with change, change % and EXPIRY TODAY tag | Partial | /app/watchlist | Shows price and % only, not the point change; the Expiry-today tag is built (shows only on expiry day) | small | 02-watchlist-explore |
| 2.3 | Tabs: Explore, own lists, "+ Create Watchlist" | Done | /app/watchlist | - | - | 02-watchlist-explore, 02-watchlist-create |
| 2.4 | Popular watchlists grid with tags | Partial | /app/watchlist | 14 lists (all the named ones except **ETF Picks**, plus a Festive Season list); tags read "LIVE RANKING" and "EDITORIAL", not "Trending" and "New" | small | 02-watchlist-explore |
| 2.5 | Better: each list shows its rule | Done | /app/watchlist | Each card states its rule (the 52-week lists say "closest to", with no threshold) | - | 02-watchlist-explore |
| 3.1 | Option sheet header: name, LTP with arrow, change, change %, segment and OI, bookmark | Partial | /app/options (tap a strike) | Name, LTP, change and % are there. No direction arrow, no segment, OI is in the Scrip Details tab not the header, no bookmark | small | 03-option-sheet, 03-option-sheet-details |
| 3.2 | Links: Charts, Option Chain, Scrip Details | Done | /app/options | Built as tabs inside the sheet | - | 03-option-sheet |
| 3.3 | Open, High, Low, Previous close | Done | /app/options | Shows "--" for all four while the market is closed | - | 03-option-sheet |
| 3.4 | Five-level market depth | Done | /app/options | - | - | 03-option-sheet |
| 3.5 | Buy % against sell % bar with totals | Done | /app/options | Appears when the book has quantities | - | 03-option-sheet |
| 3.6 | Paper Buy, Paper Sell and a more-options menu | Partial | /app/options | The section is headed "Paper Trade" but the buttons read "Buy" and "Sell" (checklist rule: "Paper buy" / "Paper sell"); no more-options menu | small | 03-option-sheet |
| 3.7 | Better: breakeven, charges, delta, theta per day, what-if line on the contract | Missing | /app/options | The F&O Analyzer (/app/fno) has all of this, but the sheet does not use it | medium | - |
| 4.1 | Movers sub-tabs Equity, Futures, Options | Done | /app/movers | - | - | 04-movers-fno-options |
| 4.2 | Dropdown Volume Based / Price Based | Done | /app/movers | - | - | 04-movers-fno-options |
| 4.3 | Toggle OPTIDX / OPTSTK | Done | /app/movers | - | - | 04-movers-fno-options |
| 4.4 | Tabs Most Active Volume / Value | Done | /app/movers | - | - | 04-movers-fno-options |
| 4.5 | Rows: contract, LTP with arrow, change, change %, segment, volume | Partial | /app/movers | No arrow and no segment column; Chg shows 0.00 and Chg % "--" while the market is closed | small | 04-movers-fno-options, 04-movers-equity |
| 4.6 | Better: tap a row to open the contract sheet | Missing | /app/movers | Rows are not tappable | medium | - |
| 5.1 | Futures: Today's gainers and Today's losers | Done | /app/movers | Tabs, not a dropdown | - | 05-movers-fno-futures |
| 5.2 | Futures rows: contract and expiry, price, change, %, volume | Done | /app/movers | Also shows lot size | - | 05-movers-fno-futures |
| 6.1 | Commodity options: expiry selector, Call/Put toggle | Missing | - | No commodities pages. Blocked by Task F (does the Upstox token return MCX quotes?) | large | - |
| 6.2 | Strikes tagged ITM, ATM, OTM, "View More" | Missing | - | Same | large | - |
| 7.1 | Commodities dashboard: LIVE tags, CRUDEOILM, NATGASMINI, expiry tags | Missing | - | Same | large | - |
| 7.2 | Commodity chips, future watchlist, option watchlist | Missing | - | Same | large | - |
| 8.1 | MTF explainer row (concept, bearish/bullish markets, cashless MTF) | Missing | - | No MTF pages | medium | - |
| 8.2 | MTF "Stocks in spotlight" list: eligible stocks, "x% funding", price after funding | Missing | - | Needs an eligibility and funding-percentage source (brokers set these per stock) | large | - |
| 9-12 | MTF calculator and explainer: donut, stock search, expected price, days, amount; With/Without side by side | Missing | - | Spec is in section D of the build plan; no outside data needed | medium | - |
| 14.1 | Mutual fund categories grid (11 categories) | Missing | - | No fund pages; needs AMFI's NAV file, two tables and a nightly cron | large | - |
| 14.2 | Quick access: My Orders, NFO, Top Picks (as a returns-ranked list) | Missing | - | Same | medium | - |
| 15.1 | Fund card with 3-year CAGR | Missing | - | Needs NAV history | medium | - |
| 15.2 | "Baskets" as sample category mixes without named funds | Missing | - | Pure content plus the NAV data | medium | - |
| 16.1 | Monthly SIP / One time toggle, amount slider, "View investment plans" projection | Missing | - | A calculator with no outside data; should show a range, not one number | medium | - |
| 17.1 | Second-highest call and put strike with OI and change % | Partial | /app/options, /app/buildup | Strike and OI are shown, tagged Resistance and Support; no change % | small | 17-options-chain-stats, 17-buildup-heatmap |
| 17.2 | ATM IV, PCR and India VIX row | Done | /app/options, /app/buildup | ATM IV shows "--" while the market is closed | - | 17-options-chain-stats |
| 17.3 | Paper Sell Call / Paper Sell Put buttons with a buy-sell toggle | Missing | /app/options | Orders start by tapping a strike, which opens the sheet; no dedicated buttons | small | - |
| 17.4 | Trade With Heatmap: NIFTY, BANK NIFTY, FINNIFTY, MIDCPNIFTY tabs, expiry selector, "How to read" link, stacked buildup bar | Done | /app/buildup | Shows an empty state ("No liquid contracts to classify yet") while the market is closed; I confirmed the stacked bar in code, not on screen | - | 17-buildup-heatmap |
| 17.5 | Market Movers section below | Partial | /app/movers | Separate page, not on one F&O dashboard (there is no single F&O dashboard page; 17 and 20 are spread over three pages) | medium | - |
| 19.1 | FII and DII toggle | Done | /app/fiidii | - | - | 19-fiidii-with-sample-rows |
| 19.2 | Cash Market and Derivatives toggle | Partial | /app/fiidii | Cash only; derivatives flows were removed because no real source is connected | medium | 19-fiidii-with-sample-rows |
| 19.3 | Period dropdown Daily, Weekly, Monthly | Done | /app/fiidii | - | - | 19-fiidii-with-sample-rows |
| 19.4 | Table: Date, Nifty with % change that day, Amount in crore | Partial | /app/fiidii | No Nifty % column (removed with the simulator). It can now be worked out from the Nifty closes stored for the index P/E | small | 19-fiidii-with-sample-rows |
| 19.5 | Better: line chart of FII net against the Nifty | Missing | /app/fiidii | Same data as 19.4 | medium | - |
| 20.1 | Futures top gainers as a bar list with "View more" | Missing | /app/dashboard | The data is on /app/movers; the dashboard has a different "Market Movers" card (see findings) | small | - |
| 20.2 | FII/DII summary card: FII net, DII net, FII futures long % vs short %, "View All" | Missing | /app/dashboard | The same figures are on /app/fiidii; no dashboard card | small | - |
| 20.3 | "Learn how to trade in options" cards | Missing | - | Only the "How to read Buildups" explainer exists | small | - |
| N.1 | Phone bottom tab bar | Done | all pages | Tabs are Dashboard, Watchlist, Trade, Pulse, More (not HDFC's Portfolio, Orders, Research; Orders and Portfolio sit under More) | - | nav-bottom-nav-more-sheet (phone only) |
| N.2 | Top row of segment chips: Equity, F&O, Mutual Funds, MTF, Commodities | Missing | - | Not built | medium | - |
| N.3 | Bottom sheets for contract and order screens | Done | /app/options, /app/trade | Contract sheet and the Paper buy/sell ticket are bottom sheets on phones | - | 03-option-sheet |
| 21.1 | Left tool rail | Missing | /app/trade/[symbol] | Chart tools are a single row of buttons above the chart | large | 21-chart-trade-page |
| 21.2 | Floating quick-tool bar: trendline, horizontal line, parallel channel | Partial | /app/trade/[symbol] | Trend and H-Line buttons exist; no parallel channel; not floating | medium | 21-chart-trendline-active |
| 21.3 | Horizontal levels with a coloured price tag on the right axis | Partial | /app/trade/[symbol] | H-Line draws a level; no axis tag, colour or editable price | small | 21-chart-trade-page |
| 21.4 | Rectangle range box with fill and dashed midline | Missing | /app/trade/[symbol] | - | medium | - |
| 21.5 | Dotted last-price line with an axis tag coloured by direction | Missing | /app/trade/[symbol] | - | small | - |
| 21.6 | Freehand brush and text note | Missing | /app/trade/[symbol] | - | medium | - |
| 21.7 | "Reset view" button | Missing | /app/trade/[symbol] | - | small | - |
| 21.8 | Volume bars under the candles | Done | /app/trade/[symbol] | The "Vol" toggle | - | 21-chart-trade-page |
| 21.9 | Select, drag, resize; colour and line style; lock, clone, delete; undo and redo | Missing | /app/trade/[symbol] | Only "Clear" (delete all) exists | large | - |
| 21.10 | Better: measure tool with approximate ₹ per lot; tap a level to create an alert | Missing | /app/trade/[symbol] | Price alerts exist (/app/alerts and an Alert button) but are not tied to a level | medium | - |
| B.1 | Reference for the "Better" items: the F&O Analyzer (breakeven, charges, Greeks, what-if grid) | Done (not on the checklist) | /app/fno | Not linked from the contract sheet (see 3.7) | - | better-fno-analyzer-long-call |

## Anything the checklist says not to build that already exists

Checked by searching the code and by reading each page. **None of the forbidden features exist:** no Expert picks, no Trade ideas, no
entry, target or stop-loss recommendations, no "Activate segment" banner, no "Recommendations of" banner, no "Invest Now" button, no
"Daily Pulse" video promo, no "Today's Experts Picks" card. One grey area to review:

- **Pulse (/app/pulse)** gives every symbol a score with a Bullish / Neutral / Bearish label. It is not an entry, target or stop-loss, but it is a
  directional label per symbol, and it is partly computed from the sample news headlines below. Build-plan item G5 already says to present
  Pulse as an educational indicator, not a call.

## Findings that are not on the checklist (found while auditing)

1. **The news headlines are invented.** `NEWS` in `lib/symbols.ts` is a fixed list of eight made-up headlines with made-up sources ("Bourse
   Wire", "CoinLedger") and fixed "2h ago" times. It appears unlabelled on the Dashboard and the News page, and feeds the Pulse scores. This
   conflicts with the "never show invented numbers" rule used for FII/DII. High priority; small to label or remove, large to replace with a real source.
2. **The Trade page "Order Book" depth is generated.** `DepthLadder` builds six bid and ask levels from a seeded random number, next to a "Live
   data" badge. The option sheet's depth is real exchange data; this one is not. High priority; small to remove or label.
3. **Dashboard "Market Movers" is wrong in two ways.** It prints "+-0.09%" (a doubled sign) for SENSEX and lists it under Top Gainers at a negative
   change, because it ranks only the six demo symbols (including crypto), not market movers. Small.
4. **Buy / Sell labels.** The desktop order panel on the Trade page and the option sheet say "Buy" and "Sell"; the checklist rule is "Paper buy"
   and "Paper sell" (the phone Trade bar already does). Small.
5. **Closed-market states are unexplained**: Movers shows 0.00 and "--" for change, the option sheet shows "--" for Open, High, Low and
   Previous close, and ATM IV shows "--". A one-line "Market closed, showing the last close" note would remove the confusion. Small.

## Summary

See the counts at the bottom of the chat reply. Missing items that need no outside data and are the quickest wins: 2.1, 4.6, 17.3, 20.1, 20.2,
19.4 (Nifty % from stored closes) and 21.5/21.7. The largest missing areas are Mutual Funds (AMFI data), Commodities (blocked on Task F),
MTF (a calculator only, no data needed) and the chart drawing tools (Task I).
