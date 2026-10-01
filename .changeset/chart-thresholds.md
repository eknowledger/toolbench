---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: threshold lines on a chart.** ([#114](https://github.com/eknowledger/toolbench/issues/114))

`thresholds: [{ y: 150, label: "150 ms budget", tone: "warn" }]` draws a labelled, dashed rule across the plot at that value. The scale widens to include it, and it stays out of the legend, the data table and the readout, because it is a limit rather than a measurement.
