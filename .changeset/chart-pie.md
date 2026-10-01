---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: pie and donut charts.** ([#123](https://github.com/eknowledger/toolbench/issues/123)) A `pie` output draws parts of a whole in the order given, from 12 o'clock clockwise, every slice labelled with its share. More than six parts fold into "Other", a negative or zero total draws a message instead, and `donut: true` shows the total in the centre. Its code is fetched only by pages that draw one.
