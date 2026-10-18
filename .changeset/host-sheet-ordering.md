---
"@toolbench/runtime": patch
---

**Fixed: a stylesheet you adopt into a tool's shadow root no longer turns the runtime's styles off.**
The runtime's sheet now always comes first and yours is kept after it, whichever was adopted first, so
your rules win at equal specificity. ([#157](https://github.com/eknowledger/toolbench/issues/157))

- A chart's sheet now goes in behind the runtime's and ahead of yours, rather than after yours.
