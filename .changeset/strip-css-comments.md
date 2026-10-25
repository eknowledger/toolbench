---
"@toolbench/runtime": patch
---

**Smaller: the runtime's stylesheets no longer ship their comments.** Every comment written inside the CSS to explain a rule was a string each reader downloaded: 3,263 of the 28,582 gzipped bytes of the chunk every page loads. The build now strips them, and the chunk is 25,319 bytes. The comments stay in the source. No style changes.
