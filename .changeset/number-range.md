---
"@toolbench/sdk": patch
"@toolbench/runtime": patch
---

**Fixed: Numbers out of range.** A number outside its range is marked as it is typed, and Run refuses it instead of clamping. ([#262](https://github.com/eknowledger/toolbench/issues/262)) <!-- whats-new: docs=docs-ref-inputs.html#number -->

The box keeps what the reader typed, with "Arrival rate must be between 1 and 5000, got 99999." under it, and the share link carries that value, so the link opens marked the same way. An emptied box is refused too, where it used to run on the min. `inputProblem` reports both. A host's `values` write is still clamped.

⚠️ **Heads-up:** reading `values` while a reader's number is out of range gives that number, and an empty or unreadable box gives its text, a string.
