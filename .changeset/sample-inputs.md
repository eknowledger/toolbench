---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

Contract version 3 adds the optional `samples` manifest key: labelled example inputs a tool ships with, so a reader who does not know what to type has somewhere to start.

```jsonc
"samples": [
  { "label": "Definitions disagree", "input": { "values": "3 4 4 5 6 7 9 14 40 260", "method": "linear" } },
  { "label": "Not a number", "input": { "values": "12, 14, 15, 18ms, 21, 24, 31, 44" } }
]
```

The runtime draws them as a row of buttons under the form, in `page` and `embed` mode. Clicking one fills the form, which is an input change like any other: the result goes stale and waits for Run, or re-runs if the tool set `autoRun`. Each `input` is keyed by input id and may be partial, so a sample changes the one thing it is about and leaves the rest as the reader left it. A card draws no row, because it has room for one input and a Run button.

`validateManifest` checks every sample against the inputs it fills: an unknown input id, a value of the wrong type, a number outside `min`/`max`, a string over `maxLength`, a `select` value that is not an option, a sample that fills nothing, an empty `samples` array and two samples sharing a label are all refused, naming the field. `checkToolDirectory` additionally runs every declared sample, so an example that crashes the tool fails the build with its label in the message; an `error` result is a pass, since a malformed example is one of the most useful a tool can ship.

Existing tools are unaffected and need no change. Both halves of the `2 → 3` migration are the identity function, and no existing tool's fixtures were edited, which is what makes this a minor bump rather than a major one.
