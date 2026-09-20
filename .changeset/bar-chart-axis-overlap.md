---
"@toolbench/runtime": patch
---

**Fixed: bar charts drew their first bar across the y axis.** The last bar hung off the right edge for the same reason. Bars now sit inside the plot, each filling its own share of the width. Line and area charts are unchanged.
