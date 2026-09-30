---
"@toolbench/runtime": patch
---

**Fixed: a card's blurb and seeded answer reach screen readers, and the card passes the label, nesting and target-size checks.** ([#98](https://github.com/eknowledger/toolbench/issues/98), [#105](https://github.com/eknowledger/toolbench/issues/105))

A closed card is now ordinary content with one button, its "Try it" hint, instead of a button wrapping everything. Clicking anywhere on the card still opens it, except on a control inside it such as a chart's "Show the data as a table", which now works in a card. A host test that clicked `button.tb-facade` should click the card or `button.tb-facade-hint` instead.
