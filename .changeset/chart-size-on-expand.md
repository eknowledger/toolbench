---
"@toolbench/runtime": patch
---

**Fixed: expanding a card's truncated result no longer resizes the chart already on screen.** ([#100](https://github.com/eknowledger/toolbench/issues/100))

"Show 1 more result" reveals the rest underneath; the chart above it keeps its card size. A host that set `--tb-chart-card-max: none` to avoid the jump can remove it.
