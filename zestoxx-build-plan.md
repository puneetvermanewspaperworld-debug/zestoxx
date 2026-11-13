# Zestoxx build plan: phone fix, automatic PE, parity audit, MTF, Mutual Funds, Commodities, extras

Send these to Claude Code one at a time, in this order. Each prompt ends with
"show me before pushing", so nothing goes live until you say "push".
Do not combine tasks in one message.

| Order | Task | Why this order |
|---|---|---|
| A | Phone layout fix, plus the faults seen in your phone screenshots (A addendum) | You use the site on a phone and it looks wrong there |
| A3 | Data fixes seen on the F&O page: expired expiry, stale spot | The analyzer shows 0 days to expiry and a spot that may be stale |
| A4 | Analyzer display fixes from your 11 Nov phone screenshots (best case, two spot prices, stuck exit, moving numbers, call and put mix-up) | The maths is right, but these make the page look wrong |
| H | Real FII/DII data | The FII/DII page currently shows illustrative sample numbers |
| I | Chart drawing tools, phone first (from your TradingView screenshot) | Builds on the touch fixes from Task A |
| B | Automatic index PE | Removes the last typed market input |
| C | Parity audit against the 20 HDFC screens | Shows exactly what is done and what is missing |
| D | MTF calculator | No outside data needed |
| E | Mutual Funds | Uses AMFI's free official NAV file |
| F | Commodities feasibility check | Do not build until the data is confirmed |
| G | Extras I recommend | Listed with priorities |

To see the phone view on your computer: in Chrome press F12, click the phone and tablet icon at the top left of the panel, and choose iPhone 12 Pro.

---

## What updates by itself

| Item | Automatic? | Source |
|---|---|---|
| Spot, India VIX, VIX previous close | Yes, every 5 seconds in market hours | Upstox |
| Lot size, expiry list, days to expiry | Yes | Upstox instruments and option chain |
| Strike list, strike gap | Yes | Upstox option chain |
| Each strike's price, bid, ask, open interest, IV, Greeks, PCR | Yes | Upstox option chain |
| VIX percentile | Yes, daily | Computed from a year of VIX closes |
| FII/DII flows | Not yet. The page currently shows illustrative sample data | Becomes real after Task H (NSE cash provisional figures and participant-wise open interest) |
| Index PE, P/B, dividend yield | Yes after Task B, daily after close, with a live estimate during the day | NSE index closing file |
| Brokerage per order, tax slab, 10-year bond yield | No, these are your settings | You type them |
| Margin for short positions | No | Your broker's margin calculator |

Typing over any automatic field switches the badge to Manual, and the field stays editable.

---

## Task A: Phone layout

```
Task: make every page work properly on phones. Desktop already looks good, so do not change the desktop layout.

1. Add Playwright as a dev dependency only. Write a script that opens every route in the app at 360x800, 390x844 and 414x896 and saves full-page screenshots to docs/mobile-audit/before/.
2. For each screenshot list the problems: horizontal page scroll, text under 14px, tap targets under 44px, tables or charts that overflow or get cut off, overlapping fixed bars, buttons that are hidden or unreachable, inputs under 16px (they make phones zoom in on focus).
3. Fix them with responsive CSS, only below 768px:
   - a bottom tab bar with the five main sections (Dashboard, Watchlist, Portfolio, Orders, Research or the nearest equivalents we have), respecting the safe area at the bottom of the screen
   - tables either scroll sideways with a sticky first column or become stacked cards
   - cards one per row; charts full width and 240 to 280px high
   - the option contract view and the order ticket as a bottom sheet
   - a sticky action bar for the main buttons
   - inputs at 16px or larger
4. Re-run the screenshots into docs/mobile-audit/after/ and give me a before and after list for each route.
5. Add a test that fails if any route scrolls horizontally at 360px.
6. Run npm test and a clean npm run build. Push to a new branch called mobile-fixes, not main, so Vercel gives me a preview link to open on my phone. Do not merge to main until I say.
```

Before you test the preview link: in Vercel open Settings, then Environment Variables, edit `UPSTOX_ANALYTICS_TOKEN`, and also tick **Preview**. Otherwise preview links show Simulated data.

