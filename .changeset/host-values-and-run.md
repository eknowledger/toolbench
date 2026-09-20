---
"@toolbench/runtime": minor
"@toolbench/sdk": minor
---

**New: fill in a tool's form from your page.** `<tool-host>` gains a `values` setter and a `run()` method, so "try this example" buttons live in your own markup instead of inside every tool. ([#38](https://github.com/eknowledger/toolbench/issues/38))

- `values` accepts a partial set and validates it the way typing does; it does not run the tool.
- `run()` runs it. It leaves focus alone by default; `run({ focus: true })` moves focus to the result.
- The matching `values` getter reads back what is in the form, for building a shareable URL.
