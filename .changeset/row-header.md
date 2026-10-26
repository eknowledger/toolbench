---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: Tables that work on a phone.** A table keeps its columns and scrolls on a narrow screen, with the row name kept in view. <!-- whats-new: gallery=table-wrap docs=docs-ref-results.html#column label="Changes a default" -->

`rowHeader: true` on a table column renders its cells as `<th scope="row">`, so a screen reader names the row with every cell. A table whose columns say `wrap` now has a narrow layout built in: under 34rem it keeps its columns and scrolls, tokens on one line, prose at a reading width, the row header in view. ([#214](https://github.com/eknowledger/toolbench/issues/214))

- Any table that scrolls shows a shadow at the edge with more to see. A table that fits looks as before.
- Contract version 8. A table with no `wrap` and no `rowHeader` keeps its layout.
- ⚠️ Heads-up: the cells of a `rowHeader` column are no longer `td`, so a host selector such as `td:first-child` stops matching them. It is opt-in per column.
