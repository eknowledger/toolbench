---
"@toolbench/runtime": minor
"@toolbench/sdk": minor
---

**New: paint `code` results with your own highlighter.** Pass `highlight` to `defineToolHost` and it is called with `(source, lang)` for every `code` result. ([#9](https://github.com/eknowledger/toolbench/issues/9))

It must return a DOM `Node`, not a string, so the runtime never assigns `innerHTML`. Omit it and you still get readable preformatted text, and no highlighter is bundled.
