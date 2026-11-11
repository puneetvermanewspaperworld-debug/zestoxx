# Problems found, per route (before the fixes)

From `before/findings.json`. Counts are the same at 360, 390 and 414px unless noted; example elements are from the 360px run.

## landing

- 14 text elements under 4.5:1 contrast, e.g. `3.47:1 span.rounded-full.bg-emerald-50.px-2 "Market Open"`, `2.63:1 div.text-xs.text-slate-400 "Total Value"`

## dashboard

- 51 elements with text under 12px (11px×17, 10.5px×26, 11.5px×3, 10px×5); 101 under 14px.
- 18 of 18 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 28 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## watchlist

- 57 elements with text under 12px (11px×13, 10.5px×21, 11.5px×15, 9.5px×8); 98 under 14px.
- 18 of 34 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 27 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## trade

- 89 elements with text under 12px (11px×31, 10.5px×23, 11.5px×30, 10px×5); 130 under 14px.
- 37 of 37 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 4 form fields under 16px (phones zoom in on focus): `input.w-full.bg-transparent.text-[13px] 13px`, `select.rounded-md.border.border-slate-200 "Compare vs...TCSINFYHDFCBANKSBINTATAMOTO" 11px`
- 45 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## pulse

- 73 elements with text under 12px (11px×11, 10.5px×62); 107 under 14px.
- 15 of 15 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 70 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## markets

- 1 table(s) need sideways scrolling, so some columns (for example amounts) are off-screen until you scroll.
- 39 elements with text under 12px (11px×11, 10.5px×26, 11.5px×2); 139 under 14px.
- 17 of 17 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 35 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## movers

- 51 elements with text under 12px (11px×11, 10.5px×36, 9px×1, 11.5px×3); 139 under 14px.
- 21 of 21 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 55 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## options

- 1 table(s) need sideways scrolling, so some columns (for example amounts) are off-screen until you scroll.
- 248 elements with text under 12px (11px×11, 10.5px×20, 11.5px×209, 10px×6, 9px×2); 270 under 14px.
- 69 of 69 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 1 form fields under 16px (phones zoom in on focus): `select.rounded-md.border.border-slate-200 "23 Nov 202629 Dec 202625 Jan 2027" 11.5px`
- 113 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## buildup

- 124 elements with text under 12px (11px×17, 10.5px×59, 11.5px×5, 10px×32, 9px×2, 9.5px×8, 8.5px×1); 203 under 14px.
- 31 of 31 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 1 form fields under 16px (phones zoom in on focus): `select.rounded-lg.border.border-slate-200 "17 Nov 202623 Nov 202601 Dec 202608 Dec " 12px`
- 67 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## fiidii

- 1 table(s) need sideways scrolling, so some columns (for example amounts) are off-screen until you scroll.
- 60 elements with text under 12px (11px×14, 10.5px×21, 11.5px×5, 9px×20); 267 under 14px.
- 20 of 20 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 1 form fields under 16px (phones zoom in on focus): `select.rounded-md.border.border-slate-200 "DailyWeeklyMonthly" 11.5px`
- 160 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## fno

- **Page scrolls sideways by 66px.** `section.rounded-xl.border.border-slate-200 "How the position behavesMeasureYour posi" right=426`, `h2.font-display.text-[14px].font-semibold "How the position behaves" right=409`, `table.mt-2.w-full.text-[12.5px] "MeasureYour positionIn plain termsDelta3" right=409`
- 2 table(s) need sideways scrolling, so some columns (for example amounts) are off-screen until you scroll.
- Content cut off: `table.mt-2.w-full.text-[12.5px] "MeasureYour positionIn plain termsDelta3" right=409`, `table.w-full.min-w-[380px].border-collapse "Index moveTodayDay 1.5Day 3Day 4.5Expiry" right=409`
- 160 elements with text under 12px (11px×71, 10.5px×22, 10px×59, 11.5px×8); 562 under 14px.
- 65 of 67 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 19 form fields under 16px (phones zoom in on focus): `select.mt-0.5.w-full.rounded-md "NiftyBank NiftyFin NiftyMidcap SelectSen" 13px`, `select.mt-0.5.w-full.rounded-md "17 Nov 202623 Nov 202601 Dec 202608 Dec " 13px`
- 115 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## news

- 65 elements with text under 12px (11px×35, 10.5px×30); 94 under 14px.
- 15 of 15 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 42 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## alerts

- 28 elements with text under 12px (11px×14, 10.5px×14); 53 under 14px.
- 19 of 19 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 3 form fields under 16px (phones zoom in on focus): `select.mt-0.5.block.rounded-md "RELIANCETCSINFYHDFCBANKSBINTATAMOTORSNIF" 12.5px`, `select.mt-0.5.block.rounded-md "Price goes abovePrice goes below" 12.5px`
- 11 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## orders

- 25 elements with text under 12px (11px×11, 10.5px×14); 56 under 14px.
- 23 of 23 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 10 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

## portfolio

- 29 elements with text under 12px (11px×11, 10.5px×18); 52 under 14px.
- 15 of 15 tap targets under 44px, e.g. `a.flex.items-center.gap-2 "ZZESTOXX" 87x24`, `a.shrink-0.rounded.px-2 "Dashboard" 71x24`
- 16 text elements under 4.5:1 contrast, e.g. `2.36:1 span.flex.items-center.gap-0.5 "+0.83%"`, `3.59:1 span.flex.items-center.gap-0.5 "-0.13%"`
- Ticker strip is 38px tall (target 32px).

