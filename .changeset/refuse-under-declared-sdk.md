---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**Fixed: a tool's `sdk` now has to cover what it uses.** ([#170](https://github.com/eknowledger/toolbench/issues/170)) A manifest declaring `"sdk": 4` that used v6's `lang` used to validate, and a v4 runtime then loaded it and silently dropped the highlighting. Now it is refused: `inputs[0].lang: is from contract version 6, but the tool declares "sdk": 4 ... Declare "sdk": 6.`

- `upgradeManifest` checks before it stamps the current version, so every path that loads a manifest refuses, a host's own included. `validateManifest` checks a manifest validated as written. The `@toolbench/sdk/fixtures` harness also checks every case's expected output and every sample's result.
- New: `checkManifestFeatures(raw)` and `outputFeatureProblem(output, sdk)`, the same checks on their own.
- ⚠️ Heads-up: a manifest that under-declares its `sdk` now fails to load. Raise its `sdk` to the version the message names. Every tool and fixture in this repository already declared enough.
