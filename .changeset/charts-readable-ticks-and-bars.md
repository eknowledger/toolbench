---
"@toolbench/runtime": patch
---

**Fixed: charts read correctly over whole-number x values.** ([#111](https://github.com/eknowledger/toolbench/issues/111))

- Axis ticks land on round values (0, 100, 200 rather than 0, 118, 235), and an axis of whole numbers never shows a fraction such as frame 4.8.
- A bar chart's x labels sit on its bars, and two or more bar series are drawn side by side instead of on top of each other.
- Bars grow from zero, so negative values point down and a series of zeros draws nothing, instead of a row of solid bars under an axis from -1 to 1.
- Bars are drawn opaque, so they match their legend colour.
