# @toolbench/sdk

## 0.6.0

### Minor Changes

- [#63](https://github.com/eknowledger/toolbench/pull/63) [`08febf0`](https://github.com/eknowledger/toolbench/commit/08febf06db3c312115bca2c6ac9c1e2d9441c7ff) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **New: paint `code` results with your own highlighter.** Pass `highlight` to `defineToolHost` and it is called with `(source, lang)` for every `code` result. ([#9](https://github.com/eknowledger/toolbench/issues/9))

  It must return a DOM `Node`, not a string, so the runtime never assigns `innerHTML`. Omit it and you still get readable preformatted text, and no highlighter is bundled.

- [#61](https://github.com/eknowledger/toolbench/pull/61) [`f0cfb36`](https://github.com/eknowledger/toolbench/commit/f0cfb36044b52a168073c22ad9577b6dd5aadf00) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **New: fill in a tool's form from your page.** `<tool-host>` gains a `values` setter and a `run()` method, so "try this example" buttons live in your own markup instead of inside every tool. ([#38](https://github.com/eknowledger/toolbench/issues/38))

  - `values` accepts a partial set and validates it the way typing does; it does not run the tool.
  - `run()` runs it. It leaves focus alone by default; `run({ focus: true })` moves focus to the result.
  - The matching `values` getter reads back what is in the form, for building a shareable URL.

- [#54](https://github.com/eknowledger/toolbench/pull/54) [`68d037a`](https://github.com/eknowledger/toolbench/commit/68d037ae544827966766707031689bfdbb32e1fd) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **New: retire a tool without breaking its URL.** `status: "retired"` or `"deprecated"` in a manifest is now honoured. ([#16](https://github.com/eknowledger/toolbench/issues/16))

  - **Retired** does not run. The page explains, and renders `links` as the way onward, so a bookmark is neither a 404 nor a silent run.
  - **Deprecated** still runs, with a marker you can style via `data-status` on `<tool-host>` and the `--tb-mark-*` tokens. It is not offered as a live card.

  ⚠️ **Heads-up:** a manifest combining `card: "live"` with a `status` of `deprecated` or `retired` is now refused at load. That pairing says two contradictory things, so this can only catch a mistake, but it is a rule an existing manifest could trip.

- [#59](https://github.com/eknowledger/toolbench/pull/59) [`1b526d2`](https://github.com/eknowledger/toolbench/commit/1b526d2d34ecd20a5008bb869be5b2ba83720d94) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **Better errors for broken `samples`.** Two samples that fill the same values are now refused even when their labels differ, and duplicate-label and duplicate-id errors name both colliding entries instead of only one. ([#41](https://github.com/eknowledger/toolbench/issues/41))

  ⚠️ **Heads-up:** a manifest with two identical samples loaded before and now fails at load.

- [#85](https://github.com/eknowledger/toolbench/pull/85) [`fdd87df`](https://github.com/eknowledger/toolbench/commit/fdd87df85a9789c9e300f2df1205ac89cb65f408) Thanks [@eknowledger](https://github.com/eknowledger)! - **Smaller download for pages without charts.** The `series` chart renderer is now its own chunk, worth about 1.4 KB gzipped off the main runtime. ([#12](https://github.com/eknowledger/toolbench/issues/12))

  A page whose tool declares `series` in `kinds` fetches it before the first result, so nothing changes for you. A page with no chart tool never downloads it.

### Patch Changes

- [#65](https://github.com/eknowledger/toolbench/pull/65) [`2e93266`](https://github.com/eknowledger/toolbench/commit/2e932660a52d305d6af8781cba49132dfc878f06) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **Fixed: two accessibility defects on cards.** ([#64](https://github.com/eknowledger/toolbench/issues/64))

  - A closed card's accessible name now includes its visible "Try it" / "Open this tool" hint, so speech input matching what is on screen works (WCAG 2.5.3).
  - The title link's hit target is at least 24px tall rather than the height of the text (WCAG 2.5.8).

- [#55](https://github.com/eknowledger/toolbench/pull/55) [`8631f93`](https://github.com/eknowledger/toolbench/commit/8631f938338410e21b03beead95765f0a30d8144) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **Fixed: the "inputs changed" cue on Run no longer looks like keyboard focus.** It was a ring, which is the visual language of `:focus-visible`; it is now a darker fill. ([#43](https://github.com/eknowledger/toolbench/issues/43))

## 0.5.0

### Minor Changes

- [#51](https://github.com/eknowledger/toolbench/pull/51) [`65dd2b0`](https://github.com/eknowledger/toolbench/commit/65dd2b0fcdcfdcd81651e48a73441e669e4eafcd) Thanks [@eknowledger](https://github.com/eknowledger)! - A card can show every primary input, and more than one result part

  Three changes, all of them about a card that had to say too little.

  **Every `primary` input, not the first.** The runtime used `find` where it meant `filter`, so a manifest
  marking two inputs primary got one and nothing said why. A question that needs two numbers cannot be asked
  with one: a queue card offering an arrival rate without a service time sizes nothing. `validate.ts` no
  longer caps the count either, which is a loosening rather than a change, so every manifest that validated
  before still validates and no tool has to change.

  **A new `parts` attribute on `<tool-host>`.** A compact card rendered exactly one part of a grouped result.
  One is too few for a tool whose answer is a number _and_ a curve, where the number alone hides how steep
  the curve is and the curve alone is a set of unnamed lines. `parts="2"` gives the card room for both, and
  whatever does not fit is still counted rather than hidden. Default 1, so existing cards render exactly as
  before.

  An attribute rather than a manifest key, deliberately: how much room a card has is a property of the page
  it sits on, not of the tool, and the same tool is a one-part card in a sidebar and a two-part card leading
  a section.

  **A card's chart is drawn smaller, not shorter.** Compact mode halved the chart's viewBox height, which took
  the plot area from 238 units to 88 and compressed a curve falling from 74% to nothing into an unreadable
  band, and dropped the axis titles, the annotation label and the legend with it. None of that was needed: the
  geometry is a viewBox scaled to the available width, so a chart on a narrow card is already smaller than one
  on a page with its aspect ratio intact. The chart is now identical everywhere, and compact changes only the
  rendered size, capped at `--tb-chart-card-max` (52rem). Labels stay legible below that width via a container
  query, since text inside a viewBox otherwise shrinks with it.

  **A result summary is announced, not displayed.** "6 fields, chart, 2 series, table, 5 rows" rendered above
  the result as a line that reads like debug output, describing something already on screen. It is what a
  screen reader needs and what a sighted reader does not, so it moves to a visually hidden live region. The
  visible line keeps what a reader can act on: prompts, a sample's name, and errors.

  No contract version change. Nothing here adds or alters a manifest key, and the one rule that changed was
  removed rather than added.

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
