---
"@toolbench/runtime": minor
---

**New: copy a code result or a table in one press.** ([#155](https://github.com/eknowledger/toolbench/issues/155)) Every `code` result has a "Copy code" button that copies its source exactly, and every `table` a "Copy table" button that copies it as tab-separated text, so it pastes into a spreadsheet as cells.

- The outcome is announced to screen readers and shown beside the button. Where the clipboard is missing or refused, it says "Copy failed" and selects the text so the reader can copy it with the keyboard.
- A closed card shows no Copy button. Style it with `.tb-copy-bar`, `.tb-copy` and `.tb-copy-note` (see STYLING.md).
- What the button does is a chunk of its own, about 0.5 KB, fetched when the first code or table result is drawn. Until it arrives the button shows disabled.
- **Fixed:** a copied table cannot carry a spreadsheet formula. A cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a leading `'`, so Excel and Sheets paste it as text. Plain numbers such as -5 are unchanged.
