---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: named categories on a chart's x axis.** ([#113](https://github.com/eknowledger/toolbench/issues/113))

`x: ["Mesh", "MCU", "SFU"]` draws one evenly spaced slot per name, in the order given, labelled with the text. When the labels would collide, every second or third is shown; all of them are in the data table and the readout.

- **Fixed:** a bar chart's axis always starts at zero, so a bar's length is its value.
- **Fixed:** bars are capped in thickness, so a chart of a few categories draws bars rather than slabs.
