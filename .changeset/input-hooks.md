---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: style one input at a time.** Each input's `.tb-field-row` now carries `data-input` (its id), `data-type`, and `data-role` when the manifest gives the input a `role`. The form reads four new properties, `--tb-input-bg`, `--tb-input-border`, `--tb-input-fg` and `--tb-desc-fg`, so setting one on a row recolours only that input. ([#224](https://github.com/eknowledger/toolbench/issues/224))

- `role` on an input is contract version 8. The attributes and properties need no contract change.
- The properties default to today's colours, so nothing changes unless you set them.
