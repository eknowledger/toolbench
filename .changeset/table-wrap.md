---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: a table column can say how it wraps.** `wrap: "prose"` or `wrap: "none"` on a column, or on one cell, is written as `data-wrap` on the header and cells, so a narrow layout can keep short tokens on one line and give sentences a reading width. ([#213](https://github.com/eknowledger/toolbench/issues/213))

- Contract version 8. A column with no `wrap` renders exactly as before.
