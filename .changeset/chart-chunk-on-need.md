---
"@toolbench/runtime": patch
---

**Fixed: a closed card no longer downloads the chart renderer, and a failed download no longer breaks the card.** ([#97](https://github.com/eknowledger/toolbench/issues/97))

- A card fetches the chart code only if its seed contains a chart, or when it is opened. Pages of closed, unseeded chart cards save the 2 KB request.
- If the chart code cannot be fetched (an offline reload, a cache purge mid-deploy, a strict CSP), cards still paint and open, and show everything except the chart with a line saying it could not be loaded, instead of a bundler error.
