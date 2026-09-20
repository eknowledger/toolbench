---
"@toolbench/runtime": patch
---

**Fixed: changing an attribute no longer wipes the result.** Setting `parts` or `mode` after a run used to empty the output. On a card with a seed it was worse: it silently reverted to the seeded default while the reader's own inputs stayed in the form. ([#79](https://github.com/eknowledger/toolbench/issues/79))

A repaint now redraws whatever was on screen, including an error or a partial result. The seed is only used for a tool that has not produced anything yet.
