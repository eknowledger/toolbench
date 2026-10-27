---
"@toolbench/runtime": patch
---

**Changed: Smaller runtime.** The bytes renderer is a chunk of its own, so a page that draws no hex dump loads 0.8 KB less.

A bytes result, or a seed holding one, fetches it before drawing. If it cannot be fetched, the result says "The byte view could not be loaded." and the rest of a group still draws.
