# @toolbench/runtime

## 0.6.0

### Minor Changes

- [#94](https://github.com/eknowledger/toolbench/pull/94) [`9480da7`](https://github.com/eknowledger/toolbench/commit/9480da7c1ae5bd65bd14a7b372c2657e3d5d24de) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: expand a long result in place.** `parts` now caps a grouped result in any mode, not just on a card, and `more="expand"` turns the "+2 more results" notice into a button that reveals the rest without leaving the page. Expanding never re-runs the tool. ([#79](https://github.com/eknowledger/toolbench/issues/79))

  ```html
  <tool-host
    tool="percentiles"
    mode="embed"
    parts="1"
    more="expand"
  ></tool-host>
  ```

  `more` defaults to `link`, so nothing changes unless you opt in.

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

- [#95](https://github.com/eknowledger/toolbench/pull/95) [`8cfeec4`](https://github.com/eknowledger/toolbench/commit/8cfeec4d684e62fb020784c5aff533c80fed773d) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: bar charts drew their first bar across the y axis.** The last bar hung off the right edge for the same reason. Bars now sit inside the plot, each filling its own share of the width. Line and area charts are unchanged.

- [#65](https://github.com/eknowledger/toolbench/pull/65) [`2e93266`](https://github.com/eknowledger/toolbench/commit/2e932660a52d305d6af8781cba49132dfc878f06) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **Fixed: two accessibility defects on cards.** ([#64](https://github.com/eknowledger/toolbench/issues/64))

  - A closed card's accessible name now includes its visible "Try it" / "Open this tool" hint, so speech input matching what is on screen works (WCAG 2.5.3).
  - The title link's hit target is at least 24px tall rather than the height of the text (WCAG 2.5.8).

- [#92](https://github.com/eknowledger/toolbench/pull/92) [`7ebf2da`](https://github.com/eknowledger/toolbench/commit/7ebf2daa88a0d55f463fe605b523f5e273882e9d) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: changing an attribute no longer wipes the result.** Setting `parts` or `mode` after a run used to empty the output. On a card with a seed it was worse: it silently reverted to the seeded default while the reader's own inputs stayed in the form. ([#79](https://github.com/eknowledger/toolbench/issues/79))

  A repaint now redraws whatever was on screen, including an error or a partial result. The seed is only used for a tool that has not produced anything yet.

- [#55](https://github.com/eknowledger/toolbench/pull/55) [`8631f93`](https://github.com/eknowledger/toolbench/commit/8631f938338410e21b03beead95765f0a30d8144) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **Fixed: the "inputs changed" cue on Run no longer looks like keyboard focus.** It was a ring, which is the visual language of `:focus-visible`; it is now a darker fill. ([#43](https://github.com/eknowledger/toolbench/issues/43))

- Updated dependencies [[`2e93266`](https://github.com/eknowledger/toolbench/commit/2e932660a52d305d6af8781cba49132dfc878f06), [`08febf0`](https://github.com/eknowledger/toolbench/commit/08febf06db3c312115bca2c6ac9c1e2d9441c7ff), [`f0cfb36`](https://github.com/eknowledger/toolbench/commit/f0cfb36044b52a168073c22ad9577b6dd5aadf00), [`68d037a`](https://github.com/eknowledger/toolbench/commit/68d037ae544827966766707031689bfdbb32e1fd), [`8631f93`](https://github.com/eknowledger/toolbench/commit/8631f938338410e21b03beead95765f0a30d8144), [`1b526d2`](https://github.com/eknowledger/toolbench/commit/1b526d2d34ecd20a5008bb869be5b2ba83720d94), [`fdd87df`](https://github.com/eknowledger/toolbench/commit/fdd87df85a9789c9e300f2df1205ac89cb65f408)]:
  - @toolbench/sdk@0.6.0

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

### Patch Changes

- Updated dependencies [[`65dd2b0`](https://github.com/eknowledger/toolbench/commit/65dd2b0fcdcfdcd81651e48a73441e669e4eafcd)]:
  - @toolbench/sdk@0.5.0

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

### Patch Changes

- Updated dependencies [[`dc13784`](https://github.com/eknowledger/toolbench/commit/dc13784af5759a5c651f98d06ba142c36f2889a2)]:
  - @toolbench/sdk@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`725e880`](https://github.com/eknowledger/toolbench/commit/725e880295f99c74e8810183ba99575e6be8f0bb), [`93d319b`](https://github.com/eknowledger/toolbench/commit/93d319b6601384205951231d01b79c5b45ff34b1)]:
  - @toolbench/sdk@0.3.0

## 0.2.0

### Minor Changes

- [#30](https://github.com/eknowledger/toolbench/pull/30) [`d5135ad`](https://github.com/eknowledger/toolbench/commit/d5135ad8ca2c96f41d16a46f99b6a1c23b3bee3a) Thanks [@eknowledger](https://github.com/eknowledger)! - Contract version 2 adds the `bytes` output kind, for wire formats and hex dumps: offsets, hex, a printable gutter, and named highlight ranges that can start mid-row and wrap. A `table` could approximate this but gets alignment and spanning wrong, and has nowhere to put a range that crosses rows.

  Tools declaring `"sdk": 1` are unaffected and need no change. Raising the contract version is a minor bump, never a major one, because contract changes are additive by policy.

### Patch Changes

- Updated dependencies [[`d5135ad`](https://github.com/eknowledger/toolbench/commit/d5135ad8ca2c96f41d16a46f99b6a1c23b3bee3a)]:
  - @toolbench/sdk@0.2.0

## 0.1.1

### Patch Changes

- [#26](https://github.com/eknowledger/toolbench/pull/26) [`aeb5c50`](https://github.com/eknowledger/toolbench/commit/aeb5c5011948798210d5f059aa66e7a9364aff40) Thanks [@eknowledger](https://github.com/eknowledger)! - Published source maps now contain their sources. Previously the maps referenced `../src/*.ts`, which `files: ["dist"]` never shipped, so anyone stepping into either package in a debugger got a map pointing at nothing. Sources are embedded with `inlineSources`, so the maps are self-contained.

- Updated dependencies [[`aeb5c50`](https://github.com/eknowledger/toolbench/commit/aeb5c5011948798210d5f059aa66e7a9364aff40)]:
  - @toolbench/sdk@0.1.1
