---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: link a chart to its tables.** ([#124](https://github.com/eknowledger/toolbench/issues/124))

- `readout.highlightTable: true` highlights the chart's own data-table row as the reader points along the chart.
- A `table` part with `link: { chart, keys }` is linked to the chart with that `id`: pointing at the chart lights the matching rows, and pointing at a row moves the chart's readout there.
