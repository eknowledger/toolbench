---
"@toolbench/runtime": patch
"@toolbench/sdk": patch
---

**Fixed: two accessibility defects on cards.** ([#64](https://github.com/eknowledger/toolbench/issues/64))

- A closed card's accessible name now includes its visible "Try it" / "Open this tool" hint, so speech input matching what is on screen works (WCAG 2.5.3).
- The title link's hit target is at least 24px tall rather than the height of the text (WCAG 2.5.8).
