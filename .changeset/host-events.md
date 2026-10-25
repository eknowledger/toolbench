---
"@toolbench/runtime": minor
---

**New: follow a tool from your page.** `<tool-host>` dispatches `tool-input` with `{ values }` after the inputs change, and `tool-run` with `{ values, ok, error? }` after a run's result is drawn, so a deep link, analytics or your own Copy button no longer has to listen for clicks inside the shadow root. ([#212](https://github.com/eknowledger/toolbench/issues/212))

- Both bubble and are composed, so one listener on `document` hears every tool.
- Neither fires while a tool first opens with its starting values. The `ToolHostEvents` type names both.
