# Mobile audit (after)

Measured with Chrome at 2026-11-11. "Cut off" = content clipped by an overflow-hidden box or a table sticking out of the page. Text counts are elements with text under 12px / under 14px. Targets are interactive elements under 44px (a 44px invisible hit area counts as ok).

| route | width | page scroll | cut off | text <12 / <14 | small targets | inputs <16px | low contrast | overlapping bars | ticker px |
|---|---|---|---|---|---|---|---|---|---|
| landing | 360 | ok | 0 | 0 / 19 | 0/2 | 0 | 0 | 0 | - |
| landing | 390 | ok | 0 | 0 / 19 | 0/2 | 0 | 0 | 0 | - |
| landing | 414 | ok | 0 | 0 / 19 | 0/2 | 0 | 0 | 0 | - |
| dashboard | 360 | ok | 0 | 0 / 79 | 0/9 | 0 | 0 | 0 | 32 |
| dashboard | 390 | ok | 0 | 0 / 79 | 0/9 | 0 | 0 | 0 | 32 |
| dashboard | 414 | ok | 0 | 0 / 79 | 0/9 | 0 | 0 | 0 | 32 |
| watchlist | 360 | ok | 0 | 0 / 62 | 0/25 | 0 | 0 | 0 | 32 |
| watchlist | 390 | ok | 0 | 0 / 62 | 0/25 | 0 | 0 | 0 | 32 |
| watchlist | 414 | ok | 0 | 0 / 62 | 0/25 | 0 | 0 | 0 | 32 |
| trade | 360 | ok | 0 | 0 / 87 | 0/24 | 0 | 0 | 0 | 32 |
| trade | 390 | ok | 0 | 0 / 87 | 0/24 | 0 | 0 | 0 | 32 |
| trade | 414 | ok | 0 | 0 / 87 | 0/24 | 0 | 0 | 0 | 32 |
| pulse | 360 | ok | 0 | 0 / 89 | 0/6 | 0 | 0 | 0 | 32 |
| pulse | 390 | ok | 0 | 0 / 89 | 0/6 | 0 | 0 | 0 | 32 |
| pulse | 414 | ok | 0 | 0 / 89 | 0/6 | 0 | 0 | 0 | 32 |
| markets | 360 | ok | 0 | 0 / 43 | 0/8 | 0 | 0 | 0 | 32 |
| markets | 390 | ok | 0 | 0 / 43 | 0/8 | 0 | 0 | 0 | 32 |
| markets | 414 | ok | 0 | 0 / 43 | 0/8 | 0 | 0 | 0 | 32 |
| movers | 360 | ok | 0 | 0 / 55 | 0/12 | 0 | 0 | 0 | 32 |
| movers | 390 | ok | 0 | 0 / 55 | 0/12 | 0 | 0 | 0 | 32 |
| movers | 414 | ok | 0 | 0 / 55 | 0/12 | 0 | 0 | 0 | 32 |
| options | 360 | ok | 0 | 0 / 252 | 0/60 | 0 | 0 | 0 | 32 |
| options | 390 | ok | 0 | 0 / 252 | 0/60 | 0 | 0 | 0 | 32 |
| options | 414 | ok | 0 | 0 / 252 | 0/60 | 0 | 0 | 0 | 32 |
| buildup | 360 | ok | 0 | 0 / 166 | 0/22 | 0 | 0 | 0 | 32 |
| buildup | 390 | ok | 0 | 0 / 166 | 0/22 | 0 | 0 | 0 | 32 |
| buildup | 414 | ok | 0 | 0 / 166 | 0/22 | 0 | 0 | 0 | 32 |
| fiidii | 360 | ok | 0 | 0 / 241 | 0/11 | 0 | 0 | 0 | 32 |
| fiidii | 390 | ok | 0 | 0 / 242 | 0/11 | 0 | 0 | 0 | 32 |
| fiidii | 414 | ok | 0 | 0 / 242 | 0/11 | 0 | 0 | 0 | 32 |
| fno | 360 | ok | 0 | 0 / 462 | 0/58 | 0 | 0 | 0 | 32 |
| fno | 390 | ok | 0 | 0 / 462 | 0/58 | 0 | 0 | 0 | 32 |
| fno | 414 | ok | 0 | 0 / 462 | 0/58 | 0 | 0 | 0 | 32 |
| news | 360 | ok | 0 | 0 / 76 | 0/6 | 0 | 0 | 0 | 32 |
| news | 390 | ok | 0 | 0 / 76 | 0/6 | 0 | 0 | 0 | 32 |
| news | 414 | ok | 0 | 0 / 76 | 0/6 | 0 | 0 | 0 | 32 |
| alerts | 360 | ok | 0 | 0 / 32 | 0/10 | 0 | 0 | 0 | 32 |
| alerts | 390 | ok | 0 | 0 / 32 | 0/10 | 0 | 0 | 0 | 32 |
| alerts | 414 | ok | 0 | 0 / 32 | 0/10 | 0 | 0 | 0 | 32 |
| orders | 360 | ok | 0 | 0 / 34 | 0/14 | 0 | 0 | 0 | 32 |
| orders | 390 | ok | 0 | 0 / 34 | 0/14 | 0 | 0 | 0 | 32 |
| orders | 414 | ok | 0 | 0 / 34 | 0/14 | 0 | 0 | 0 | 32 |
| portfolio | 360 | ok | 0 | 0 / 33 | 0/6 | 0 | 0 | 0 | 32 |
| portfolio | 390 | ok | 0 | 0 / 33 | 0/6 | 0 | 0 | 0 | 32 |
| portfolio | 414 | ok | 0 | 0 / 33 | 0/6 | 0 | 0 | 0 | 32 |
