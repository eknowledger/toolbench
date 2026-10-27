---
"@toolbench/sdk": patch
"@toolbench/runtime": patch
---

**Fixed: Rows number cells.** A rows number cell out of range, or emptied, is refused under its row instead of clamped. ([#262](https://github.com/eknowledger/toolbench/issues/262)) <!-- whats-new: gallery=tool-rate-limits docs=docs-ref-inputs.html#rows -->

Typing 9999999 into a cell declared 1 to 10000 ran on 10000, and an emptied cell ran on the number it held before. Run now shows "Limits, row 2: Limit must be between 1 and 10000, got 9999999." under the row, and a link carries the cell as written.
