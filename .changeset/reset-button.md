---
"@toolbench/runtime": minor
---

**New: a Reset button beside Run.** Once a reader changes an input, Reset puts every input back to the values the tool opened with (your page's prefill, or the defaults) and clears the result. ([#208](https://github.com/eknowledger/toolbench/issues/208))

- Hidden while the inputs are already at their starting values. Dispatches `tool-reset` with `{ values }`.
- `reset="none"` leaves it out, for a tool where it adds nothing.
- **⚠️ Heads-up:** a host stylesheet that styles every `button` in `.tb-actions` now reaches Reset as well. Its class is `.tb-reset`.
