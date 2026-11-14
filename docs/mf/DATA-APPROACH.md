# Mutual Funds: data approach, decisions and runbook

Informational only. No purchase, no SIP set-up, no "Invest Now". Pages are labelled **Direct plans, Growth option**.

## READ FIRST: AMFI's terms of use

What AMFI's own pages say (read directly on 14 Nov 2026; quotes are short, from https://www.amfiindia.com/terms-of-use):

- Use of the site is "for your personal and non-commercial use only".
- "You shall not store electronically any significant portion" of it, and may not "publicly display, transmit, publish" it or "create derivative works".
- "No other use of the Site is authorised unless you and we have agreed otherwise in writing."
- Pages carry "© 2025 AMFI. All Rights Reserved". Using the AMFI logo needs written permission (Zestoxx shows none).
- Timeliness and accuracy are disclaimed, and AMFI may end access at any time.
- Not addressed on any AMFI page I read: scraping or rate limits (the only limit is "a maximum period of 90 days at a time" on the
  historical NAV download form; this project asks for one day at a time), and any NAV-specific licence.
- **Unconfirmed:** the terms speak of "this web site" and do not name `portal.amfiindia.com`, where `NAVAll.txt` and the history report are
  served. Whether they cover those files is not settled by the text.

Read plainly, storing years of NAVs in our database and showing them on a public site goes beyond "personal and non-commercial use" and
needs AMFI's written agreement. This is not legal advice. **The code is built and ready, but nothing stores AMFI data until you decide:**
the nightly job runs only when `MF_INGEST_ENABLED=true`, the backfill is a script you run yourself, and the pages say "Data not
available yet" until data exists. Suggested next step: write to AMFI through https://www.amfiindia.com/contact asking for permission to
store and display daily NAVs of Direct Growth schemes with attribution, and keep their answer.

## What was checked against the real files (13-14 Nov 2026)

| File | URL | Result |
|---|---|---|
| Today's NAV, every scheme | `https://www.amfiindia.com/spages/NAVAll.txt` (redirects to `portal.amfiindia.com`) | 1.5 MB, 14,455 rows, semicolon separated. |
| NAV history | `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?tp=1&frmdt=DD-Mon-YYYY&todt=DD-Mon-YYYY` | One day, all fund houses, 0.9-1.1 MB, 3-13 s. Tested 1 and 5 years back. Without `tp=1` it returns an HTML form. |

The two layouts differ in column order and section-line spacing, so `lib/mf/parse.ts` reads columns by header name only.

## Coverage (decision 1): Direct plans, Growth option, open ended

On 14 Nov 2026 AMFI's file had **1,763** such schemes that are fresh (NAV within 7 days) and not matured. Regular plans, IDCW (dividend)
options, closed-ended and interval funds are not stored.

## Storage and headroom (decision 3)

Two tables (`MfScheme`, `MfNav`), created by migration `20261114000000_mutual_funds` (it creates only those two tables and one index).

Dry run against AMFI (nothing written), 14 Nov 2026: 500 days to fetch (285 daily over the last 400 days, 215 weekly Fridays before
that, back to Sep 2021). Counted samples: 1,746 rows on a recent day, 1,575 a year ago, 839 for the oldest week. **Expected about
693,000 NAV rows (419,000 to 873,000), about 53 MB** (32 to 67 MB) at an estimated 80 bytes a row, and about 35 MB a year after that
(about 1,763 rows a night; old daily rows are not pruned yet).

**Your database plan's limit and current usage could not be read from here**: I have no access to your database or provider account.
Run the check yourself (below); it prints the database size, the largest tables and the headroom against the limit you give it.
For reference, Neon's own documentation lists 1 GB of storage per project on its Free plan (raised from 0.5 GB on 2 Oct 2026); if your
database is on Neon's free plan, 53 MB is about 5% of 1 GB, or about 10% of the old 0.5 GB. Whether your database is Neon is
unconfirmed.

## Runbook (nothing here runs by itself)

Set the URL **in your own terminal session only** (never in a file or the repo). Use the direct, non-pooled connection string.

```powershell
$env:MF_DATABASE_URL = "<your direct database URL>"      # set by you; the script never prints or stores it
$env:DB_LIMIT_MB = "1024"                                 # your plan's storage limit in MB
npx tsx --tsconfig tsconfig.json scripts/mf-backfill.ts            # 1. dry run (default): counts rows, writes nothing
npx tsx --tsconfig tsconfig.json scripts/mf-backfill.ts --check    # 2. database size now, what the tables would add, headroom
npx tsx --tsconfig tsconfig.json scripts/mf-backfill.ts --write    # 3. the backfill (resumable, about an hour)
```

`--write` refuses to run without `DB_LIMIT_MB` (or `--i-checked-storage`). Production must also have the migration applied: it is
applied automatically by the next production deploy (vercel.json runs `prisma migrate deploy` only for production).
When you are ready for nightly updates, set `MF_INGEST_ENABLED=true` in Vercel.

## Nightly job and cron (decision 2)

`vercel.json` still has exactly two cron entries, both for `/api/cron/daily`, Monday to Friday: **14:00 UTC (19:30 IST)** and
**18:00 UTC (23:30 IST)** (was 15:30 UTC / 21:00 IST). Both IST times fall on the same calendar day as the UTC run, so the
FII/DII and index P/E passes still aim at the same trading day (tested for 14:00, 15:30 and 18:00 UTC, a Monday, and a holiday). The
later run only changes what is out by then (more of the evening's NAVs, the FII/DII open-interest file).

The mutual fund step fetches NAVAll.txt once, stores the tracked schemes' details and that day's NAV row, and refreshes returns. Each
scheme keeps its own NAV date, so a fund house that publishes late is stored the next night under its true date. NAVAll.txt shows only the
newest NAV, so a day the cron misses (an outage, a Saturday publication) is not recovered by the nightly job; the backfill script fills
such gaps when re-run.

## Returns

1 month, 6 months and 1 year are plain percentage changes; 3 and 5 years are annualised. Each uses the last stored NAV on or before the
date that far back, only if it is within 7 days of that date; otherwise "--". Nothing is estimated and a fund younger than the period
shows "--". No star ratings.

## Pages (section E)

`/app/funds` category grid (the eleven tiles) and sample mixes; `/app/funds/category/<tile>` list sortable by return with search;
`/app/funds/<AMFI code>` NAV chart, returns table, SIP and lump-sum calculator (₹100 to ₹10,00,000). Regular and Direct filtering does
not apply while only Direct plans are stored. Sample mixes name categories only; their figures are the median past 3-year returns of
the stored schemes in each category.
