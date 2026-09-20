---
"@toolbench/runtime": minor
---

**New: expand a long result in place.** `parts` now caps a grouped result in any mode, not just on a card, and `more="expand"` turns the "+2 more results" notice into a button that reveals the rest without leaving the page. Expanding never re-runs the tool. ([#79](https://github.com/eknowledger/toolbench/issues/79))

```html
<tool-host tool="percentiles" mode="embed" parts="1" more="expand"></tool-host>
```

`more` defaults to `link`, so nothing changes unless you opt in.
