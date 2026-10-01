---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: charts read out their values on hover and from the keyboard.** ([#112](https://github.com/eknowledger/toolbench/issues/112))

- Pointing at a chart snaps to the nearest x, draws a crosshair and shows a card of every series' value there. Tab to a chart and the arrow keys step through it, with each card read out to screen readers.
- A tool can say what a point means: `readout.titles` for a heading per x, `series.notes` for the text of one value, `readout.mode` and `readout.crosshair` to shape or turn it off.
- Whole numbers now print without decimals in charts and their data tables: frame 6, not 6.00.