### Task A addendum: faults seen on a real phone

Paste this straight after the Task A prompt, in the same message.

```
Known problems seen on a real phone (Android Chrome, about 360px wide). Fix these in the same pass:
1. Top navigation: the tab row is clipped on both sides ("Movers" and "FII/DII" are cut off) and the active tab is not kept in view. On phones replace it with a bottom tab bar (Dashboard, Watchlist, Trade, Pulse, More) and put every other page under "More". Keep the current bar on desktop.
2. Tables run past the card edge: on /app/fiidii the "Net Amount" column is cut off. Make tables fit at 360px with fewer columns, smaller padding, wrapped labels, or each row stacked as a card. The amount must always be fully visible.
3. FII/DII chart: bars show size only, all in one colour. Draw buying above a zero line in green and selling below it in red, with rupee labels in crore, and make the date range match the table (the chart showed 13 to 23 Oct while the table started at 9 Nov).
4. Numbers use a wide-spaced monospace font that looks inconsistent. Use Inter with tabular figures and normal spacing. Write amounts as +₹3,401 Cr and −₹475 Cr, with the sign before the rupee sign.
5. Help text under inputs ("from the feed") is pale grey on white. Darken it to at least 4.5:1 contrast.
6. The ticker strip is cut off at both ends and takes vertical space. Keep it one line, about 32px high on phones.
7. On /app/fno the "How the position behaves" table and the profit grid run past the card edge (the "In plain terms" text and the "Expiry" column are cut off). Make them fit at 360px.
8. The strike comparison table has a first column that wraps to four lines, so only two strikes are visible at a time. On phones use short row labels, narrower strike columns, and a sticky first column, so at least three strikes are visible.
9. Chart axis labels are about 10px. Make them at least 12px on phones.
```

---

## Task A3: Data fixes seen on the F&O page

```
Fix these data problems seen on /app/fno at 9:15 pm on Monday 9 Nov:
1. The expiry dropdown defaulted to 09 Nov 2026, which had already expired at 15:30 that day, so days to expiry showed 0. The default must be the first expiry whose 15:30 IST is after the feed's last update time (here that is Tue 17 Nov, because Tue 10 Nov is a holiday). Hide expired expiries from the list, and show a note when the nearest expiry is today.
2. Spot read 25030.35, which is the same figure to the paisa as the Friday close we saw earlier, while the page said the exchange's last update was Mon 9 Nov 4:00 pm and VIX had moved. Compare the option chain's underlying spot price with the Nifty 50 index quote's last price and last trade time, and tell me which is fresher. If the chain's spot can be stale, use the index quote for spot. Show me both raw values.
3. Rename "Interest rate (%)" to "Risk-free rate (%)" and add a one-line help text to it and to "Dividend yield (%)".
Run npm test and a clean npm run build. Show me before pushing.
```

---

## Task A4: Analyzer display fixes

Seen on a real phone on Wed 11 Nov at 1:50 pm with a long Nifty 25,200 put. The maths checks out against an independent calculation (breakeven 24,960.9, delta -31.9, vega about 843, expected moves 232 a day and 572 to expiry). These are display problems.

```
Fix these problems in the F&O analyzer, seen on a real phone on Wed 11 Nov at 1:50 pm with a long Nifty 25,200 put:

1. Best case. It shows ₹16,19,258, which only happens if Nifty falls to zero. For trades whose profit is open-ended on one side, replace the single number with "Grows about ₹X for every 100 points" and show the best case inside the expected range (the range that covers about 2 days in 3) and at 3 standard deviations. Keep the theoretical maximum only in a small "Theoretical maximum (index at 0)" line. Do the same for "Unlimited loss".
2. Two different Nifty prices on one screen: 25,184.00 in the analyzer and 25,180.55 in the ticker. Use the index quote's last price as the one spot everywhere. Show the option chain's own underlying price only as a small cross-check. Tell me which of the two matched the Upstox index quote.
3. The exit marker was stuck at the far right (Nifty 26,555, +5.44%, 0 days held), so "What you keep" and "At your exit" described an extreme scenario I did not choose. Default the exit to the current spot. On the chart, a vertical swipe must scroll the page; only a tap or a deliberate horizontal drag may move the exit marker. Show the chosen exit scenario in one line at the top of "What you keep" and keep "Reset exit" visible.
4. The numbers move under me: the same exit showed -₹15,403 in one card and -₹15,139 in another, and theta ₹1,178 against ₹1,154, because entry prices follow the live feed every 5 seconds. When a leg is added from the chain, freeze its entry price and the spot, show "Priced at 1:50:12 pm", and add an "Update to live prices" button. The page may keep polling in the background but must not change the analysis until I press it.
5. The strike comparison showed Calls while my trade was a Put. Start it on the same side as my trade and show a one-line label "Comparing puts" or "Comparing calls".

Run npm test and a clean npm run build. Show me before pushing.
```

