---
"@toolbench/runtime": minor
---

**New: readers can share a link to a tool with its inputs.** A `page` or `embed` tool now has a link icon that copies the page's address with the tool's inputs in it, and a tool opens with the inputs a link carries. ([#227](https://github.com/eknowledger/toolbench/issues/227))

- Inputs go in the query as `<tool id>.<input id>`, and an input marked `share: false` is never written or read.
- `share="none"`, `share-label` and `share-position` (`top` or `actions`), or the same as `defineToolHost` options. `share: { url, read }` is your own scheme. `tool-share` fires with `{ url, values }`.
- **⚠️ Heads-up:** the button is on by default. A page that builds its own share links should set `share: "none"`, or its tools will also read their values from the address.
