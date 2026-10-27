---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: Secret input.** A `secret` input is a password field with a button to show it, kept out of links. ([#203](https://github.com/eknowledger/toolbench/issues/203)) <!-- whats-new: gallery=native-inputs docs=docs-ref-inputs.html#secret -->

It has no `default`, and a sample or a preset that sets it is refused, so a token never ships in a manifest. A link neither carries it nor fills it unless it says `"share": true`. `minLength` refuses a shorter value before `run`.

- Contract version 9.
- Do not return its value in a result: a result is on screen, announced, and in the `tool-run` event.
