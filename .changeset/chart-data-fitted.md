---
"@toolbench/runtime": patch
---

**New: Chart layout signal.** `data-fitted` on a chart says it has its final layout. <!-- whats-new: docs=docs-styling.html#chart-text-and-width -->

Wait for it before a script points at a chart or measures it. Before, the only option was to count frames, which fails on a busy machine. ([#236](https://github.com/eknowledger/toolbench/issues/236))
