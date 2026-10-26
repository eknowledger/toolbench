---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: More help behind a disclosure.** `details` on an input puts the rest of its help behind a "More", closed until opened. <!-- whats-new: gallery=input-details docs=docs-ref-inputs.html#common-attributes -->

`details` on an input puts the rest of its help in a native disclosure under the one-line `description`, closed until the reader opens it. It takes the same markup as a description. ([#215](https://github.com/eknowledger/toolbench/issues/215))

- A screen reader on the control still hears only the description.
- Contract version 8.
