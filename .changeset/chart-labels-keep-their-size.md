---
"@toolbench/runtime": minor
---

**Fixed: chart labels stay readable at any width.** A chart is now laid out for the width it is drawn at, so its labels are 12px on a phone and on a wide screen, where they used to be about 5px and 22px. ([#210](https://github.com/eknowledger/toolbench/issues/210))

- **New:** `--tb-chart-font` sets the size of every label in a chart, and `--tb-chart-max-width` caps how wide a chart is drawn. See STYLING.md.
- Below 480px, horizontal bars put each name above its bars, a pie's key goes under the pie, and a Venn diagram's set names go in a key.
- ⚠️ Heads-up: a chart is drawn again when its width changes, so a reference to the figure `render` returned can go stale. Find it by `data-kind` or `data-part`.
