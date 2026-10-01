---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: stacked bars.** ([#115](https://github.com/eknowledger/toolbench/issues/115))

Bar series with the same `stack` id are drawn as one bar of parts at each x, so a reader sees each part and the total: a delay budget stage by stage, traffic by protocol. Negative values stack below zero, plain bar series sit beside the stack, and the data table adds a total per stack.
