---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: Multiselect.** A `multiselect` input lets a reader choose several options, and `run` gets them as a `string[]`. ([#204](https://github.com/eknowledger/toolbench/issues/204)) <!-- whats-new: gallery=multiselect docs=docs-ref-inputs.html#multiselect -->

Up to six options are checkboxes and more are chips; `control` picks either. `min` and `max` bound the list, and Run below `min` is refused with a message under the input. Samples, presets and cases give the list as a JSON array, and a shared link repeats the key once per choice.

⚠️ **Heads-up:** `InputValues` can now hold a `string[]`. Host code that assumes every `host.values` entry is a string, a number or a boolean, such as `String(value)` into a query string, may need updating.

**New: Errors under their input.** An error that names an input is now shown under that input, after the field's name. <!-- whats-new: docs=docs-authoring.html#6-errors -->

**Fixed: Toggle colour.** A toggle's checkbox is drawn in the accent colour instead of the browser's own blue.
