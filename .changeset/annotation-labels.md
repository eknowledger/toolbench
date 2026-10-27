---
"@toolbench/runtime": patch
---

**Fixed: Annotation labels.** Chart annotations close together no longer print their labels over each other. ([#263](https://github.com/eknowledger/toolbench/issues/263)) <!-- whats-new: docs=docs-ref-results.html#chart -->

A label that would meet another, or a threshold's, drops a line, and labels are haloed so a neighbouring annotation's rule does not run through them.
