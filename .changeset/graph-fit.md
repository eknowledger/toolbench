---
"@toolbench/runtime": minor
---

**New: a wide graph fits its tool, with a button to show it at full size.** A graph wider than its plot is scaled down to fit, never up, and a small button above it switches to full size in a plot that scrolls, keeping the reader's focus, selection and highlighted path. ([#198](https://github.com/eknowledger/toolbench/issues/198))

- `defineToolHost({ wide: "scroll" })`, or `wide="scroll"` on one `<tool-host>`, keeps the previous behaviour: full size, scrolling.
- `wideToggle: false`, or `wide-toggle="false"`, hides the button. Style it as `::part(wide-toggle)`.
- **⚠️ Heads-up:** fitting is the new default, so a graph that used to scroll now arrives scaled down. Set `wide: "scroll"` to keep it scrolling.