---

## Task H: Real FII/DII data

```
Replace the illustrative FII/DII data with real NSE data.

Sources:
(a) FII and DII cash market figures. NSE publishes them provisionally around 5 pm IST.
(b) NSE's participant-wise open interest file, fao_participant_oi_DDMMYYYY.csv, published after the close (around 7 pm IST). It gives FII index futures long and short, for the long against short bar.

First test from a Vercel function whether both can be fetched with normal request headers. NSE sometimes blocks cloud addresses or needs session cookies. If either is blocked, tell me and stop. Do not work around it in a way that breaks NSE's website terms.

If they work:
1. A Vercel Cron job on weekdays after 7:30 pm IST stores daily rows in Postgres: date, FII buy, sell and net, DII buy, sell and net, FII index futures long and short, and a provisional flag. Backfill as far as the source allows.
2. The page shows the real numbers with the data date and the word "provisional", a diverging bar chart (buying above zero, selling below), Daily, Weekly and Monthly roll-ups, and FII index futures long % against short %.
3. Remove the "illustrative" banner only when real data is showing. If data is missing, show "Data not available yet". Never show invented numbers.

Tests: parsing, roll-ups, and a missing day. Run npm test and a clean npm run build. Show me before pushing.
```

Before a public launch, check NSE's data terms or use an authorised data vendor.

---

## Task I: Chart drawing tools, phone first

Reference: a TradingView phone chart with a tool rail on the left, a floating quick-tool bar, horizontal levels with price tags on the right axis, a shaded range box with a dashed midline, a dotted last-price line with its tag, a freehand circle, and a "reset view" button. The app's chart already has a trendline tool and indicators, so extend it; do not rebuild it.

```
Extend the price chart with drawing tools that work well on a phone. First tell me which chart library the app uses now, and recommend whether to extend it or switch to TradingView's open-source Lightweight Charts (its licence asks for visible attribution) or a custom canvas layer. Do not copy TradingView's branding, icons or code. Wait for my answer before building.

Then build, in this order:
1. Tools: horizontal level (with a coloured price tag on the right axis, editable price and colour), trendline, ray, rectangle range box (translucent fill, border, optional dashed midline, and a label showing height in points and %), parallel channel, text note. Phase 2: freehand brush and Fibonacci retracement.
2. Measure tool: drag between two points to show points, %, number of candles and time. For index symbols also show the approximate ₹ per lot of a future (points x lot size, from the lot size in the feed).
3. Controls: select, drag, resize handles with at least 44px touch targets; colour, line style and width; lock, clone, delete; undo and redo; hide all, lock all, delete all; "stay in drawing mode"; magnet that snaps to candle open, high, low and close.
4. Store drawings by (time, price), never by pixels, so they stay correct when zoomed, resized or when the timeframe changes. Save per symbol in Postgres with a debounced autosave.
5. A dotted last-price line with an axis tag coloured by candle direction. A "reset view" button that jumps to the latest candle and re-scales. Long-press shows a crosshair with an open, high, low, close readout.
6. One-tap alert: tap a horizontal level and choose "Alert when price crosses", using the existing price alerts.
7. Phone behaviour: a collapsible tool rail on the left and a floating quick-tool bar. Two-point tools are placed by tap, tap. A two-finger pinch and pan never draws. The page must not scroll while a tool is active.
8. Tests: price and time to pixel mapping both ways, snapping, hit-testing, save and reload round trip, undo and redo. Add a 390px Playwright screenshot showing at least three drawings.

Run npm test and a clean npm run build. Push to a branch called chart-tools, not main, and show me the preview link before anything is merged.
```

