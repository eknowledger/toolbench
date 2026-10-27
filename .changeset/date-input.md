---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: Date input.** A `date` input is the browser's own picker for a day, a time of day, or both. ([#203](https://github.com/eknowledger/toolbench/issues/203)) <!-- whats-new: gallery=native-inputs docs=docs-ref-inputs.html#date -->

`mode` is `date`, `time` or `datetime`, and `run` gets `YYYY-MM-DD`, `HH:MM` or `YYYY-MM-DDTHH:MM`. A value that does not parse, or is outside `min..max`, is refused on the input before `run`, with a message naming it. `inputProblem` in `@toolbench/sdk` is that check.

- Contract version 9.
- Samples and presets are checked the same way.

**Fixed: Dates in error messages.** A date in an error message no longer breaks across two lines on a phone.
