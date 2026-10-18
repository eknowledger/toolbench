---
"@toolbench/runtime": minor
"@toolbench/sdk": minor
---

**New: link to one part of a result.** Give a part an `id` and call `host.reveal(id)`: the runtime
opens a closed card, shows the part if `parts` or `more` hid it, scrolls to it and moves focus there.
It resolves `false` for an id the result does not have.
([#147](https://github.com/eknowledger/toolbench/issues/147))

- The `id` is rendered as `data-part`, and fixtures fail if a result uses one id twice.
