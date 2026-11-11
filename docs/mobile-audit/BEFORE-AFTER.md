# Mobile audit: before and after

Measured in Chrome with a phone user agent. Each cell is "before → after". Screenshots: `before/` and `after/` (route-width.jpg, full page, JPEG to keep the repo small).

Columns: **page scroll** = how many px wider than the screen the page is; **cut off** = content clipped by an overflow-hidden box or a table sticking out of the page; **side-scroll tables** = tables that need sideways scrolling inside their own box (allowed when the first column stays pinned); **text <12px** = elements with text under 12px; **targets <44px** = interactive elements smaller than 44px (a 44px invisible hit area counts as ok); **inputs <16px** = fields that make phones zoom on focus; **low contrast** = text under 4.5:1; **ticker** = ticker strip height.

## 360px wide

| route | page scroll | cut off | side-scroll tables | text <12px | targets <44px | inputs <16px | low contrast | ticker |
|---|---|---|---|---|---|---|---|---|
| landing | 0 | 0 | 0 | 0 | 0 | 0 | 14 → 0 | - |
| dashboard | 0 | 0 | 0 | 51 → 0 | 18 → 0 | 0 | 28 → 0 | 38 → 32 |
| watchlist | 0 | 0 | 0 | 57 → 0 | 18 → 0 | 0 | 27 → 0 | 38 → 32 |
| trade | 0 | 0 | 0 | 89 → 0 | 37 → 0 | 4 → 0 | 45 → 0 | 38 → 32 |
| pulse | 0 | 0 | 0 | 73 → 0 | 15 → 0 | 0 | 70 → 0 | 38 → 32 |
| markets | 0 | 0 | 1 → 0 | 39 → 0 | 17 → 0 | 0 | 35 → 0 | 38 → 32 |
| movers | 0 | 0 | 0 | 51 → 0 | 21 → 0 | 0 | 55 → 0 | 38 → 32 |
| options | 0 | 0 | 1 | 248 → 0 | 69 → 0 | 1 → 0 | 113 → 0 | 38 → 32 |
| buildup | 0 | 0 | 0 | 124 → 0 | 31 → 0 | 1 → 0 | 67 → 0 | 38 → 32 |
| fiidii | 0 | 0 | 1 → 0 | 60 → 0 | 20 → 0 | 1 → 0 | 160 → 0 | 38 → 32 |
| fno | 66 → 0 | 2 → 0 | 2 | 160 → 0 | 65 → 0 | 19 → 0 | 115 → 0 | 38 → 32 |
| news | 0 | 0 | 0 | 65 → 0 | 15 → 0 | 0 | 42 → 0 | 38 → 32 |
| alerts | 0 | 0 | 0 | 28 → 0 | 19 → 0 | 3 → 0 | 11 → 0 | 38 → 32 |
| orders | 0 | 0 | 0 | 25 → 0 | 23 → 0 | 0 | 10 → 0 | 38 → 32 |
| portfolio | 0 | 0 | 0 | 29 → 0 | 15 → 0 | 0 | 16 → 0 | 38 → 32 |

## 390px wide

