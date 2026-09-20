---
"@toolbench/runtime": patch
---

A bar chart's first bar is no longer drawn across the y axis, and its last bar no longer hangs past the right edge. Bars are centred on their x position, and the x domain was the exact range of the data, so half of each end bar fell outside the plot. The domain is now padded by half a slot when any series is a bar, which also makes each bar occupy exactly its own share of the plot width. Line and area series keep the tight domain, because a line genuinely starts at its first point.
