---
"@toolbench/runtime": minor
---

**New: highlighted byte ranges are told apart by colour.** ([#148](https://github.com/eknowledger/toolbench/issues/148)) A `bytes` range with no `tone` is drawn in the next chart series colour, `--tb-s1` to `--tb-s6`, round again after six, and its legend swatch matches. Eight labelled fields of one message are no longer eight identical blocks.

- No contract change: tools need nothing new, and a range with a `tone` looks as it did.
- The digits on every mark keep 4.5:1 contrast or better in light and dark. The label stays in the legend and the hover text.
- A host can select a range's colour with `data-series` on `.tb-byte` and the legend entry (see STYLING.md).
