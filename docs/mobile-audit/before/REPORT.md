# Mobile audit (before)

Measured with Chrome at 2026-11-11. "Cut off" = content clipped by an overflow-hidden box or a table sticking out of the page. Text counts are elements with text under 12px / under 14px. Targets are interactive elements under 44px (a 44px invisible hit area counts as ok).

| route | width | page scroll | cut off | text <12 / <14 | small targets | inputs <16px | low contrast | overlapping bars | ticker px |
|---|---|---|---|---|---|---|---|---|---|
| landing | 360 | ok | 0 | 0 / 19 | 0/2 | 0 | 14 | 0 | - |
| landing | 390 | ok | 0 | 0 / 19 | 0/2 | 0 | 14 | 0 | - |
| landing | 414 | ok | 0 | 0 / 19 | 0/2 | 0 | 14 | 0 | - |
| dashboard | 360 | ok | 0 | 51 / 101 | 18/18 | 0 | 28 | 0 | 38 |
| dashboard | 390 | ok | 0 | 51 / 101 | 18/18 | 0 | 28 | 0 | 38 |
| dashboard | 414 | ok | 0 | 51 / 101 | 18/18 | 0 | 28 | 0 | 38 |
| watchlist | 360 | ok | 0 | 57 / 98 | 18/34 | 0 | 27 | 0 | 38 |
| watchlist | 390 | ok | 0 | 57 / 98 | 18/34 | 0 | 27 | 0 | 38 |
| watchlist | 414 | ok | 0 | 57 / 98 | 18/34 | 0 | 27 | 0 | 38 |
| trade | 360 | ok | 0 | 89 / 130 | 37/37 | 4 | 45 | 0 | 38 |
| trade | 390 | ok | 0 | 89 / 130 | 37/37 | 4 | 45 | 0 | 38 |
| trade | 414 | ok | 0 | 89 / 130 | 37/37 | 4 | 45 | 0 | 38 |
| pulse | 360 | ok | 0 | 73 / 107 | 15/15 | 0 | 70 | 0 | 38 |
| pulse | 390 | ok | 0 | 73 / 107 | 15/15 | 0 | 70 | 0 | 38 |
| pulse | 414 | ok | 0 | 73 / 107 | 15/15 | 0 | 70 | 0 | 38 |
| markets | 360 | ok | 0 | 39 / 139 | 17/17 | 0 | 35 | 0 | 38 |
| markets | 390 | ok | 0 | 39 / 139 | 17/17 | 0 | 35 | 0 | 38 |
| markets | 414 | ok | 0 | 39 / 139 | 17/17 | 0 | 35 | 0 | 38 |
| movers | 360 | ok | 0 | 51 / 139 | 21/21 | 0 | 55 | 0 | 38 |
| movers | 390 | ok | 0 | 51 / 139 | 21/21 | 0 | 55 | 0 | 38 |
| movers | 414 | ok | 0 | 51 / 139 | 21/21 | 0 | 55 | 0 | 38 |
| options | 360 | ok | 0 | 248 / 270 | 69/69 | 1 | 113 | 0 | 38 |
| options | 390 | ok | 0 | 248 / 270 | 69/69 | 1 | 113 | 0 | 38 |
| options | 414 | ok | 0 | 248 / 270 | 69/69 | 1 | 113 | 0 | 38 |
| buildup | 360 | ok | 0 | 124 / 203 | 31/31 | 1 | 67 | 0 | 38 |
| buildup | 390 | ok | 0 | 124 / 203 | 31/31 | 1 | 67 | 0 | 38 |
| buildup | 414 | ok | 0 | 124 / 203 | 31/31 | 1 | 67 | 0 | 38 |
| fiidii | 360 | ok | 0 | 60 / 267 | 20/20 | 1 | 160 | 0 | 38 |
| fiidii | 390 | ok | 0 | 60 / 267 | 20/20 | 1 | 160 | 0 | 38 |
| fiidii | 414 | ok | 0 | 60 / 267 | 20/20 | 1 | 160 | 0 | 38 |
| fno | 360 | **+66px** | 2 | 160 / 562 | 65/67 | 19 | 115 | 0 | 38 |
| fno | 390 | **+36px** | 2 | 160 / 562 | 65/67 | 19 | 115 | 0 | 38 |
| fno | 414 | **+12px** | 0 | 160 / 562 | 65/67 | 19 | 115 | 0 | 38 |
| news | 360 | ok | 0 | 65 / 94 | 15/15 | 0 | 42 | 0 | 38 |
| news | 390 | ok | 0 | 65 / 94 | 15/15 | 0 | 42 | 0 | 38 |
| news | 414 | ok | 0 | 65 / 94 | 15/15 | 0 | 42 | 0 | 38 |
| alerts | 360 | ok | 0 | 28 / 53 | 19/19 | 3 | 11 | 0 | 38 |
| alerts | 390 | ok | 0 | 28 / 53 | 19/19 | 3 | 11 | 0 | 38 |
| alerts | 414 | ok | 0 | 28 / 53 | 19/19 | 3 | 11 | 0 | 38 |
| orders | 360 | ok | 0 | 25 / 56 | 23/23 | 0 | 10 | 0 | 38 |
| orders | 390 | ok | 0 | 25 / 56 | 23/23 | 0 | 10 | 0 | 38 |
| orders | 414 | ok | 0 | 25 / 56 | 23/23 | 0 | 10 | 0 | 38 |
| portfolio | 360 | ok | 0 | 29 / 52 | 15/15 | 0 | 16 | 0 | 38 |
| portfolio | 390 | ok | 0 | 29 / 52 | 15/15 | 0 | 16 | 0 | 38 |
| portfolio | 414 | ok | 0 | 29 / 52 | 15/15 | 0 | 16 | 0 | 38 |
