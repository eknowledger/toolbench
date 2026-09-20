---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

The `series` renderer is no longer part of the main runtime chunk. A page whose tool declares `series` in `kinds` fetches it as a separate chunk of about 2.0 KB gzipped; every page without a chart tool no longer downloads it at all, which takes the runtime from 20,360 to 18,988 bytes gzipped.

`render` remains synchronous. `<tool-host>` awaits the chart chunk while it prepares, before the first paint, so a seeded card can still draw a chart and no draw becomes asynchronous. A tool that returns a `series` without declaring it in `kinds` still renders, one frame later, rather than failing.

Nothing a tool author writes changes. The observable difference for a host is one extra request on pages with a chart tool, and the requirement that a chart tool declares `series` in `kinds` if it wants the chunk preloaded rather than fetched on first draw.
