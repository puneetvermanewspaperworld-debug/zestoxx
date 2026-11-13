# HDFC Securities parity checklist for Zestoxx

Source: 20 screenshots of the HDFC Securities app (screen 13 is only a screen-capture overlay, so it is skipped).
How to use: for each item mark Done, Partial or Missing, and give the Zestoxx route.
"Better" lines are places where Zestoxx should go beyond the reference.

Rules that apply to every screen:
- **Buy and Sell buttons are paper trades.** Label them "Paper buy" and "Paper sell". Zestoxx does not place real orders.
- **Do not build "Expert picks", "Trade ideas" or any entry, target and stop-loss recommendations** (screens 6, 11 and 20). Publishing specific recommendations can need SEBI Research Analyst registration. Replace them with data-driven scanners that state the rule they use.
- **Do not build account-level items** such as "Activate segment" (screen 7). Show a plain data-only note instead.
- **MTF and Mutual Funds stay informational** (screens 8 to 12 and 14 to 16).

---

## 1. Orders
- [ ] Tabs: Orderbook, Positions, Mutual Fund
- [ ] Orderbook sub-tabs: Open, Closed, GTD, Stock SIP (with counts, for example "Open (0)")
- [ ] Empty state "No Open Orders" with skeleton rows
- [ ] Row checkboxes for selecting several orders (bulk cancel)
- [ ] GTD (good till date) order type in the paper trading engine
- [ ] Stock SIP as a recurring paper order
- Better: show charges paid and net P&L on each closed order

## 2. Watchlist
- [ ] Heading with an Options toggle beside Watchlist
- [ ] Top cards for NIFTY 50 and NIFTY BANK: price, change, change %, and an "EXPIRY TODAY" tag
- [ ] Tabs: Explore, the user's own lists, and "+ Create Watchlist"
- [ ] Popular watchlists grid with tags (Trending, New): All ETF, Gold ETF, Silver ETF, FMCG Sector, Nifty ETF, ETF Picks, Top Gainers, Top Losers, 52 Week High, 52 Week Low, Defence Sector, Healthcare, Technology, Automobile, plus a seasonal list
- Better: each list shows the rule it uses (for example "within 2% of 52-week high")

## 3 and 18. Option contract sheet (call and put)
- [ ] Header: contract name (symbol, expiry, strike, CE or PE), LTP with direction arrow, change and change %, segment and open interest, a bookmark to add to a watchlist
- [ ] Links: Charts, Option Chain, Scrip Details
- [ ] Open, High, Low, Previous close
- [ ] Five-level market depth: quantity, buy price, sell price, quantity
- [ ] Buy quantity % against sell quantity % bar, with totals
- [ ] Paper Buy, Paper Sell and a more-options menu
- Better: show breakeven, charges, delta, theta per day and a what-if profit line for this contract (the analyzer already has the engine)

## 4. F&O Market Movers: Options
- [ ] Sub-tabs: Equity, Futures, Options
- [ ] Dropdown: Volume Based, Price Based
- [ ] Toggle: index options (OPTIDX) and stock options (OPTSTK)
- [ ] Tabs: Most Active Volume, Most Active Value
- [ ] Rows: contract, LTP with arrow, change and change %, segment and volume
- Better: tap a row to open the contract sheet with the what-if line

## 5. F&O Market Movers: Futures
- [ ] Price Based dropdown with Today's gainers and Today's losers
- [ ] Rows: contract and expiry, price, change and change %, volume

## 6. Commodities: option watchlist (build only after Task F says yes)
- [ ] Expiry selector (for example 17 Nov 2026) and a Call and Put toggle
- [ ] Strikes tagged ITM, ATM or OTM, with LTP and change; "View More"
- [ ] Do not build the "Today's Experts Picks" card

## 7. Commodities dashboard (after Task F)
- [ ] Top commodities with a LIVE tag: CRUDEOILM, NATGASMINI and others, each with expiry (and an "EXPIRY TODAY" tag), price and change
- [ ] Commodity chips: CRUDEOILM, NATGASMINI, GOLDM, SILVER and more
- [ ] Future watchlist: expiry selector, contract card with Charts, Scrip details and Option Chain links
- [ ] Option watchlist (as in 6)
- [ ] Do not build the "Activate segment" banner

