---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: retire a tool without breaking its URL.** `status: "retired"` or `"deprecated"` in a manifest is now honoured. ([#16](https://github.com/eknowledger/toolbench/issues/16))

- **Retired** does not run. The page explains, and renders `links` as the way onward, so a bookmark is neither a 404 nor a silent run.
- **Deprecated** still runs, with a marker you can style via `data-status` on `<tool-host>` and the `--tb-mark-*` tokens. It is not offered as a live card.

⚠️ **Heads-up:** a manifest combining `card: "live"` with a `status` of `deprecated` or `retired` is now refused at load. That pairing says two contradictory things, so this can only catch a mistake, but it is a rule an existing manifest could trip.
