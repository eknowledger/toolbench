---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**Smaller download for pages without charts.** The `series` chart renderer is now its own chunk, worth about 1.4 KB gzipped off the main runtime. ([#12](https://github.com/eknowledger/toolbench/issues/12))

A page whose tool declares `series` in `kinds` fetches it before the first result, so nothing changes for you. A page with no chart tool never downloads it.
