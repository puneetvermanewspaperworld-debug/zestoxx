# Mutual Funds: data approach (for review before the pages are built)

Informational only. No purchase or SIP execution, no "Invest Now". Source: AMFI, the industry body, free and official.

## What was checked against the real files (13 Nov 2026)

| File | URL | Result |
|---|---|---|
| Today's NAV, every scheme | `https://www.amfiindia.com/spages/NAVAll.txt` (redirects to `portal.amfiindia.com`, so follow redirects) | 1.5 MB, 14,455 rows, semicolon separated. Header has Plan and Option columns ahead of NAV. |
| NAV history | `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?tp=1&frmdt=DD-Mon-YYYY&todt=DD-Mon-YYYY[&mf=<id>]` | Works for one day or a range, all fund houses. 0.9-1.1 MB per day, 3-13 s. Tested 1 and 5 years back. Without `tp=1` it returns an HTML form, not data. |

The two files have **different column orders** and different section-line spacing (`Open Ended Schemes(Equity ...)` vs
`Open Ended Schemes ( Equity ... )`), so the parser reads columns by header name only (`lib/mf/parse.ts`).

## What the parser does with the real files

- NAVAll.txt: 14,455 rows -> 14,200 read, 255 skipped (all "NAV 0.0000", reported with line numbers, never guessed).
- 8,716 are visible after hiding NAV dates older than 7 days and matured / wound-up schemes (5,626 rows are stale).
- Visible Growth-option Direct and Regular plans: 3,583 (1,791 Direct, 1,792 Regular). 95 categories, 55 fund houses.
- History file for two days: 16,970 points over 8,533 schemes.
- Categories carry two generations of SEBI names ("Equity Scheme - Large Cap Fund" and "Equity Schemes - Large Cap Fund",
  "Income/Debt Oriented Schemes" and "Debt Scheme"). The category grid will map both to one tile.

## Proposed storage (Postgres, two tables, as the spec says)

- `MfScheme`: code (key), name, ISIN, fund house, category, plan, option, kind, latest NAV and NAV date, `updatedAt`.
- `MfNav`: (scheme code, date, NAV), key = (code, date).
- Only **Growth-option Direct and Regular plans** are stored (about 3,600 schemes). IDCW plans are left out: their NAV falls on
  every payout, so a return worked out from it would be misleading.
- Rows: **daily for the last ~400 days, weekly (Friday, or the last NAV before it) for the 4-5 years before that**. About 2.3
  million rows, roughly 100-150 MB with the key index. Returns need only the NAV on or just before 1m, 6m, 1y, 3y and 5y ago, so
  weekly data is enough. If the database is small, storing Direct plans only halves this.

## Loading it

1. **One-time backfill**, run from your own computer into the database (not on Vercel, which has time limits): one single-day
   request per day wanted (about 400 daily + 230 weekly = 630 requests, 3-13 s each, a polite pause between them, about 1.5 h).
   Resumable; a day already stored is not fetched again.
2. **Nightly** (inside the existing daily cron, no third cron entry, which Hobby does not allow): fetch NAVAll.txt once, update
   the scheme table, and append each scheme's own NAV and NAV date. Because each row keeps its own date, a fund house that
   publishes late is simply stored the next night under its true date, so nothing is lost and nothing is duplicated.
3. Weekly rows older than 400 days are never touched again.

## Returns

1 month, 6 months, 1 year: absolute. 3 and 5 years: annualised (CAGR). Each uses the last stored NAV on or before the target
date; if the nearest stored NAV is more than 7 days before the target, that return is shown as "--", not estimated.
Nothing is shown for a period the scheme has not existed. No star ratings until a ratings source is chosen.

## Open choices for you

1. Database room: is about 100-150 MB for NAV history acceptable, or should it be Direct plans only?
2. The nightly job rides on the existing 19:30 / 21:00 IST cron runs. AMFI finishes publishing late in the evening, so some
   fund houses will land a day later (handled, see above). Moving one cron entry to about 23:30 IST would catch nearly all of
   them the same night; that is a `vercel.json` change I will not make without your say-so.