| route | page scroll | cut off | side-scroll tables | text <12px | targets <44px | inputs <16px | low contrast | ticker |
|---|---|---|---|---|---|---|---|---|
| landing | 0 | 0 | 0 | 0 | 0 | 0 | 14 → 0 | - |
| dashboard | 0 | 0 | 0 | 51 → 0 | 18 → 0 | 0 | 28 → 0 | 38 → 32 |
| watchlist | 0 | 0 | 0 | 57 → 0 | 18 → 0 | 0 | 27 → 0 | 38 → 32 |
| trade | 0 | 0 | 0 | 89 → 0 | 37 → 0 | 4 → 0 | 45 → 0 | 38 → 32 |
| pulse | 0 | 0 | 0 | 73 → 0 | 15 → 0 | 0 | 70 → 0 | 38 → 32 |
| markets | 0 | 0 | 1 → 0 | 39 → 0 | 17 → 0 | 0 | 35 → 0 | 38 → 32 |
| movers | 0 | 0 | 0 | 51 → 0 | 21 → 0 | 0 | 55 → 0 | 38 → 32 |
| options | 0 | 0 | 1 | 248 → 0 | 69 → 0 | 1 → 0 | 113 → 0 | 38 → 32 |
| buildup | 0 | 0 | 0 | 124 → 0 | 31 → 0 | 1 → 0 | 67 → 0 | 38 → 32 |
| fiidii | 0 | 0 | 1 → 0 | 60 → 0 | 20 → 0 | 1 → 0 | 160 → 0 | 38 → 32 |
| fno | 36 → 0 | 2 → 0 | 2 | 160 → 0 | 65 → 0 | 19 → 0 | 115 → 0 | 38 → 32 |
| news | 0 | 0 | 0 | 65 → 0 | 15 → 0 | 0 | 42 → 0 | 38 → 32 |
| alerts | 0 | 0 | 0 | 28 → 0 | 19 → 0 | 3 → 0 | 11 → 0 | 38 → 32 |
| orders | 0 | 0 | 0 | 25 → 0 | 23 → 0 | 0 | 10 → 0 | 38 → 32 |
| portfolio | 0 | 0 | 0 | 29 → 0 | 15 → 0 | 0 | 16 → 0 | 38 → 32 |

## 414px wide

| route | page scroll | cut off | side-scroll tables | text <12px | targets <44px | inputs <16px | low contrast | ticker |
|---|---|---|---|---|---|---|---|---|
| landing | 0 | 0 | 0 | 0 | 0 | 0 | 14 → 0 | - |
| dashboard | 0 | 0 | 0 | 51 → 0 | 18 → 0 | 0 | 28 → 0 | 38 → 32 |
| watchlist | 0 | 0 | 0 | 57 → 0 | 18 → 0 | 0 | 27 → 0 | 38 → 32 |
| trade | 0 | 0 | 0 | 89 → 0 | 37 → 0 | 4 → 0 | 45 → 0 | 38 → 32 |
| pulse | 0 | 0 | 0 | 73 → 0 | 15 → 0 | 0 | 70 → 0 | 38 → 32 |
| markets | 0 | 0 | 1 → 0 | 39 → 0 | 17 → 0 | 0 | 35 → 0 | 38 → 32 |
| movers | 0 | 0 | 0 | 51 → 0 | 21 → 0 | 0 | 55 → 0 | 38 → 32 |
| options | 0 | 0 | 1 | 248 → 0 | 69 → 0 | 1 → 0 | 113 → 0 | 38 → 32 |
| buildup | 0 | 0 | 0 | 124 → 0 | 31 → 0 | 1 → 0 | 67 → 0 | 38 → 32 |
| fiidii | 0 | 0 | 1 → 0 | 60 → 0 | 20 → 0 | 1 → 0 | 160 → 0 | 38 → 32 |
| fno | 12 → 0 | 0 | 2 | 160 → 0 | 65 → 0 | 19 → 0 | 115 → 0 | 38 → 32 |
| news | 0 | 0 | 0 | 65 → 0 | 15 → 0 | 0 | 42 → 0 | 38 → 32 |
| alerts | 0 | 0 | 0 | 28 → 0 | 19 → 0 | 3 → 0 | 11 → 0 | 38 → 32 |
| orders | 0 | 0 | 0 | 25 → 0 | 23 → 0 | 0 | 10 → 0 | 38 → 32 |
| portfolio | 0 | 0 | 0 | 29 → 0 | 15 → 0 | 0 | 16 → 0 | 38 → 32 |

### Still scrolling sideways on purpose

- **options**: 1 table(s) scroll inside their own box with the first column pinned (the options chain, and the strike-comparison tables whose columns are strikes). The page itself never scrolls sideways.
- **fno**: 2 table(s) scroll inside their own box with the first column pinned (the options chain, and the strike-comparison tables whose columns are strikes). The page itself never scrolls sideways.
