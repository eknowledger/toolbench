---
"@toolbench/runtime": patch
---

**Changed: Shorter runtime.** Shorter developer messages and one rule for every tone take 0.1 KB more off every page.

The console warning for a worker-mode tool with no `workerFactory`, and the errors for a tool module with no default export and for a page with no source, keep their meaning in fewer words.
