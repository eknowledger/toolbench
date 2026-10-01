---
"@toolbench/runtime": patch
---

**Fixed: a tool page that draws no chart no longer downloads the chart styles.** The chart rules moved from the runtime's stylesheet into the chart chunk, which adopts them when the first chart is drawn: 1.4 KB less for every page without a chart.
