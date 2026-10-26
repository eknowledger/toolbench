---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: Text face on a field.** `mono: false` sets a field's value in the text face instead of monospace. <!-- whats-new: docs=docs-ref-results.html#field -->

For a sentence or a plain number beside an address in the same list, the value and its note are drawn in the text face. Otherwise the field's `<dd>` carries `.tb-mono`, the same class a table cell uses. ([#209](https://github.com/eknowledger/toolbench/issues/209))

- Contract version 8. A field with no `mono` is drawn exactly as before.
