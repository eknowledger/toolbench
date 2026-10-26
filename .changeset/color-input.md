---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: Colour input.** A `color` input is a hex box with the system's colour picker beside it, kept in step. ([#203](https://github.com/eknowledger/toolbench/issues/203)) <!-- whats-new: gallery=native-inputs docs=docs-ref-inputs.html#color -->

`run` gets a lowercase `#rrggbb`, with no alpha and no shorthand. What a reader types is trimmed and lowercased, and anything else is refused on the input before `run`.

- Contract version 9.
