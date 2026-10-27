---
"@toolbench/runtime": minor
"@toolbench/sdk": minor
---

**Changed: Smaller pages.** Tools checked at build time no longer ship the manifest checker to readers. ([#259](https://github.com/eknowledger/toolbench/issues/259)) <!-- whats-new: docs=docs-ref-host.html#registrysource -->

- With Vite, add `toolbench()` from `@toolbench/runtime/vite`. With any other bundler, or none, run `npx toolbench-manifests <dir> --out <dir>` and pass its `registry` to `RegistrySource`.
- A bad manifest fails the build, naming the file and the field. In `vite dev` it shows in Vite's error overlay.
- The runtime a minimal Vite host loads falls from 26.8 KB to 20.4 KB gzipped.
- Measured in Chrome at a 100 ms round trip: the project site's landing page loads 6.6 KB less before its first paint (50,084 to 43,441 gzipped bytes) and paints as soon as before.
- `source.manifest(id)` answers as soon as the source is built, when every manifest was checked at build time.

⚠️ **Heads-up:** without the plugin or the command, manifests are checked in the browser by a chunk the source fetches on its first `list()`, and a page paints about 110 ms later than before, for 0.9 KB more in total. For manifests that come from a server, add `toolbench({ preloadValidation: true })`, or a `<link rel="modulepreload">` for `@toolbench/runtime/validation`. `new RegistrySource()` no longer throws on a bad manifest: `list()` and `load()` reject with the `ManifestError`, and every `<tool-host>` on the page shows it.
