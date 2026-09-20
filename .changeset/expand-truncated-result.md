---
"@toolbench/runtime": minor
---

A truncated grouped result can be expanded in place. `parts` now caps a group in any mode rather than only on a card, and the new `more="expand"` attribute turns the truncation notice into a disclosure button that reveals the hidden parts without navigating away and without running the tool again. `more` defaults to `link`, which is the existing static notice, so output is unchanged for a host that does not opt in. An embedded tool with no `parts` attribute still shows everything.
