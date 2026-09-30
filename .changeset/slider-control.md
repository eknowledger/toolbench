---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: a slider for number inputs.** ([#102](https://github.com/eknowledger/toolbench/issues/102))

`"control": "slider"` on a number input draws a range control beside its number box, so a reader can sweep a value and watch the answer follow (with `autoRun`). The box stays editable for exact values, and the slider honours `min`, `max` and `step`.

Contract version 5. A tool uses it with `"sdk": 5`; a runtime that predates it shows the number box alone.
