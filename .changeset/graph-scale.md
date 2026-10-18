---
"@toolbench/runtime": minor
---

**New: large and dense graphs.** ([#152](https://github.com/eknowledger/toolbench/issues/152)) A graph past a hundred nodes is laid out off the main thread, in a worker made with the `workerFactory` you already pass for worker-mode tools: its edge table shows at once and the picture follows, so the page never stops. A dense layered graph of up to 60 nodes gets a crossing search that redraws it with fewer crossings, fetched only for the graphs that need it.

* Without a `workerFactory`, a large graph is laid out on the main thread after a frame.
