---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: heatmaps.** ([#121](https://github.com/eknowledger/toolbench/issues/121)) A `heatmap` output draws a value over two dimensions as coloured cells, sequential (one hue) or diverging (two hues around a midpoint), with a key, hatched cells where there is no value, and a readout the arrow keys move through. Its code is fetched only by pages that draw one; theme the colours with `--tb-heat-lo`, `--tb-heat-hi`, `--tb-heat-neg`, `--tb-heat-mid` and `--tb-heat-pos`.
