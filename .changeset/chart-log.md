---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: log scales.** ([#118](https://github.com/eknowledger/toolbench/issues/118)) `yScale: "log"` and `xScale: "log"` draw an axis in powers of ten (0.1, 1, 10, 100, 1k), for values spanning orders of magnitude. Values a log axis cannot show (zero, negatives) are left out with a note in the data table, and bars are not drawn on a log y axis.
