---
"@toolbench/sdk": patch
"@toolbench/runtime": patch
---

**Fixed: no em dashes in what the runtime and the SDK write.** ([#42](https://github.com/eknowledger/toolbench/issues/42))

- The status line now reads "inputs changed. Press Run", "filled with "…". Press Run" and "showing the default result. Press Run to try your own".
- A bytes legend entry reads "U+00E9 é: 2 bytes at 0x0001".
- A missing value in a chart's data table, readout or share reads "n/a".
- Validation messages use a colon where they used an em dash.
- The example tools' own wording changed too, so their output did: `percentiles` 1.3.0 ("No measurements yet. Paste some numbers.", and its notes on the mean and the averaged p99) and `queue-explorer` 1.1.0 ("...no steady state to report. Lower the arrival rate or speed up service."). Minor versions, because a consumer could match on that output.
- ⚠️ Heads-up: a host or a test matching any of these strings exactly needs the new wording.
