# @toolbench/sdk

## 0.15.0

### Minor Changes

- [#274](https://github.com/eknowledger/toolbench/pull/274) [`9b80d10`](https://github.com/eknowledger/toolbench/commit/9b80d107096d8c7a04be0ff6392a9c63df44f533) Thanks [@eknowledger](https://github.com/eknowledger)! - **Changed: Smaller pages.** Tools checked at build time no longer ship the manifest checker to readers. ([#259](https://github.com/eknowledger/toolbench/issues/259)) <!-- whats-new: docs=docs-ref-host.html#registrysource -->
  
  - With Vite, add `toolbench()` from `@toolbench/runtime/vite`. With any other bundler, or none, run `npx toolbench-manifests <dir> --out <dir>` and pass its `registry` to `RegistrySource`.
  - A bad manifest fails the build, naming the file and the field. In `vite dev` it shows in Vite's error overlay.
  - The runtime a minimal Vite host loads falls from 26.8 KB to 19.5 KB gzipped, and is 19.8 KB with the rest of 0.15.0.
  - Measured in Chrome at a 100 ms round trip: the project site's landing page loads 6.6 KB less before its first paint (50,084 to 43,441 gzipped bytes) and paints as soon as before.
  - `source.manifest(id)` answers as soon as the source is built, when every manifest was checked at build time.
  
  ⚠️ **Heads-up:** without the plugin or the command, manifests are checked in the browser by a chunk the source fetches on its first `list()`, and a page paints about 110 ms later than before, for 0.9 KB more in total. For manifests that come from a server, add `toolbench({ preloadValidation: true })`, or a `<link rel="modulepreload">` for `@toolbench/runtime/validation`. `new RegistrySource()` no longer throws on a bad manifest: `list()` and `load()` reject with the `ManifestError`, and every `<tool-host>` on the page shows it.

- [#254](https://github.com/eknowledger/toolbench/pull/254) [`d209839`](https://github.com/eknowledger/toolbench/commit/d209839d1702df2f4d41fe65ce63312c393a2a02) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Colour input.** A `color` input is a hex box with the system's colour picker beside it, kept in step. ([#203](https://github.com/eknowledger/toolbench/issues/203)) <!-- whats-new: gallery=native-inputs docs=docs-ref-inputs.html#color -->
  
  `run` gets a lowercase `#rrggbb`, with no alpha and no shorthand. What a reader types is trimmed and lowercased, and anything else is refused on the input before `run`.
  
  - Contract version 9.

- [#253](https://github.com/eknowledger/toolbench/pull/253) [`62517ad`](https://github.com/eknowledger/toolbench/commit/62517ad385c13895608f85d3119a792439672873) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Date input.** A `date` input is the browser's own picker for a day, a time of day, or both. ([#203](https://github.com/eknowledger/toolbench/issues/203)) <!-- whats-new: gallery=native-inputs docs=docs-ref-inputs.html#date -->
  
  `mode` is `date`, `time` or `datetime`, and `run` gets `YYYY-MM-DD`, `HH:MM` or `YYYY-MM-DDTHH:MM`. A value that does not parse, or is outside `min..max`, is refused on the input before `run`, with a message naming it. `inputProblem` in `@toolbench/sdk` is that check.
  
  - Contract version 9.
  - Samples and presets are checked the same way.
  
  **Fixed: Dates in error messages.** A date in an error message no longer breaks across two lines on a phone.

- [#256](https://github.com/eknowledger/toolbench/pull/256) [`ccb58ef`](https://github.com/eknowledger/toolbench/commit/ccb58efb0828b64c89099839ed37bc70bb8b6aec) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Multiselect.** A `multiselect` input lets a reader choose several options, and `run` gets them as a `string[]`. ([#204](https://github.com/eknowledger/toolbench/issues/204)) <!-- whats-new: gallery=multiselect docs=docs-ref-inputs.html#multiselect -->
  
  Up to six options are checkboxes and more are chips; `control` picks either. `min` and `max` bound the list, and Run below `min` is refused with a message under the input. Samples, presets and cases give the list as a JSON array, and a shared link repeats the key once per choice.
  
  ⚠️ **Heads-up:** `InputValues` can now hold a `string[]`. Host code that assumes every `host.values` entry is a string, a number or a boolean, such as `String(value)` into a query string, may need updating.
  
  **New: Errors under their input.** An error that names an input is now shown under that input, after the field's name. <!-- whats-new: docs=docs-authoring.html#6-errors -->
  
  **Fixed: Toggle colour.** A toggle's checkbox is drawn in the accent colour instead of the browser's own blue.

- [#257](https://github.com/eknowledger/toolbench/pull/257) [`c0a57d0`](https://github.com/eknowledger/toolbench/commit/c0a57d0e4d8e1471379b2e0e82ed7dc5536f085e) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Rows input.** A `rows` input is a list the reader adds to, removes from and reorders, and `run` gets a `Row[]`. ([#204](https://github.com/eknowledger/toolbench/issues/204)) <!-- whats-new: gallery=rows docs=docs-ref-inputs.html#rows -->
  
  Up to four columns, each a text, number, select or toggle. `maxRows` is required and `minRows` is optional. A row moves with the arrow keys on its handle or by dragging it, and each change is announced. An error can name a row with `row`, and is shown under that row.
  
  - A link carries rows as one key per column, and leaves out its largest lists when it would pass 2,000 characters, saying which.
  - The list is a chunk of its own, fetched only by a tool that has one.
  
  ⚠️ **Heads-up:** `InputValues` can now hold a `Row[]`. Host code that assumes every `host.values` entry is a string, a number or a boolean may need updating.
  
  **New: Rate limits example.** The `rate-limits` tool matches requests against an ordered list of path limits, for the methods you choose. <!-- whats-new: gallery=tool-rate-limits -->

- [#255](https://github.com/eknowledger/toolbench/pull/255) [`e7a3384`](https://github.com/eknowledger/toolbench/commit/e7a3384604dacc0810a3bdc7f8f66c96486d3e58) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Secret input.** A `secret` input is a password field with a button to show it, kept out of links. ([#203](https://github.com/eknowledger/toolbench/issues/203)) <!-- whats-new: gallery=native-inputs docs=docs-ref-inputs.html#secret -->
  
  It has no `default`, and a sample or a preset that sets it is refused, so a token never ships in a manifest. A link neither carries it nor fills it unless it says `"share": true`. `minLength` refuses a shorter value before `run`.
  
  - Contract version 9.
  - Do not return its value in a result: a result is on screen, announced, and in the `tool-run` event.

- [#252](https://github.com/eknowledger/toolbench/pull/252) [`fa7a346`](https://github.com/eknowledger/toolbench/commit/fa7a3468c2c522c0264ad602f00f6818be9fddb6) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Segmented select.** `"control": "segmented"` draws a select's options as one row of native radio segments. ([#203](https://github.com/eknowledger/toolbench/issues/203)) <!-- whats-new: gallery=native-inputs docs=docs-ref-inputs.html#select -->
  
  The chosen option is filled with the accent, and the row becomes stacked radios when a label would not fit. A reader tabs in once and picks with the arrow keys. `run` gets the option value, as from a dropdown.
  
  - Contract version 9. A select with no `control` is still a dropdown.
  - The controls are a chunk of their own, fetched only by a tool that has one.

### Patch Changes

- [#277](https://github.com/eknowledger/toolbench/pull/277) [`99f7082`](https://github.com/eknowledger/toolbench/commit/99f7082e98c7f5a3ee57aa80ede825ad36c685da) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: Numbers out of range.** A number outside its range is marked as it is typed, and Run refuses it instead of clamping. ([#262](https://github.com/eknowledger/toolbench/issues/262)) <!-- whats-new: docs=docs-ref-inputs.html#number -->
  
  The box keeps what the reader typed, with "Arrival rate must be between 1 and 5000, got 99999." under it, and the share link carries that value, so the link opens marked the same way. An emptied box is refused too, where it used to run on the min. `inputProblem` reports both. A host's `values` write is still clamped.
  
  ⚠️ **Heads-up:** reading `values` while a reader's number is out of range gives that number, and an empty or unreadable box gives its text, a string.

- [#277](https://github.com/eknowledger/toolbench/pull/277) [`99f7082`](https://github.com/eknowledger/toolbench/commit/99f7082e98c7f5a3ee57aa80ede825ad36c685da) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: Rows number cells.** A rows number cell out of range, or emptied, is refused under its row instead of clamped. ([#262](https://github.com/eknowledger/toolbench/issues/262)) <!-- whats-new: gallery=tool-rate-limits docs=docs-ref-inputs.html#rows -->
  
  Typing 9999999 into a cell declared 1 to 10000 ran on 10000, and an emptied cell ran on the number it held before. Run now shows "Limits, row 2: Limit must be between 1 and 10000, got 9999999." under the row, and a link carries the cell as written.

## 0.14.0

### Minor Changes

- [#238](https://github.com/eknowledger/toolbench/pull/238) [`7d54382`](https://github.com/eknowledger/toolbench/commit/7d54382e2d9d640d2ee4d5fab64467168652393a) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Text face on a field.** `mono: false` sets a field's value in the text face instead of monospace. <!-- whats-new: docs=docs-ref-results.html#field -->
  
  For a sentence or a plain number beside an address in the same list, the value and its note are drawn in the text face. Otherwise the field's `<dd>` carries `.tb-mono`, the same class a table cell uses. ([#209](https://github.com/eknowledger/toolbench/issues/209))
  
  - Contract version 8. A field with no `mono` is drawn exactly as before.

- [#244](https://github.com/eknowledger/toolbench/pull/244) [`f2e7ab1`](https://github.com/eknowledger/toolbench/commit/f2e7ab1c13a7556b699760fd431a8330f40364a2) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: More help behind a disclosure.** `details` on an input puts the rest of its help behind a "More", closed until opened. <!-- whats-new: gallery=input-details docs=docs-ref-inputs.html#common-attributes -->
  
  `details` on an input puts the rest of its help in a native disclosure under the one-line `description`, closed until the reader opens it. It takes the same markup as a description. ([#215](https://github.com/eknowledger/toolbench/issues/215))
  
  - A screen reader on the control still hears only the description.
  - Contract version 8.

- [#240](https://github.com/eknowledger/toolbench/pull/240) [`e3cfb54`](https://github.com/eknowledger/toolbench/commit/e3cfb54524ad5fa4f0b2cf46441b91ae2b140e12) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Style one input at a time.** Each input row names its input, its type and its role, and four new properties recolour it. <!-- whats-new: gallery=input-styles docs=docs-ref-tokens.html#tokens -->
  
  Each input's `.tb-field-row` now carries `data-input` (its id), `data-type`, and `data-role` when the manifest gives the input a `role`. The form reads four new properties, `--tb-input-bg`, `--tb-input-border`, `--tb-input-fg` and `--tb-desc-fg`, so setting one on a row recolours only that input. ([#224](https://github.com/eknowledger/toolbench/issues/224))
  
  - `role` on an input is contract version 8. The attributes and properties need no contract change.
  - The properties default to today's colours, so nothing changes unless you set them.

- [#239](https://github.com/eknowledger/toolbench/pull/239) [`bcd9612`](https://github.com/eknowledger/toolbench/commit/bcd9612a8e1511b1b67e1c4082eda9f8aa2042f9) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Inputs kept out of links.** `"share": false` on an input tells a host's links to leave it out. <!-- whats-new: docs=docs-ref-inputs.html#common-attributes -->
  
  A host building a shareable link from `host.values` leaves that input out and does not read it back, for a password or pasted private material. ([#211](https://github.com/eknowledger/toolbench/issues/211))
  
  - Contract version 8. Without `share`, an input is shareable, as before.
  - A hint for hosts, not access control: the runtime builds no links and enforces nothing. `shareableInputs(manifest)` in `@toolbench/sdk` lists the inputs a link may carry.

- [#245](https://github.com/eknowledger/toolbench/pull/245) [`97c0af5`](https://github.com/eknowledger/toolbench/commit/97c0af524c1cd91cda7cc759c16581965af08ad0) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Reset off for a tool.** `"reset": false` in a manifest leaves the Reset button out. <!-- whats-new: gallery=reset docs=docs-ref-manifest.html#manifest-attributes -->
  
  `"reset": false` at the top level of a manifest leaves Reset out, as `reset="none"` on the element does, for a tool with one input where it adds nothing. ([#208](https://github.com/eknowledger/toolbench/issues/208))
  
  - Contract version 8.

- [#242](https://github.com/eknowledger/toolbench/pull/242) [`f4fddb8`](https://github.com/eknowledger/toolbench/commit/f4fddb8bbe818f0b902a597f4d9da351c0cebf42) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Tables that work on a phone.** A table keeps its columns and scrolls on a narrow screen, with the row name kept in view. <!-- whats-new: gallery=table-wrap docs=docs-ref-results.html#column label="Changes a default" -->
  
  `rowHeader: true` on a table column renders its cells as `<th scope="row">`, so a screen reader names the row with every cell. A table whose columns say `wrap` now has a narrow layout built in: under 34rem it keeps its columns and scrolls, tokens on one line, prose at a reading width, the row header in view. ([#214](https://github.com/eknowledger/toolbench/issues/214))
  
  - Any table that scrolls shows a shadow at the edge with more to see. A table that fits looks as before.
  - Contract version 8. A table with no `wrap` and no `rowHeader` keeps its layout.
  - ⚠️ Heads-up: the cells of a `rowHeader` column are no longer `td`, so a host selector such as `td:first-child` stops matching them. It is opt-in per column.

- [#241](https://github.com/eknowledger/toolbench/pull/241) [`02cc7e3`](https://github.com/eknowledger/toolbench/commit/02cc7e367ceac3b5d188deda373d5450aa9489c6) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Column wrapping.** A table column can say whether it holds sentences or short tokens. <!-- whats-new: gallery=table-wrap docs=docs-ref-results.html#column -->
  
  `wrap: "prose"` or `wrap: "none"` on a column, or on one cell, is written as `data-wrap` on the header and cells, so a narrow layout can keep short tokens on one line and give sentences a reading width. ([#213](https://github.com/eknowledger/toolbench/issues/213))
  
  - Contract version 8. A column with no `wrap` renders exactly as before.

## 0.13.0

No changes in this release.

## 0.12.0

### Patch Changes

- [#206](https://github.com/eknowledger/toolbench/pull/206) [`0b9a386`](https://github.com/eknowledger/toolbench/commit/0b9a3866c577274158f0ef0e60b39479107ddf79) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Hover help.** Your editor describes every input, result and manifest attribute on hover. <!-- whats-new: docs=docs-ref-inputs.html -->
  
  Every input attribute in the type declarations now has its own description, which an editor shows on hover and the site's Inputs reference is generated from. No behaviour changes.

- [#206](https://github.com/eknowledger/toolbench/pull/206) [`0b9a386`](https://github.com/eknowledger/toolbench/commit/0b9a3866c577274158f0ef0e60b39479107ddf79) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Hover help.** Your editor describes every input, result and manifest attribute on hover. <!-- whats-new: docs=docs-ref-inputs.html -->
  
  The manifest, `links`, and fixture `Case` attributes that had no description in the type declarations now have one, shown by an editor on hover and on the site's Manifest reference. No behaviour changes.

- [#206](https://github.com/eknowledger/toolbench/pull/206) [`0b9a386`](https://github.com/eknowledger/toolbench/commit/0b9a3866c577274158f0ef0e60b39479107ddf79) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Hover help.** Your editor describes every input, result and manifest attribute on hover. <!-- whats-new: docs=docs-ref-inputs.html -->
  
  Every result attribute in the type declarations now has its own description, which an editor shows on hover and the site's Results reference is generated from. The `TreemapNode.value` description no longer says a branch's own value overrides its children's sum: the runtime always draws the sum. No behaviour changes.

## 0.11.0

No changes in this release.

## 0.10.1

No changes in this release.

## 0.10.0

### Minor Changes

- [#181](https://github.com/eknowledger/toolbench/pull/181) [`dde82c6`](https://github.com/eknowledger/toolbench/commit/dde82c61e23eb4624304e1f92305b20557c06b87) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Graphs.** Return nodes and edges, and the runtime lays them out and draws them. <!-- whats-new: gallery=graph-flowchart docs=docs-ref-results.html#graph shot=graph -->
  
  ([#152](https://github.com/eknowledger/toolbench/issues/152)) A tool can return `{ kind: "graph", graph }`, nodes and edges, and the runtime lays it out and draws it: ranks along a direction, ports centred on the side facing the other end, orthogonal edges that never share a stretch of line, labels clear of everything, and the same picture in every browser. Every edge is also listed in a table under the picture, and the picture is one tab stop that follows the edges with the arrow keys.
  
  * Nodes take a label, a note, a shape, a tone or colour, a badge and a fixed rank; edges a label, a line style and width, markers, and a side to leave or arrive on. A path can be highlighted, and a tool can set its own `limits`, past which the graph is listed instead of drawn.
  * The graph kind is a chunk of its own, fetched only by a page that draws a graph.
  * This raises the contract to version 7: a tool returning a graph declares `"sdk": 7`, and every older manifest loads unchanged. `graphProblem` in the SDK checks a graph's structure, and the fixture runner fails a case whose graph the runtime would refuse.

- [#193](https://github.com/eknowledger/toolbench/pull/193) [`10678a9`](https://github.com/eknowledger/toolbench/commit/10678a9872cf10465c7ee11fd1774e22cc7d0451) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Textarea grammar.** A tool can highlight its own notation, with no highlighter on the page. <!-- whats-new: gallery=grammar-input docs=docs-ref-inputs.html#grammar-attributes shot=grammar -->
  
  ([#163](https://github.com/eknowledger/toolbench/issues/163)) Beside `lang`, a textarea's `grammar` lists `keywords`, a `comment` prefix, `operators` and `strings` delimiters, and the runtime paints what the reader types with them, so a notation no host highlighter knows is highlighted anyway.
  
  - No patterns: a tool cannot ship a regular expression that freezes the page, any other key is refused, and every list is capped.
  - A host `highlight` hook that paints the `lang` still wins. The paint is the same as `lang`'s: behind the real textarea, `aria-hidden`, so the caret, selection, undo and screen reader are the browser's own.
  - The tokeniser is in the lazily fetched paint chunk, now about 1.5 KB, which a tool with a grammar fetches even on a host with no hook. Contract version 7.

- [#192](https://github.com/eknowledger/toolbench/pull/192) [`31d4db5`](https://github.com/eknowledger/toolbench/commit/31d4db5dd1a1d6c867e41a91f1a5b7c221ce2f78) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: Version check.** A tool using a feature newer than its declared `sdk` is refused, with a message saying why. <!-- whats-new: gallery=refused docs=docs-versioning.html label="May refuse a tool" -->
  
  ([#170](https://github.com/eknowledger/toolbench/issues/170)) A manifest declaring `"sdk": 4` that used v6's `lang` used to validate, and a v4 runtime then loaded it and silently dropped the highlighting. Now it is refused: `inputs[0].lang: is from contract version 6, but the tool declares "sdk": 4 ... Declare "sdk": 6.`
  
  - `upgradeManifest` checks before it stamps the current version, so every path that loads a manifest refuses, a host's own included. `validateManifest` checks a manifest validated as written. The `@toolbench/sdk/fixtures` harness also checks every case's expected output and every sample's result.
  - New: `checkManifestFeatures(raw)` and `outputFeatureProblem(output, sdk)`, the same checks on their own.
  - ⚠️ Heads-up: a manifest that under-declares its `sdk` now fails to load. Raise its `sdk` to the version the message names. Every tool and fixture in this repository already declared enough.

### Patch Changes

- [#186](https://github.com/eknowledger/toolbench/pull/186) [`f88acbe`](https://github.com/eknowledger/toolbench/commit/f88acbec9fa7c89be2b88ce9858ea25995b13073) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: Plain wording.** Status lines and messages no longer use em dashes. <!-- whats-new: label="Wording changed" -->
  
  ([#42](https://github.com/eknowledger/toolbench/issues/42))
  
  - The status line now reads "inputs changed. Press Run", "filled with "…". Press Run" and "showing the default result. Press Run to try your own".
  - A bytes legend entry reads "U+00E9 é: 2 bytes at 0x0001".
  - A missing value in a chart's data table, readout or share reads "n/a".
  - Validation messages use a colon where they used an em dash.
  - The example tools' own wording changed too, so their output did: `percentiles` 1.3.0 ("No measurements yet. Paste some numbers.", and its notes on the mean and the averaged p99) and `queue-explorer` 1.1.0 ("...no steady state to report. Lower the arrival rate or speed up service."). Minor versions, because a consumer could match on that output.
  - ⚠️ Heads-up: a host or a test matching any of these strings exactly needs the new wording.

## 0.9.1

### Patch Changes

- [#180](https://github.com/eknowledger/toolbench/pull/180) [`7f3b459`](https://github.com/eknowledger/toolbench/commit/7f3b4590fe04a3078eb3db5cc00c4af5d8bddd2e) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: Safe manifest links.** A manifest link that is not http, https or mailto is refused, and drawn as plain text. <!-- whats-new: docs=docs-security.html label="May refuse a tool" -->
  
  `links[].href` was checked only as a string and written straight into `<a href>`, so a manifest carrying `javascript:...` rendered a link that ran in the host's origin when a reader followed it. The validator now refuses a link that does not resolve to `http`, `https` or `mailto`, or that contains a space or a control character, and the element renders such a link as plain text even from a source that never validated. The check asks the browser's own URL parser for the scheme, because the parser strips tab and newline before reading it and a pattern on the text can be walked past.
  
  **Fixed: Code result classes.** A code result's `lang` can no longer add a class of its own. <!-- whats-new: gallery=code-result docs=docs-security.html -->
  
  `lang` was written into `class="language-<lang>"`, and a class attribute is a list, so `json tb-hidden` put a class of the tool's choosing on the element. The class is now written only when `lang` is a single language name.
  
  ⚠️ **Heads-up:** validation is narrower. A manifest whose link has a space in it, or another scheme such as `ftp:`, was accepted before and is now refused with the field named. Encode the space as `%20`.

## 0.9.0

### Minor Changes

- [#171](https://github.com/eknowledger/toolbench/pull/171) [`a2b3c13`](https://github.com/eknowledger/toolbench/commit/a2b3c13fe00972c37debaacd318236666841476d) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Presets on a select.** Choosing an option can fill other inputs with that option's values. <!-- whats-new: gallery=presets docs=docs-authoring.html#4c-presets-on-a-select shot=presets -->
  
  ([#151](https://github.com/eknowledger/toolbench/issues/151)) A select option can carry `sets`, the values it writes into other inputs when it is chosen, so a "Library" select can fill the read timeout and retries with that library's defaults for the reader to edit. Choosing one behaves like a sample: the result goes stale and the status line names it. The select then follows the form: once the values stop matching it, it shows the preset they do match, or the first option with no `sets`, and says so. A host writing the select through `values` fills nothing. `sets` is validated like a sample's `input`, may not name its own select or another preset select, must differ between options, and on the default option must equal those inputs' defaults. The sample range message now reads "fix the value" rather than "fix the example". This raises the contract to version 6: a tool using `sets` declares `"sdk": 6`, and every older manifest loads unchanged.

- [#173](https://github.com/eknowledger/toolbench/pull/173) [`f6a085a`](https://github.com/eknowledger/toolbench/commit/f6a085a40402c84240e1045e8b7ffba65a4f3fb0) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Highlighted textareas.** What a reader types is painted by the page's own highlighter. <!-- whats-new: gallery=highlighted-input docs=docs-ref-inputs.html#textarea -->
  
  ([#153](https://github.com/eknowledger/toolbench/issues/153)) A `textarea` input can declare `lang`, and a host that passes `highlight` to `defineToolHost` paints what the reader types with the same hook `code` results use. The paint sits behind the real textarea, `aria-hidden`, with the same box and font, so the caret, selection, undo, paste and screen reader stay the browser's own. It catches up 250 ms after typing stops and is skipped past 20,000 characters. A missing hook, a hook that throws, or a hook whose text differs from the source leaves the plain textarea. Its code is a chunk of its own, about 1 KB gzipped, fetched only by a tool that declares `lang` on a host with a hook. `lang` is refused on any other input type.

## 0.8.0

### Minor Changes

- [#164](https://github.com/eknowledger/toolbench/pull/164) [`feb84cb`](https://github.com/eknowledger/toolbench/commit/feb84cb14be46a8cc9905a17e44d09f185c8fdab) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Your own CSS.** Pass stylesheets to `defineToolHost` and they style every tool. <!-- whats-new: gallery=host-styles docs=docs-styling.html label="Changes style order" -->
  
  Pass `styles` to `defineToolHost` and the runtime adopts
  your sheets into every tool's shadow root, after its own. Any rule of yours outside a CSS layer wins,
  whatever its specificity. `setHostStyles()` swaps them on every tool without a reload. The class names
  and attributes you can rely on are listed in STYLING.md, with four worked examples.
  ([#157](https://github.com/eknowledger/toolbench/issues/157))
  
  - Every result part now carries `data-kind`, and every table cell `data-label` with its column's name.
  - Contract version 5: a tool can name any part or field with `role`, rendered as `data-role`, and mark a
    field or cell `tone: "muted"`.
  - **Fixed:** a `good` table cell is now green, like a `good` field
    ([#156](https://github.com/eknowledger/toolbench/issues/156)), and a wide result no longer clips its
    whole tool on a narrow screen; it scrolls inside its own box
    ([#154](https://github.com/eknowledger/toolbench/issues/154)).
  - ⚠️ Heads-up: the runtime's rules now sit in `@layer toolbench`. If your page already adopts a sheet
    into a tool's shadow root, its unlayered rules now win over the runtime's even where they are less
    specific.

- [#165](https://github.com/eknowledger/toolbench/pull/165) [`024405a`](https://github.com/eknowledger/toolbench/commit/024405a4eb68e03bffa8928377f1fe294d98b89d) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Link to one part.** `host.reveal(id)` opens, scrolls to and focuses one part of a result. <!-- whats-new: gallery=reveal docs=docs-ref-host.html#properties-and-methods -->
  
  Give a part an `id` and call `host.reveal(id)`: the runtime
  opens a closed card, shows the part if `parts` or `more` hid it, scrolls to it and moves focus there.
  It resolves `false` for an id the result does not have.
  ([#147](https://github.com/eknowledger/toolbench/issues/147))
  
  - The `id` is rendered as `data-part`, and fixtures fail if a result uses one id twice.

## 0.7.0

### Minor Changes

- [#133](https://github.com/eknowledger/toolbench/pull/133) [`618c06d`](https://github.com/eknowledger/toolbench/commit/618c06d1167f3da47c765e8b0f116445a3d416fe) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Chart readouts.** Hover or use the arrow keys to read every series' value at a point. <!-- whats-new: gallery=chart-lines docs=docs-ref-results.html#readout -->
  
  ([#112](https://github.com/eknowledger/toolbench/issues/112))
  
  - Pointing at a chart snaps to the nearest x, draws a crosshair and shows a card of every series' value there. Tab to a chart and the arrow keys step through it, with each card read out to screen readers.
  - A tool can say what a point means: `readout.titles` for a heading per x, `series.notes` for the text of one value, `readout.mode` and `readout.crosshair` to shape or turn it off.
  - Whole numbers now print without decimals in charts and their data tables: frame 6, not 6.00.

- [#135](https://github.com/eknowledger/toolbench/pull/135) [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Heatmaps.** A value over two dimensions, drawn as coloured cells with a key. <!-- whats-new: gallery=chart-heatmap docs=docs-ref-results.html#heatmap shot=heatmap -->
  
  ([#121](https://github.com/eknowledger/toolbench/issues/121)) A `heatmap` output draws a value over two dimensions as coloured cells, sequential (one hue) or diverging (two hues around a midpoint), with a key, hatched cells where there is no value, and a readout the arrow keys move through. Its code is fetched only by pages that draw one; theme the colours with `--tb-heat-lo`, `--tb-heat-hi`, `--tb-heat-neg`, `--tb-heat-mid` and `--tb-heat-pos`.

- [#135](https://github.com/eknowledger/toolbench/pull/135) [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Pie and donut charts.** Parts of a whole, every slice labelled with its share. <!-- whats-new: gallery=chart-pie docs=docs-ref-results.html#pie -->
  
  ([#123](https://github.com/eknowledger/toolbench/issues/123)) A `pie` output draws parts of a whole in the order given, from 12 o'clock clockwise, every slice labelled with its share. More than six parts fold into "Other", a negative or zero total draws a message instead, and `donut: true` shows the total in the centre. Its code is fetched only by pages that draw one.

- [#132](https://github.com/eknowledger/toolbench/pull/132) [`d09bca0`](https://github.com/eknowledger/toolbench/commit/d09bca0a311821f7126861dbe60f0a618732fea5) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Slider.** A number input can have a slider beside its box. <!-- whats-new: gallery=slider docs=docs-ref-inputs.html#number -->
  
  ([#102](https://github.com/eknowledger/toolbench/issues/102))
  
  `"control": "slider"` on a number input draws a range control beside its number box, so a reader can sweep a value and watch the answer follow (with `autoRun`). The box stays editable for exact values, and the slider honours `min`, `max` and `step`.
  
  Contract version 4. A tool uses it with `"sdk": 4`; a runtime that predates it shows the number box alone.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Bands.** Fill the range between two edges, such as p5 to p95 around a median. <!-- whats-new: gallery=chart-band docs=docs-ref-results.html#series-1 -->
  
  ([#119](https://github.com/eknowledger/toolbench/issues/119)) `shape: "band"` with a `lower` edge fills the range between two edges, a p5 to p95 spread around a median say, beneath every other series. The readout reads it as "29 to 35 ms", and the data table shows both edges.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Box plots.** Whiskers, quartiles, the median and outliers, from a summary the tool computes. <!-- whats-new: gallery=chart-box docs=docs-ref-results.html#series-1 -->
  
  ([#122](https://github.com/eknowledger/toolbench/issues/122)) `shape: "box"` with a `boxes` summary per x draws whiskers, the quartile box, the median and outliers, grouped like bars. The tool computes the summary, so the whiskers mean what the tool says; the readout and the data table list all five numbers.

- [#135](https://github.com/eknowledger/toolbench/pull/135) [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Bubble charts.** A third measure, drawn as each point's area. <!-- whats-new: gallery=chart-bubble docs=docs-ref-results.html#series-1 -->
  
  ([#127](https://github.com/eknowledger/toolbench/issues/127)) `sizes` on a points series draws a third measure as each bubble's area, scaled across the whole chart, with a key of reference sizes, the size in the readout and a size column in the data table.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Named categories.** A chart's x axis can be a list of names. <!-- whats-new: gallery=chart-stacked docs=docs-ref-results.html#chart -->
  
  ([#113](https://github.com/eknowledger/toolbench/issues/113))
  
  `x: ["Mesh", "MCU", "SFU"]` draws one evenly spaced slot per name, in the order given, labelled with the text. When the labels would collide, every second or third is shown; all of them are in the data table and the readout.
  
  - **Fixed:** a bar chart's axis always starts at zero, so a bar's length is its value.
  - **Fixed:** bars are capped in thickness, so a chart of a few categories draws bars rather than slabs.

- [#135](https://github.com/eknowledger/toolbench/pull/135) [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Exploded slices.** Pull one pie or donut slice out to point at it. <!-- whats-new: gallery=chart-donut docs=docs-ref-results.html#pie-1 -->
  
  ([#126](https://github.com/eknowledger/toolbench/issues/126)) `explode: true` on a slice pulls it out a little along its middle, to point at the one part the text is about. Its share is unchanged.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Horizontal bars.** One row per category, so long names sit beside their bars. <!-- whats-new: gallery=chart-horizontal docs=docs-ref-results.html#chart -->
  
  ([#116](https://github.com/eknowledger/toolbench/issues/116))
  
  `orientation: "horizontal"` draws one row per category with its bars growing rightward, so long names sit beside their bars. Grouping, stacking, thresholds (as vertical rules), the readout and the data table all work the same way; the chart grows taller with its rows.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Log scales.** An axis in powers of ten, for values spanning orders of magnitude. <!-- whats-new: gallery=chart-log docs=docs-ref-results.html#chart -->
  
  ([#118](https://github.com/eknowledger/toolbench/issues/118)) `yScale: "log"` and `xScale: "log"` draw an axis in powers of ten (0.1, 1, 10, 100, 1k), for values spanning orders of magnitude. Values a log axis cannot show (zero, negatives) are left out with a note in the data table, and bars are not drawn on a log y axis.

- [#132](https://github.com/eknowledger/toolbench/pull/132) [`d09bca0`](https://github.com/eknowledger/toolbench/commit/d09bca0a311821f7126861dbe60f0a618732fea5) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Chart markers.** Each series gets its own marker shape as well as its colour. <!-- whats-new: gallery=chart-lines docs=docs-ref-results.html#series-1 -->
  
  ([#111](https://github.com/eknowledger/toolbench/issues/111))
  
  - `markers: true` on a `line` or `area` series draws a marker at every point; `shape: "points"` draws the points with no line between them.
  - Each series gets its own marker shape as well as its colour, so series with equal values stay distinguishable, and the legend keys each one by its marker.
  
  Contract version 4. A tool uses these with `"sdk": 4`; existing tools are unaffected.

- [#135](https://github.com/eknowledger/toolbench/pull/135) [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Mirrored bars.** Back-to-back horizontal bars, for pyramids and comparisons. <!-- whats-new: gallery=chart-pyramid docs=docs-ref-results.html#chart -->
  
  ([#125](https://github.com/eknowledger/toolbench/issues/125)) `mirror: true` on a horizontal chart draws negative values to the left and labels every number, on the axis, in the readout and in the table, as its magnitude.

- [#136](https://github.com/eknowledger/toolbench/pull/136) [`b74570a`](https://github.com/eknowledger/toolbench/commit/b74570a82998544a917e24fd82d785d9ee605a91) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Radar charts.** A profile across several measures, one spoke each. <!-- whats-new: gallery=chart-radar docs=docs-ref-results.html#radar -->
  
  ([#128](https://github.com/eknowledger/toolbench/issues/128)) A `radar` output draws a profile across several measures, one spoke each from 12 o'clock, on a shared scale from zero or each axis's own maximum, with round-valued rings, markers on every vertex and a readout that steps spoke by spoke.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Scatter plots.** Each series can carry its own x values. <!-- whats-new: gallery=chart-scatter docs=docs-ref-results.html#series-1 -->
  
  ([#120](https://github.com/eknowledger/toolbench/issues/120)) A series can carry its own `x` values, so measurements that share no x positions plot together. The readout snaps to the nearest point, with both crosshair lines, and the keyboard steps through the points left to right; the data table lists one row per point.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Stacked bars.** Bar series with the same `stack` id are drawn as one bar of parts. <!-- whats-new: gallery=chart-stacked docs=docs-ref-results.html#series-1 -->
  
  ([#115](https://github.com/eknowledger/toolbench/issues/115))
  
  Bar series with the same `stack` id are drawn as one bar of parts at each x, so a reader sees each part and the total: a delay budget stage by stage, traffic by protocol. Negative values stack below zero, plain bar series sit beside the stack, and the data table adds a total per stack.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Step lines.** A value that holds until it changes, drawn as flat runs. <!-- whats-new: gallery=chart-step docs=docs-ref-results.html#series-1 -->
  
  ([#117](https://github.com/eknowledger/toolbench/issues/117)) `shape: "step"` draws a value that holds until it changes, a buffer depth or a configured rate, as flat runs joined by straight risers instead of slopes.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Threshold lines.** A labelled, dashed rule across the plot at a limit. <!-- whats-new: gallery=chart-thresholds docs=docs-ref-results.html#chart -->
  
  ([#114](https://github.com/eknowledger/toolbench/issues/114))
  
  `thresholds: [{ y: 150, label: "150 ms budget", tone: "warn" }]` draws a labelled, dashed rule across the plot at that value. The scale widens to include it, and it stays out of the legend, the data table and the readout, because it is a limit rather than a measurement.

- [#136](https://github.com/eknowledger/toolbench/pull/136) [`b74570a`](https://github.com/eknowledger/toolbench/commit/b74570a82998544a917e24fd82d785d9ee605a91) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Treemaps.** A hierarchy of sizes, drawn as nested rectangles. <!-- whats-new: gallery=chart-treemap docs=docs-ref-results.html#treemap -->
  
  ([#129](https://github.com/eknowledger/toolbench/issues/129)) A `treemap` output draws a hierarchy of sizes as nested rectangles, squarified so they compare, groups in their own hue, labels where they fit and every node in the readout and the data table.

- [#136](https://github.com/eknowledger/toolbench/pull/136) [`b74570a`](https://github.com/eknowledger/toolbench/commit/b74570a82998544a917e24fd82d785d9ee605a91) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Venn diagrams.** Two or three sets, every region labelled with its count. <!-- whats-new: gallery=chart-venn-three docs=docs-ref-results.html#venn -->
  
  ([#130](https://github.com/eknowledger/toolbench/issues/130)) Two sets are drawn with exact areas; three are placed as closely as circles allow, with every region labelled by its count and the caption saying the areas are approximate. More sets, or numbers that cannot be true, draw a message.

- [#133](https://github.com/eknowledger/toolbench/pull/133) [`618c06d`](https://github.com/eknowledger/toolbench/commit/618c06d1167f3da47c765e8b0f116445a3d416fe) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Linked tables.** Pointing at a chart lights the matching table rows, and the other way round. <!-- whats-new: gallery=chart-linked docs=docs-ref-results.html#readout -->
  
  ([#124](https://github.com/eknowledger/toolbench/issues/124))
  
  - `readout.highlightTable: true` highlights the chart's own data-table row as the reader points along the chart.
  - A `table` part with `link: { chart, keys }` is linked to the chart with that `id`: pointing at the chart lights the matching rows, and pointing at a row moves the chart's readout there.

- [#137](https://github.com/eknowledger/toolbench/pull/137) [`3027d43`](https://github.com/eknowledger/toolbench/commit/3027d430e92ef15ecf1bef1d1bfbb937da911ad8) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: Misplaced manifest keys.** A key in the wrong object is refused, with where it belongs. <!-- whats-new: docs=docs-ref-manifest.html#validation-rules label="May refuse a tool" -->
  
  ([#87](https://github.com/eknowledger/toolbench/issues/87)) `timeoutMs` inside `runtime`, `thread` at the top level, or `autoRun` inside an input now fail validation with a message naming the right place.
  
  ⚠️ Heads-up: a manifest that relied on a misplaced key being ignored will now fail to validate. Unknown keys are still ignored.

## 0.6.0

### Minor Changes

- [#63](https://github.com/eknowledger/toolbench/pull/63) [`08febf0`](https://github.com/eknowledger/toolbench/commit/08febf06db3c312115bca2c6ac9c1e2d9441c7ff) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **New: Your own highlighter.** Pass `highlight` and every code result is painted with it. <!-- whats-new: gallery=code-result docs=docs-ref-host.html#options -->
  
  Pass `highlight` to `defineToolHost` and it is called with `(source, lang)` for every `code` result. ([#9](https://github.com/eknowledger/toolbench/issues/9))
  
  It must return a DOM `Node`, not a string, so the runtime never assigns `innerHTML`. Omit it and you still get readable preformatted text, and no highlighter is bundled.

- [#61](https://github.com/eknowledger/toolbench/pull/61) [`f0cfb36`](https://github.com/eknowledger/toolbench/commit/f0cfb36044b52a168073c22ad9577b6dd5aadf00) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **New: Fill a tool from your page.** Set `values` and call `run()` from buttons in your own markup. <!-- whats-new: docs=docs-ref-host.html#properties-and-methods -->
  
  `<tool-host>` gains a `values` setter and a `run()` method, so "try this example" buttons live in your own markup instead of inside every tool. ([#38](https://github.com/eknowledger/toolbench/issues/38))
  
  - `values` accepts a partial set and validates it the way typing does; it does not run the tool.
  - `run()` runs it. It leaves focus alone by default; `run({ focus: true })` moves focus to the result.
  - The matching `values` getter reads back what is in the form, for building a shareable URL.

- [#54](https://github.com/eknowledger/toolbench/pull/54) [`68d037a`](https://github.com/eknowledger/toolbench/commit/68d037ae544827966766707031689bfdbb32e1fd) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **New: Retired tools.** A retired or deprecated tool keeps its URL and says so. <!-- whats-new: gallery=lifecycle docs=docs-authoring.html#3b-retiring-a-tool label="May refuse a tool" -->
  
  `status: "retired"` or `"deprecated"` in a manifest is now honoured. ([#16](https://github.com/eknowledger/toolbench/issues/16))
  
  - **Retired** does not run. The page explains, and renders `links` as the way onward, so a bookmark is neither a 404 nor a silent run.
  - **Deprecated** still runs, with a marker you can style via `data-status` on `<tool-host>` and the `--tb-mark-*` tokens. It is not offered as a live card.
  
  ⚠️ **Heads-up:** a manifest combining `card: "live"` with a `status` of `deprecated` or `retired` is now refused at load. That pairing says two contradictory things, so this can only catch a mistake, but it is a rule an existing manifest could trip.

- [#59](https://github.com/eknowledger/toolbench/pull/59) [`1b526d2`](https://github.com/eknowledger/toolbench/commit/1b526d2d34ecd20a5008bb869be5b2ba83720d94) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **Fixed: Clearer sample errors.** Two samples that fill the same values are refused, and errors name both entries. <!-- whats-new: docs=docs-authoring.html#what-validation-will-hold-you-to label="May refuse a tool" -->
  
  Two samples that fill the same values are now refused even when their labels differ, and duplicate-label and duplicate-id errors name both colliding entries instead of only one. ([#41](https://github.com/eknowledger/toolbench/issues/41))
  
  ⚠️ **Heads-up:** a manifest with two identical samples loaded before and now fails at load.

- [#85](https://github.com/eknowledger/toolbench/pull/85) [`fdd87df`](https://github.com/eknowledger/toolbench/commit/fdd87df85a9789c9e300f2df1205ac89cb65f408) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: Smaller without charts.** The chart renderer is its own chunk, about 1.4 KB gzipped off the runtime. <!-- whats-new: docs=docs.html#size-and-cost -->
  
  The `series` chart renderer is now its own chunk, worth about 1.4 KB gzipped off the main runtime. ([#12](https://github.com/eknowledger/toolbench/issues/12))
  
  A page whose tool declares `series` in `kinds` fetches it before the first result, so nothing changes for you. A page with no chart tool never downloads it.

### Patch Changes

- [#65](https://github.com/eknowledger/toolbench/pull/65) [`2e93266`](https://github.com/eknowledger/toolbench/commit/2e932660a52d305d6af8781cba49132dfc878f06) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **Fixed: Card accessibility.** A card's name includes its visible hint, and its title link is at least 24px tall. <!-- whats-new: gallery=card-mode docs=docs.html#display-modes -->
  
  ([#64](https://github.com/eknowledger/toolbench/issues/64))
  
  - A closed card's accessible name now includes its visible "Try it" / "Open this tool" hint, so speech input matching what is on screen works (WCAG 2.5.3).
  - The title link's hit target is at least 24px tall rather than the height of the text (WCAG 2.5.8).

- [#55](https://github.com/eknowledger/toolbench/pull/55) [`8631f93`](https://github.com/eknowledger/toolbench/commit/8631f938338410e21b03beead95765f0a30d8144) Thanks [@dyk1454683243-sudo](https://github.com/dyk1454683243-sudo)! - **Fixed: Run cue.** The "inputs changed" cue on Run no longer looks like keyboard focus.
  
  It was a ring, which is the visual language of `:focus-visible`; it is now a darker fill. ([#43](https://github.com/eknowledger/toolbench/issues/43))

## 0.5.0

### Minor Changes

- [#51](https://github.com/eknowledger/toolbench/pull/51) [`65dd2b0`](https://github.com/eknowledger/toolbench/commit/65dd2b0fcdcfdcd81651e48a73441e669e4eafcd) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: More on a card.** A card shows every primary input and, with `parts`, more than one result part. <!-- whats-new: gallery=parts docs=docs.html#display-modes -->
  
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
  
  **Fixed: Charts on a card.** A card's chart is drawn smaller, not squashed. <!-- whats-new: gallery=card-mode docs=docs-ref-tokens.html#tokens -->
  
  Compact mode halved the chart's viewBox height, which took
  the plot area from 238 units to 88 and compressed a curve falling from 74% to nothing into an unreadable
  band, and dropped the axis titles, the annotation label and the legend with it. None of that was needed: the
  geometry is a viewBox scaled to the available width, so a chart on a narrow card is already smaller than one
  on a page with its aspect ratio intact. The chart is now identical everywhere, and compact changes only the
  rendered size, capped at `--tb-chart-card-max` (52rem). Labels stay legible below that width via a container
  query, since text inside a viewBox otherwise shrinks with it.
  
  **Changed: Result summary.** The one-line summary of a result is announced to screen readers, not shown. <!-- whats-new: gallery=page-mode -->
  
  "6 fields, chart, 2 series, table, 5 rows" rendered above
  the result as a line that reads like debug output, describing something already on screen. It is what a
  screen reader needs and what a sighted reader does not, so it moves to a visually hidden live region. The
  visible line keeps what a reader can act on: prompts, a sample's name, and errors.
  
  No contract version change. Nothing here adds or alters a manifest key, and the one rule that changed was
  removed rather than added.

## 0.4.0

### Minor Changes

- [#46](https://github.com/eknowledger/toolbench/pull/46) [`dc13784`](https://github.com/eknowledger/toolbench/commit/dc13784af5759a5c651f98d06ba142c36f2889a2) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Samples.** A tool can ship labelled example inputs, drawn as buttons under the form. <!-- whats-new: gallery=samples docs=docs-authoring.html#4b-sample-inputs -->
  
  Contract version 3 adds the optional `samples` manifest key: labelled example inputs a tool ships with, so a reader who does not know what to type has somewhere to start.
  
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

- [#32](https://github.com/eknowledger/toolbench/pull/32) [`725e880`](https://github.com/eknowledger/toolbench/commit/725e880295f99c74e8810183ba99575e6be8f0bb) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Seeds at build time.** `seed()` computes a card's starting result from the tool itself. <!-- whats-new: docs=docs-authoring.html#10b-seeding -->
  
  Adds `seed()` and `serialiseSeed()` for computing a card's static result at build time, so a seed cannot drift from the tool it describes.
  
  `seed(loaded)` runs a tool against its manifest defaults and returns the `Output`. It throws if the tool crashes on its own defaults or rejects them, because both are authoring bugs and a card seeded with an error message is worse than an unseeded card.
  
  `serialiseSeed(output)` produces JSON safe to embed in `<script type="application/json">`. Use it rather than `JSON.stringify`: an HTML parser ends a `<script>` at the first `</script` in its text however the JSON is quoted, so a tool echoing any part of its input could otherwise truncate the page.
  
  Also exports `defaultInputs()` and `SeedError`.

- [#34](https://github.com/eknowledger/toolbench/pull/34) [`93d319b`](https://github.com/eknowledger/toolbench/commit/93d319b6601384205951231d01b79c5b45ff34b1) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Fixture harness.** `@toolbench/sdk/fixtures` checks your own tools' manifests and cases in three lines. <!-- whats-new: docs=docs-authoring.html#8-fixtures -->
  
  Adds a `@toolbench/sdk/fixtures` subpath exporting the tool-directory harness, so a host authoring its own tools gets the compatibility guarantees in three lines rather than copying forty:
  
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

- [#30](https://github.com/eknowledger/toolbench/pull/30) [`d5135ad`](https://github.com/eknowledger/toolbench/commit/d5135ad8ca2c96f41d16a46f99b6a1c23b3bee3a) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Bytes results.** A hex dump with offsets, a printable gutter and named ranges. <!-- whats-new: gallery=tool-utf8-bytes docs=docs-ref-results.html#bytes -->
  
  Contract version 2 adds the `bytes` output kind, for wire formats and hex dumps: offsets, hex, a printable gutter, and named highlight ranges that can start mid-row and wrap. A `table` could approximate this but gets alignment and spanning wrong, and has nowhere to put a range that crosses rows.
  
  Tools declaring `"sdk": 1` are unaffected and need no change. Raising the contract version is a minor bump, never a major one, because contract changes are additive by policy.

## 0.1.1

### Patch Changes

- [#26](https://github.com/eknowledger/toolbench/pull/26) [`aeb5c50`](https://github.com/eknowledger/toolbench/commit/aeb5c5011948798210d5f059aa66e7a9364aff40) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: Source maps.** Published source maps now contain their sources. <!-- whats-new: docs=docs-architecture.html#114-artifacts -->
  
  Published source maps now contain their sources. Previously the maps referenced `../src/*.ts`, which `files: ["dist"]` never shipped, so anyone stepping into either package in a debugger got a map pointing at nothing. Sources are embedded with `inlineSources`, so the maps are self-contained.
