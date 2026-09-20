---
"@toolbench/runtime": patch
---

A repaint redraws the result that was on screen instead of discarding it. Setting an observed attribute such as `parts` or `mode` after a run used to empty the output, and on a seeded host it silently reverted to the seed, showing the defaults' result under the reader's own inputs. The seed is now only the starting point for a host that has never produced a result, a partial or an error.