---

## Task B: Automatic index PE

```
Make the index PE automatic.

Source: NSE's daily index closing file. It lists P/E, P/B and dividend yield for every index and is published after market close. Find the exact file URL and confirm it can be fetched from a Vercel serverless function with normal request headers. If it cannot, tell me and stop.

Build:
1. A Vercel Cron job that runs on weekdays after 6 pm IST and stores PE, PB and dividend yield per index in Postgres (a new Prisma model, one row per index per date, upsert by index and date). Backfill about a year if the source allows.
2. /api/fno/snapshot returns indexPE: { value, asOfDate, source: "NSE close", livePE }, where livePE = closePE x (live spot / last close of the index).
3. In the analyzer, replace the typed PE with this value, labelled "NSE close, estimated live". Take the long-run PE from the median of the stored history. Keep the 10-year bond yield as an editable input.
4. If the data is missing or older than 3 trading days, show Manual and keep the input editable.
5. Tests: the file parser handles header and spacing quirks, the livePE maths, and stale data.

Run npm test and a clean npm run build. Show me before pushing.
```

---

## Task C: Parity audit

Save `zestoxx-hdfc-parity-checklist.md` in the project folder first.

```
Read zestoxx-hdfc-parity-checklist.md. For every numbered screen and item, open the matching page in the running app and mark it Done, Partial or Missing, with the route and a one-line note. Save a desktop and a 390px phone screenshot of each Done or Partial item to docs/parity/. Do not build anything yet.

At the end give me one table: item, status, route, what is missing, and size (small, medium, large). Also flag anything the checklist says not to build that already exists in the app.
```

---

## Task D: MTF calculator (informational only)

```
Build the MTF calculator page exactly as specified in section D of zestoxx-build-plan.md. It is informational only: no orders, no funding. Add tests for the formulas using the worked example in the spec. Run npm test and a clean npm run build. Show me before pushing.
```

### Spec for D

**Inputs**
- Stock: search over live quotes. Price fills automatically from the live price.
- Expected exit price, holding days, own investment amount.
- Funding % (default 50). Label: "Illustrative. Your broker sets this for each stock."
- MTF interest % per year (default 15). Label: "Check your broker's rate."
- Delivery charges, editable: brokerage per order, STT 0.1% on buy and sell, stamp duty 0.015% on buy, NSE transaction charge 0.00307%, SEBI fee ₹10 per crore, GST 18% on brokerage, transaction charge and SEBI fee, and a DP charge per sell (default ₹20).
- Broker forced-sale level: the equity percentage of the position at which a broker may sell (default 20%, editable, label "check your broker").

**Formulas**
- Quantity with MTF = floor(own amount / (price x (1 - funding%))).
- Quantity without MTF = floor(own amount / price).
- Leverage = 1 / (1 - funding%).
- Own capital used (MTF) = quantity x price x (1 - funding%).
- Funded amount = quantity x price x funding%.
- Interest = funded amount x rate x days / 365. Interest runs every calendar day, including holidays.
- Gross profit = quantity x (exit price - price).
- Net profit = gross profit - interest - charges.
- Return on own capital = net profit / own capital used. Show net, not only gross.
- Breakeven exit price = price + (interest + charges) / quantity.
- Price fall that wipes out own capital = 1 - (own capital / position value) = funding%.
- Price at which a forced sale may trigger = funded amount / (quantity x (1 - forced-sale level)).

**Worked example for the tests** (price 839, exit 892, own ₹1,00,000, funding 60%, 10 days, interest 15%):
quantity with MTF 297, without MTF 119; leverage 2.5x; gross profit 15,741 with MTF and 6,307 without; funded amount about 1,49,510; interest about ₹614; wipe-out fall 40%; forced-sale price about 629 (a 25% fall) at a 20% level.

