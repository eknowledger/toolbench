---
"@toolbench/runtime": patch
---

**Fixed: Copying on plain HTTP.** The share button and Copy now copy on a plain-HTTP page, where the Clipboard API is missing. ([#264](https://github.com/eknowledger/toolbench/issues/264)) <!-- whats-new: gallery=share -->

They fall back to the browser's older copy command, also when the Clipboard API refuses the write. If that fails too, the link or the text is selected for the reader, with a note that copying needs HTTPS.
