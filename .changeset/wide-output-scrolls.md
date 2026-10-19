---
"@toolbench/runtime": patch
---

**Fixed: a result wider than its tool scrolls instead of being cut off.** A wide graph, a long code line, a hex dump or a chart's data table was clipped at the tool's right edge with no way to reach the rest; each now scrolls inside the tool, and unbroken text such as a digest or a URL wraps. ([#194](https://github.com/eknowledger/toolbench/issues/194))
