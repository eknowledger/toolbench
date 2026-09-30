---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: chart markers, for data over separate items.** ([#111](https://github.com/eknowledger/toolbench/issues/111))

- `markers: true` on a `line` or `area` series draws a marker at every point; `shape: "points"` draws the points with no line between them.
- Each series gets its own marker shape as well as its colour, so series with equal values stay distinguishable, and the legend keys each one by its marker.

Contract version 4. A tool uses these with `"sdk": 4`; existing tools are unaffected.
