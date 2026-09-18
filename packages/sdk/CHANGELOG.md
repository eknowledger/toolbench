# @toolbench/sdk

## 0.4.0

### Minor Changes

- [#46](https://github.com/eknowledger/toolbench/pull/46) [`dc13784`](https://github.com/eknowledger/toolbench/commit/dc13784af5759a5c651f98d06ba142c36f2889a2) Thanks [@eknowledger](https://github.com/eknowledger)! - Contract version 3 adds the optional `samples` manifest key: labelled example inputs a tool ships with, so a reader who does not know what to type has somewhere to start.

  ```jsonc
  "samples": [
    { "label": "Definitions disagree", "input": { "values": "3 4 4 5 6 7 9 14 40 260", "method": "linear" } },
    { "label": "Not a number", "input": { "values": "12, 14, 15, 18ms, 21, 24, 31, 44" } }
  ]
  ```

  The runtime draws them as a row of buttons under the form, in `page` and `embed` mode. Clicking one fills the form, which is an input change like any other: the result goes stale and waits for Run, or re-runs if the tool set `autoRun`. Each `input` is keyed by input id and may be partial, so a sample changes the one thing it is about and leaves the rest as the reader left it. A card draws no row, because it has room for one input and a Run button.

  `validateManifest` checks every sample against the inputs it fills: an unknown input id, a value of the wrong type, a number outside `min`/`max`, a string over `maxLength`, a `select` value that is not an option, a sample that fills nothing, an empty `samples` array and two samples sharing a label are all refused, naming the field. `checkToolDirectory` additionally runs every declared sample, so an example that crashes the tool fails the build with its label in the message; an `error` result is a pass, since a malformed example is one of the most useful a tool can ship.

  Existing tools are unaffected and need no change. Both halves of the `2 → 3` migration are the identity function, and no existing tool's fixtures were edited, which is what makes this a minor bump rather than a major one.

## 0.3.0

### Minor Changes

- [#32](https://github.com/eknowledger/toolbench/pull/32) [`725e880`](https://github.com/eknowledger/toolbench/commit/725e880295f99c74e8810183ba99575e6be8f0bb) Thanks [@eknowledger](https://github.com/eknowledger)! - Adds `seed()` and `serialiseSeed()` for computing a card's static result at build time, so a seed cannot drift from the tool it describes.

  `seed(loaded)` runs a tool against its manifest defaults and returns the `Output`. It throws if the tool crashes on its own defaults or rejects them, because both are authoring bugs and a card seeded with an error message is worse than an unseeded card.

  `serialiseSeed(output)` produces JSON safe to embed in `<script type="application/json">`. Use it rather than `JSON.stringify`: an HTML parser ends a `<script>` at the first `</script` in its text however the JSON is quoted, so a tool echoing any part of its input could otherwise truncate the page.

  Also exports `defaultInputs()` and `SeedError`.

- [#34](https://github.com/eknowledger/toolbench/pull/34) [`93d319b`](https://github.com/eknowledger/toolbench/commit/93d319b6601384205951231d01b79c5b45ff34b1) Thanks [@eknowledger](https://github.com/eknowledger)! - Adds a `@toolbench/sdk/fixtures` subpath exporting the tool-directory harness, so a host authoring its own tools gets the compatibility guarantees in three lines rather than copying forty:

  ```ts
  import { describe, it } from "node:test";
  import { checkToolDirectory } from "@toolbench/sdk/fixtures";

  checkToolDirectory(new URL("../src/tools/", import.meta.url), {
    describe,
    it,
  });
  ```

  It validates every manifest, checks each tool's `id` matches its directory name, refuses an empty `cases.json`, verifies no case expects an output kind the manifest failed to declare, and runs every case with a 50 ms bound for main-thread tools.

  Also exports `readToolDirectory`, `readTool` and `scanToolDirectory` for build-time use, such as generating a registry or precomputing seeds, plus `ToolDirectoryError` and `ToolOnDisk`.

  `describe` and `it` are passed in rather than imported, so this package keeps its zero dependencies and the same call works under other runners. It is a subpath rather than part of the main entry because it reads the filesystem, and the main entry deliberately does not: `@toolbench/runtime` imports this package and runs in a browser.

## 0.2.0

### Minor Changes

- [#30](https://github.com/eknowledger/toolbench/pull/30) [`d5135ad`](https://github.com/eknowledger/toolbench/commit/d5135ad8ca2c96f41d16a46f99b6a1c23b3bee3a) Thanks [@eknowledger](https://github.com/eknowledger)! - Contract version 2 adds the `bytes` output kind, for wire formats and hex dumps: offsets, hex, a printable gutter, and named highlight ranges that can start mid-row and wrap. A `table` could approximate this but gets alignment and spanning wrong, and has nowhere to put a range that crosses rows.

  Tools declaring `"sdk": 1` are unaffected and need no change. Raising the contract version is a minor bump, never a major one, because contract changes are additive by policy.

## 0.1.1

### Patch Changes

- [#26](https://github.com/eknowledger/toolbench/pull/26) [`aeb5c50`](https://github.com/eknowledger/toolbench/commit/aeb5c5011948798210d5f059aa66e7a9364aff40) Thanks [@eknowledger](https://github.com/eknowledger)! - Published source maps now contain their sources. Previously the maps referenced `../src/*.ts`, which `files: ["dist"]` never shipped, so anyone stepping into either package in a debugger got a map pointing at nothing. Sources are embedded with `inlineSources`, so the maps are self-contained.
