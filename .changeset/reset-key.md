---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: Reset off for a tool.** `"reset": false` in a manifest leaves the Reset button out. <!-- whats-new: gallery=reset docs=docs-ref-manifest.html#manifest-attributes -->

`"reset": false` at the top level of a manifest leaves Reset out, as `reset="none"` on the element does, for a tool with one input where it adds nothing. ([#208](https://github.com/eknowledger/toolbench/issues/208))

- Contract version 8.