## 8. MTF dashboard (informational)
- [ ] Explainer video row: the concept of MTF, MTF in bearish and bullish markets, cashless MTF (links or short written explainers)
- [ ] "Stocks in spotlight" with an MTF-eligible list and ETF list: stock, "x% funding available", price per share after funding against the strikethrough full price
- [ ] No Buy button on these rows. Use "See how MTF works"

## 9, 10, 11 and 12. MTF calculator and explainer (informational)
- [ ] Explainer card "What is Margin Trading Facility?" with a donut: 80% your investment and 20% funding (example)
- [ ] Calculator inputs: stock search with LTP, change % and funding %, expected price (with potential upside %), holding period in days, investment amount, Calculate
- [ ] Results side by side, With MTF and Without MTF: invested value, quantity, returns, gross profit, interest and charges
- [ ] Spec and worked example are in section D of zestoxx-build-plan.md
- Better: show net return after interest and charges, the breakeven price, the price fall that wipes out your capital, and a loss grid, not only the best case

## 14. Mutual Funds: categories (informational)
- [ ] Fund categories grid: Equity Funds, Equity Hybrid, Tax Saver, Large Cap, Mid Cap, Small Cap, Debt Funds, Money Market Funds, Index Funds, FoFs, Others
- [ ] Quick access: My Orders, NFO, Top Picks (build as a returns-ranked list with the rule shown, not as a recommendation)
- [ ] Skip the "Recommendations of" banner

## 15. Mutual Funds: spotlight and baskets
- [ ] Fund card with 3-year CAGR (from AMFI NAV history). Skip star ratings until a source is chosen.
- [ ] "Baskets" as sample category mixes without named funds, with a blended 3-year return where it can be worked out
- [ ] No "Invest Now" button

## 16. Mutual Funds: get started
- [ ] Monthly SIP and One time toggle
- [ ] Amount slider (₹100 to ₹10,00,000)
- [ ] "View investment plans" as an informational projection
- Better: show the projection with a range, not a single number, and a note that returns are not guaranteed

## 17. F&O dashboard
- [ ] Second-highest call strike and second-highest put strike, each with open interest and change %
- [ ] ATM IV, PCR and India VIX row
- [ ] Paper Sell Call and Paper Sell Put buttons with a buy and sell toggle
- [ ] Trade With Heatmap: tabs for NIFTY, BANK NIFTY, FINNIFTY, MIDCPNIFTY; expiry selector; a "How to read buildups" link; a stacked bar for Long Buildup, Long Unwinding, Short Covering and Short Buildup percentages
- [ ] Market Movers section below

## 19. FII/DII activity page
- [ ] Toggle: FII and DII
- [ ] Toggle: Cash Market and Derivatives
- [ ] Period dropdown: Daily, Weekly, Monthly
- [ ] Table: Date, Nifty with % change that day, Amount in crore
- Better: add a line chart of FII net against the Nifty

## 20. F&O dashboard: bottom half
- [ ] Futures top gainers as a bar list (for example "CIPLA OCT FUT 0.36%") with "View more"
- [ ] FII/DII summary card: FII net with arrow, DII net with arrow, FII index futures long % against short %, "View All"
- [ ] "Learn how to trade in options": short educational cards or videos
- [ ] Do not build the "Daily Pulse" expert video promo as a recommendation feed

## Navigation pattern used throughout
- [ ] On phones: a bottom tab bar (Dashboard, Watchlist, Portfolio, Orders, Research) and a top row of segment chips (Equity, F&O, Mutual Funds, MTF, Commodities)
- [ ] Bottom sheets for contract and order screens

## 21. Chart tools (TradingView phone chart, one more reference)
- [ ] Left tool rail: freehand brush, text, shapes and measure tools, forecast or risk-reward tool, ruler, zoom, magnet, stay in drawing mode, lock all drawings
- [ ] Floating quick-tool bar: trendline, horizontal line, parallel channel
- [ ] Horizontal levels with a coloured price tag on the right axis
- [ ] Rectangle range box with a translucent fill, border and dashed midline
- [ ] Dotted last-price line with an axis tag coloured by candle direction
- [ ] Freehand annotation (brush), text note
- [ ] "Reset view" button that jumps to the latest candle
- [ ] Volume bars under the candles
- [ ] Select, drag and resize drawings; colour and line style; lock, clone, delete; undo and redo
- Better: the measure tool shows points, %, candles, and the approximate ₹ per lot of a future; tapping a level creates a price alert
- Do not copy TradingView's branding, icons or code. If a TradingView library is used, follow its licence, including attribution.
