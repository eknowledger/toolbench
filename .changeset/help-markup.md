---
"@toolbench/runtime": minor
---

**New: structure in an input's help text.** A `description` can now use a blank line for a new paragraph, `- ` for list items, `` `code` ``, `**bold**`, and `{good|text}`, `{warn|...}`, `{bad|...}`, `{muted|...}` or `{accent|...}` for a word in a tone. ([#217](https://github.com/eknowledger/toolbench/issues/217))

- Built as elements, never parsed as HTML, with no links. A description with none of it renders exactly as before.
- On an older runtime the markup characters show as written.
