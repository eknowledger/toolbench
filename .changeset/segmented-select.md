---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: Segmented select.** `"control": "segmented"` draws a select's options as one row of native radio segments. ([#203](https://github.com/eknowledger/toolbench/issues/203)) <!-- whats-new: gallery=native-inputs docs=docs-ref-inputs.html#select -->

The chosen option is filled with the accent, and the row becomes stacked radios when a label would not fit. A reader tabs in once and picks with the arrow keys. `run` gets the option value, as from a dropdown.

- Contract version 9. A select with no `control` is still a dropdown.
- The controls are a chunk of their own, fetched only by a tool that has one.