**Show side by side:** With MTF and Without MTF: position value, quantity, gross profit, interest, charges, net profit, net return on own capital, breakeven price.

**Also show, which the HDFC screen does not:** a small grid of net profit for exit prices of -20%, -10%, -5%, 0, +5%, +10% and +20%, for both choices, so losses are as visible as gains.

**Wording and limits:** the button says "See how MTF works", never "Buy with MTF". Add this text: "MTF magnifies losses as well as gains. Interest accrues daily. Shares are pledged to your broker. Eligible stocks and funding vary by broker. This is a calculator, not an offer."

---

## Task E: Mutual Funds (informational only)

```
Build the Mutual Funds section as specified in section E of zestoxx-build-plan.md. Informational only: no purchase or SIP execution. Show me the data approach and a test of the parser before you build the pages. Run npm test and a clean npm run build. Show me before pushing.
```

### Spec for E

**Data: AMFI's official daily NAV file**, `https://www.amfiindia.com/spages/NAVAll.txt`. It is free and refreshed each evening.
- Parse by header names, never by column position. AMFI has inserted columns before (Plan and Option were added ahead of NAV).
- Fund categories come from the section header lines in the file, such as "Open Ended Schemes(Debt Scheme - Banking and PSU Fund)".
- Each row carries that scheme's own last NAV date. Hide schemes whose NAV date is stale (older than 7 days) or matured.
- NAV history for returns: AMFI's historical NAV report (a date range per scheme). Store in Postgres: one table of schemes, one table of daily NAVs (scheme code, date, NAV). Refresh nightly with a cron job.
- Returns from NAV history: 1 month, 6 months, 1 year, and 3 and 5 year annualised.
- No star ratings until a ratings source is chosen.

**Pages**
- Category grid: Equity Funds, Equity Hybrid, Tax Saver, Large Cap, Mid Cap, Small Cap, Debt Funds, Money Market Funds, Index Funds, FoFs, Others.
- Category list sortable by return, with direct and regular plans filterable.
- Scheme page: NAV chart, returns table, and an SIP and lump-sum calculator (monthly or one time, amount slider from ₹100 to ₹10,00,000).
- "Sample mixes" instead of named-fund baskets: for example "Aiming for ₹5 lakh in 5 years" shown as a category mix (such as large cap, flexi cap, hybrid), without naming specific funds.

**Limits:** no "Invest Now" button. Show "Mutual fund investments are subject to market risks. Past performance does not guarantee future returns. Zestoxx does not distribute or recommend funds."

---

## Task F: Commodities feasibility

```
Does our Upstox token return a live MCX quote, for example CRUDEOILM? Reply yes or no, and show me the raw status and the field names of one response. Do not build anything.
```

If the answer is yes, build the Commodities section from items 6 and 7 of the parity checklist. If it is no, come back to me with what Upstox says, and we will choose between a plan upgrade and a second data source.

---

## Task G: Extras I recommend, in this priority

1. **Expiry and holiday calendar.** One page showing each underlying's next expiry (including shifts like Monday 9 Nov this week), exchange holidays and special sessions. It reuses the holiday list from the market-hours fix.
2. **Trade journal and analytics for paper trades.** Notes and tags on each trade, win rate, average win and loss, expectancy, maximum drawdown, profit by strategy, charges paid, CSV export. This is what turns a paper-trading tool into a habit.
3. **Alerts beyond price.** VIX level, PCR change, sudden open-interest jumps, and an expiry-day reminder, delivered as browser push once the site is installable on the phone.
4. **Installable on the phone (PWA).** An app icon on the home screen, fast start, and the push alerts above.
5. **Accounts and legal pages before any public launch.** The app is single-user today. Add sign-in and per-user data (watchlists, journal, alerts), plus Terms, Privacy Policy, a risk disclosure and a clear "not a broker or adviser" statement. Also review the Pulse signal scores: present them as educational indicators, not buy or sell calls, because publishing specific recommendations can fall under SEBI's Research Analyst rules.
6. **Implied move and IV rank cards.** The expected move to expiry from the at-the-money straddle, and where today's VIX sits against its past year.

Send each one separately, in this order, with: "Build item N from section G. Show me before pushing."
