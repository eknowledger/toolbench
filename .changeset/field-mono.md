---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: a field can be set in the text face.** `mono: false` on a field draws its value and note in the text face instead of monospace, for a sentence or a plain number beside an address in the same list. Otherwise the field's `<dd>` carries `.tb-mono`, the same class a table cell uses. ([#209](https://github.com/eknowledger/toolbench/issues/209))

- Contract version 8. A field with no `mono` is drawn exactly as before.
