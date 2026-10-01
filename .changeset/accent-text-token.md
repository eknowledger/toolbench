---
"@toolbench/runtime": minor
---

**New: `--tb-accent-text` and `--tb-accent-ink`, so a bright accent can fill the Run button while its label and the tool's links stay readable.** ([#106](https://github.com/eknowledger/toolbench/issues/106))

- `--tb-accent-text` colours accent text: links, the card's "Try it" hint, a hovered sample, annotation labels. Defaults to `--tb-accent`.
- `--tb-accent-ink` colours text on an accent fill: the Run button's label, a marked byte. Defaults to `--tb-bg`.

Fills and focus outlines keep `--tb-accent`. Nothing changes unless you set the new tokens.
