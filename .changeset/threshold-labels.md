---
"@toolbench/runtime": patch
---

**Fixed: Threshold labels.** Chart thresholds close together no longer print their labels over each other. ([#263](https://github.com/eknowledger/toolbench/issues/263)) <!-- whats-new: docs=docs-ref-results.html#chart -->

On an upright chart a label moves to its line's other side, or along or past its neighbour; on a horizontal chart each label takes its own line above the plot.
