---
"@toolbench/sdk": minor
---

**Fixed: a manifest key in the wrong object is refused, with where it belongs, instead of silently ignored.** ([#87](https://github.com/eknowledger/toolbench/issues/87)) `timeoutMs` inside `runtime`, `thread` at the top level, or `autoRun` inside an input now fail validation with a message naming the right place.

⚠️ Heads-up: a manifest that relied on a misplaced key being ignored will now fail to validate. Unknown keys are still ignored.
