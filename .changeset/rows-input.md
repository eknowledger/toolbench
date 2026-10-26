---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: Rows input.** A `rows` input is a list the reader adds to, removes from and reorders, and `run` gets a `Row[]`. ([#204](https://github.com/eknowledger/toolbench/issues/204)) <!-- whats-new: gallery=rows docs=docs-ref-inputs.html#rows -->

Up to four columns, each a text, number, select or toggle. `maxRows` is required and `minRows` is optional. A row moves with the arrow keys on its handle or by dragging it, and each change is announced. An error can name a row with `row`, and is shown under that row.

- A link carries rows as one key per column, and leaves out its largest lists when it would pass 2,000 characters, saying which.
- The list is a chunk of its own, fetched only by a tool that has one.

⚠️ **Heads-up:** `InputValues` can now hold a `Row[]`. Host code that assumes every `host.values` entry is a string, a number or a boolean may need updating.

**New: Rate limits example.** The `rate-limits` tool matches requests against an ordered list of path limits, for the methods you choose. <!-- whats-new: gallery=tool-rate-limits -->
