---
"@toolbench/runtime": minor
---

**Fixed: the Run area stops getting in the reader's way.** ([#99](https://github.com/eknowledger/toolbench/issues/99), [#101](https://github.com/eknowledger/toolbench/issues/101), [#104](https://github.com/eknowledger/toolbench/issues/104))

- No "press Run" line above the Run button. "inputs changed", sample and error messages are unchanged.
- Clicking Run with a mouse no longer scrolls the page to the result. A keyboard press still moves focus there, and the result now wears the theme's focus ring rather than the browser's.
- An `autoRun` tool has no Run button, and shows its default answer as soon as it opens.

⚠️ Heads-up: an `autoRun` tool now runs once on arrival (on activation, for a card). If a page relied on it staying empty until the reader typed, it will not.
