---
"@toolbench/runtime": minor
---

**New: lead with the answer, or let the page own the controls.** ([#103](https://github.com/eknowledger/toolbench/issues/103))

- `layout="answer-first"` puts the result above the form, for a tool used as a page's opening figure.
- `controls="none"` draws the result alone, and the page drives it with `values` and `run()`, so controls a page builds itself are no longer duplicated inside the tool.

Neither changes a card.
