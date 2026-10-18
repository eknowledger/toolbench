---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: highlighted textareas.** ([#153](https://github.com/eknowledger/toolbench/issues/153)) A `textarea` input can declare `lang`, and a host that passes `highlight` to `defineToolHost` paints what the reader types with the same hook `code` results use. The paint sits behind the real textarea, `aria-hidden`, with the same box and font, so the caret, selection, undo, paste and screen reader stay the browser's own. It catches up 250 ms after typing stops and is skipped past 20,000 characters. A missing hook, a hook that throws, or a hook whose text differs from the source leaves the plain textarea. Its code is a chunk of its own, about 1 KB gzipped, fetched only by a tool that declares `lang` on a host with a hook. `lang` is refused on any other input type.
