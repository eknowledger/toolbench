---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: presets on a select.** ([#151](https://github.com/eknowledger/toolbench/issues/151)) A select option can carry `sets`, the values it writes into other inputs when it is chosen, so a "Library" select can fill the read timeout and retries with that library's defaults for the reader to edit. Choosing one behaves like a sample: the result goes stale and the status line names it. The select then follows the form: once the values stop matching it, it shows the preset they do match, or the first option with no `sets`, and says so. A host writing the select through `values` fills nothing. `sets` is validated like a sample's `input`, may not name its own select or another preset select, must differ between options, and on the default option must equal those inputs' defaults. The sample range message now reads "fix the value" rather than "fix the example". This raises the contract to version 6: a tool using `sets` declares `"sdk": 6`, and every older manifest loads unchanged.
