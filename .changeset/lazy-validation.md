---
"@toolbench/runtime": minor
---

**Changed: Manifest validation.** The runtime chunk every page loads is 6.8 KB smaller, with validation fetched by the first `list()`. ([#259](https://github.com/eknowledger/toolbench/issues/259)) <!-- whats-new: docs=docs-ref-host.html#registrysource -->

⚠️ **Heads-up:** `new RegistrySource()` no longer throws on a bad manifest. `list()` and `load()` reject with the same `ManifestError` instead, naming the field, and every `<tool-host>` on the page shows it. Await `source.list()` where you caught the constructor's error. `source.manifest(id)` is `undefined` until `list()` has resolved.

- A page that lists its tools fetches the validation chunk, 7.4 KB, before its first card paints: one more request. A `<link rel="modulepreload">` for it in your HTML fetches it alongside the runtime.
- Nothing is drawn from a manifest before it has been validated, as before.
- `validateManifest` and the rest of `@toolbench/sdk` are unchanged for anyone who imports them.
