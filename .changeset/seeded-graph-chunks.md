---
"@toolbench/runtime": patch
---

**Fixed: a closed card seeded with a graph draws the graph.** A graph whose layout needs the crossing search, or one past 100 nodes, showed "The chart could not be loaded." instead. ([#201](https://github.com/eknowledger/toolbench/issues/201))

When a graph really cannot be loaded, the line now says "graph", not "chart".
