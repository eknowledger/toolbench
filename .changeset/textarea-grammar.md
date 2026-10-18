---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: a tool can ship a grammar for its own textarea language.** ([#163](https://github.com/eknowledger/toolbench/issues/163)) Beside `lang`, a textarea's `grammar` lists `keywords`, a `comment` prefix, `operators` and `strings` delimiters, and the runtime paints what the reader types with them, so a notation no host highlighter knows is highlighted anyway.

- No patterns: a tool cannot ship a regular expression that freezes the page, any other key is refused, and every list is capped.
- A host `highlight` hook that paints the `lang` still wins. The paint is the same as `lang`'s: behind the real textarea, `aria-hidden`, so the caret, selection, undo and screen reader are the browser's own.
- The tokeniser is in the lazily fetched paint chunk, now about 1.5 KB, which a tool with a grammar fetches even on a host with no hook. Contract version 7.
