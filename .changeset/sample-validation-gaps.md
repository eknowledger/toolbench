---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**Better errors for broken `samples`.** Two samples that fill the same values are now refused even when their labels differ, and duplicate-label and duplicate-id errors name both colliding entries instead of only one. ([#41](https://github.com/eknowledger/toolbench/issues/41))

⚠️ **Heads-up:** a manifest with two identical samples loaded before and now fails at load.
