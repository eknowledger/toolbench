# @toolbench/runtime

## 0.7.0

### Minor Changes

- [#131](https://github.com/eknowledger/toolbench/pull/131) [`926a15d`](https://github.com/eknowledger/toolbench/commit/926a15d2b8be7007b293eb5fcb5ffd180cc0f121) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: `--tb-accent-text` and `--tb-accent-ink`, so a bright accent can fill the Run button while its label and the tool's links stay readable.** ([#106](https://github.com/eknowledger/toolbench/issues/106))

  - `--tb-accent-text` colours accent text: links, the card's "Try it" hint, a hovered sample, annotation labels. Defaults to `--tb-accent`.
  - `--tb-accent-ink` colours text on an accent fill: the Run button's label, a marked byte. Defaults to `--tb-bg`.

  Fills and focus outlines keep `--tb-accent`. Nothing changes unless you set the new tokens.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: bands.** ([#119](https://github.com/eknowledger/toolbench/issues/119)) `shape: "band"` with a `lower` edge fills the range between two edges, a p5 to p95 spread around a median say, beneath every other series. The readout reads it as "29 to 35 ms", and the data table shows both edges.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: box plots.** ([#122](https://github.com/eknowledger/toolbench/issues/122)) `shape: "box"` with a `boxes` summary per x draws whiskers, the quartile box, the median and outliers, grouped like bars. The tool computes the summary, so the whiskers mean what the tool says; the readout and the data table list all five numbers.

- [#135](https://github.com/eknowledger/toolbench/pull/135) [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: bubble charts.** ([#127](https://github.com/eknowledger/toolbench/issues/127)) `sizes` on a points series draws a third measure as each bubble's area, scaled across the whole chart, with a key of reference sizes, the size in the readout and a size column in the data table.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: named categories on a chart's x axis.** ([#113](https://github.com/eknowledger/toolbench/issues/113))

  `x: ["Mesh", "MCU", "SFU"]` draws one evenly spaced slot per name, in the order given, labelled with the text. When the labels would collide, every second or third is shown; all of them are in the data table and the readout.

  - **Fixed:** a bar chart's axis always starts at zero, so a bar's length is its value.
  - **Fixed:** bars are capped in thickness, so a chart of a few categories draws bars rather than slabs.

- [#135](https://github.com/eknowledger/toolbench/pull/135) [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: exploded pie and donut slices.** ([#126](https://github.com/eknowledger/toolbench/issues/126)) `explode: true` on a slice pulls it out a little along its middle, to point at the one part the text is about. Its share is unchanged.

- [#135](https://github.com/eknowledger/toolbench/pull/135) [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: heatmaps.** ([#121](https://github.com/eknowledger/toolbench/issues/121)) A `heatmap` output draws a value over two dimensions as coloured cells, sequential (one hue) or diverging (two hues around a midpoint), with a key, hatched cells where there is no value, and a readout the arrow keys move through. Its code is fetched only by pages that draw one; theme the colours with `--tb-heat-lo`, `--tb-heat-hi`, `--tb-heat-neg`, `--tb-heat-mid` and `--tb-heat-pos`.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: horizontal bars.** ([#116](https://github.com/eknowledger/toolbench/issues/116))

  `orientation: "horizontal"` draws one row per category with its bars growing rightward, so long names sit beside their bars. Grouping, stacking, thresholds (as vertical rules), the readout and the data table all work the same way; the chart grows taller with its rows.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: log scales.** ([#118](https://github.com/eknowledger/toolbench/issues/118)) `yScale: "log"` and `xScale: "log"` draw an axis in powers of ten (0.1, 1, 10, 100, 1k), for values spanning orders of magnitude. Values a log axis cannot show (zero, negatives) are left out with a note in the data table, and bars are not drawn on a log y axis.

- [#132](https://github.com/eknowledger/toolbench/pull/132) [`d09bca0`](https://github.com/eknowledger/toolbench/commit/d09bca0a311821f7126861dbe60f0a618732fea5) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: chart markers, for data over separate items.** ([#111](https://github.com/eknowledger/toolbench/issues/111))

  - `markers: true` on a `line` or `area` series draws a marker at every point; `shape: "points"` draws the points with no line between them.
  - Each series gets its own marker shape as well as its colour, so series with equal values stay distinguishable, and the legend keys each one by its marker.

  Contract version 4. A tool uses these with `"sdk": 4`; existing tools are unaffected.

- [#135](https://github.com/eknowledger/toolbench/pull/135) [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: mirrored horizontal bars, for pyramids and back-to-back comparisons.** ([#125](https://github.com/eknowledger/toolbench/issues/125)) `mirror: true` on a horizontal chart draws negative values to the left and labels every number, on the axis, in the readout and in the table, as its magnitude.

- [#135](https://github.com/eknowledger/toolbench/pull/135) [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: pie and donut charts.** ([#123](https://github.com/eknowledger/toolbench/issues/123)) A `pie` output draws parts of a whole in the order given, from 12 o'clock clockwise, every slice labelled with its share. More than six parts fold into "Other", a negative or zero total draws a message instead, and `donut: true` shows the total in the centre. Its code is fetched only by pages that draw one.

- [#136](https://github.com/eknowledger/toolbench/pull/136) [`b74570a`](https://github.com/eknowledger/toolbench/commit/b74570a82998544a917e24fd82d785d9ee605a91) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: radar charts.** ([#128](https://github.com/eknowledger/toolbench/issues/128)) A `radar` output draws a profile across several measures, one spoke each from 12 o'clock, on a shared scale from zero or each axis's own maximum, with round-valued rings, markers on every vertex and a readout that steps spoke by spoke.

- [#133](https://github.com/eknowledger/toolbench/pull/133) [`618c06d`](https://github.com/eknowledger/toolbench/commit/618c06d1167f3da47c765e8b0f116445a3d416fe) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: charts read out their values on hover and from the keyboard.** ([#112](https://github.com/eknowledger/toolbench/issues/112))

  - Pointing at a chart snaps to the nearest x, draws a crosshair and shows a card of every series' value there. Tab to a chart and the arrow keys step through it, with each card read out to screen readers.
  - A tool can say what a point means: `readout.titles` for a heading per x, `series.notes` for the text of one value, `readout.mode` and `readout.crosshair` to shape or turn it off.
  - Whole numbers now print without decimals in charts and their data tables: frame 6, not 6.00.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: scatter plots.** ([#120](https://github.com/eknowledger/toolbench/issues/120)) A series can carry its own `x` values, so measurements that share no x positions plot together. The readout snaps to the nearest point, with both crosshair lines, and the keyboard steps through the points left to right; the data table lists one row per point.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: stacked bars.** ([#115](https://github.com/eknowledger/toolbench/issues/115))

  Bar series with the same `stack` id are drawn as one bar of parts at each x, so a reader sees each part and the total: a delay budget stage by stage, traffic by protocol. Negative values stack below zero, plain bar series sit beside the stack, and the data table adds a total per stack.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: step lines.** ([#117](https://github.com/eknowledger/toolbench/issues/117)) `shape: "step"` draws a value that holds until it changes, a buffer depth or a configured rate, as flat runs joined by straight risers instead of slopes.

- [#134](https://github.com/eknowledger/toolbench/pull/134) [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: threshold lines on a chart.** ([#114](https://github.com/eknowledger/toolbench/issues/114))

  `thresholds: [{ y: 150, label: "150 ms budget", tone: "warn" }]` draws a labelled, dashed rule across the plot at that value. The scale widens to include it, and it stays out of the legend, the data table and the readout, because it is a limit rather than a measurement.

- [#136](https://github.com/eknowledger/toolbench/pull/136) [`b74570a`](https://github.com/eknowledger/toolbench/commit/b74570a82998544a917e24fd82d785d9ee605a91) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: treemaps.** ([#129](https://github.com/eknowledger/toolbench/issues/129)) A `treemap` output draws a hierarchy of sizes as nested rectangles, squarified so they compare, groups in their own hue, labels where they fit and every node in the readout and the data table.

- [#136](https://github.com/eknowledger/toolbench/pull/136) [`b74570a`](https://github.com/eknowledger/toolbench/commit/b74570a82998544a917e24fd82d785d9ee605a91) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: Venn diagrams for two or three sets.** ([#130](https://github.com/eknowledger/toolbench/issues/130)) Two sets are drawn with exact areas; three are placed as closely as circles allow, with every region labelled by its count and the caption saying the areas are approximate. More sets, or numbers that cannot be true, draw a message.

- [#132](https://github.com/eknowledger/toolbench/pull/132) [`d09bca0`](https://github.com/eknowledger/toolbench/commit/d09bca0a311821f7126861dbe60f0a618732fea5) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: lead with the answer, or let the page own the controls.** ([#103](https://github.com/eknowledger/toolbench/issues/103))

  - `layout="answer-first"` puts the result above the form, for a tool used as a page's opening figure.
  - `controls="none"` draws the result alone, and the page drives it with `values` and `run()`, so controls a page builds itself are no longer duplicated inside the tool.

  Neither changes a card.

- [#133](https://github.com/eknowledger/toolbench/pull/133) [`618c06d`](https://github.com/eknowledger/toolbench/commit/618c06d1167f3da47c765e8b0f116445a3d416fe) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: link a chart to its tables.** ([#124](https://github.com/eknowledger/toolbench/issues/124))

  - `readout.highlightTable: true` highlights the chart's own data-table row as the reader points along the chart.
  - A `table` part with `link: { chart, keys }` is linked to the chart with that `id`: pointing at the chart lights the matching rows, and pointing at a row moves the chart's readout there.

- [#131](https://github.com/eknowledger/toolbench/pull/131) [`926a15d`](https://github.com/eknowledger/toolbench/commit/926a15d2b8be7007b293eb5fcb5ffd180cc0f121) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: the Run area stops getting in the reader's way.** ([#99](https://github.com/eknowledger/toolbench/issues/99), [#101](https://github.com/eknowledger/toolbench/issues/101), [#104](https://github.com/eknowledger/toolbench/issues/104))

  - No "press Run" line above the Run button. "inputs changed", sample and error messages are unchanged.
  - Clicking Run with a mouse no longer scrolls the page to the result. A keyboard press still moves focus there, and the result now wears the theme's focus ring rather than the browser's.
  - An `autoRun` tool has no Run button, and shows its default answer as soon as it opens.

  ⚠️ Heads-up: an `autoRun` tool now runs once on arrival (on activation, for a card). If a page relied on it staying empty until the reader typed, it will not.

- [#132](https://github.com/eknowledger/toolbench/pull/132) [`d09bca0`](https://github.com/eknowledger/toolbench/commit/d09bca0a311821f7126861dbe60f0a618732fea5) Thanks [@eknowledger](https://github.com/eknowledger)! - **New: a slider for number inputs.** ([#102](https://github.com/eknowledger/toolbench/issues/102))

  `"control": "slider"` on a number input draws a range control beside its number box, so a reader can sweep a value and watch the answer follow (with `autoRun`). The box stays editable for exact values, and the slider honours `min`, `max` and `step`.

  Contract version 4. A tool uses it with `"sdk": 4`; a runtime that predates it shows the number box alone.

### Patch Changes

- [#131](https://github.com/eknowledger/toolbench/pull/131) [`926a15d`](https://github.com/eknowledger/toolbench/commit/926a15d2b8be7007b293eb5fcb5ffd180cc0f121) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: a card's blurb and seeded answer reach screen readers, and the card passes the label, nesting and target-size checks.** ([#98](https://github.com/eknowledger/toolbench/issues/98), [#105](https://github.com/eknowledger/toolbench/issues/105))

  A closed card is now ordinary content with one button, its "Try it" hint, instead of a button wrapping everything. Clicking anywhere on the card still opens it, except on a control inside it such as a chart's "Show the data as a table", which now works in a card. A host test that clicked `button.tb-facade` should click the card or `button.tb-facade-hint` instead.

- [#135](https://github.com/eknowledger/toolbench/pull/135) [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: a second y axis shows its title, and an area chart fills from zero.** `yLabelRight` was accepted but never drawn, and an area's fill started at the lowest value instead of at zero, which overstated every difference.

- [#131](https://github.com/eknowledger/toolbench/pull/131) [`926a15d`](https://github.com/eknowledger/toolbench/commit/926a15d2b8be7007b293eb5fcb5ffd180cc0f121) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: a closed card no longer downloads the chart renderer, and a failed download no longer breaks the card.** ([#97](https://github.com/eknowledger/toolbench/issues/97))

  - A card fetches the chart code only if its seed contains a chart, or when it is opened. Pages of closed, unseeded chart cards save the 2 KB request.
  - If the chart code cannot be fetched (an offline reload, a cache purge mid-deploy, a strict CSP), cards still paint and open, and show everything except the chart with a line saying it could not be loaded, instead of a bundler error.

- [#131](https://github.com/eknowledger/toolbench/pull/131) [`926a15d`](https://github.com/eknowledger/toolbench/commit/926a15d2b8be7007b293eb5fcb5ffd180cc0f121) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: expanding a card's truncated result no longer resizes the chart already on screen.** ([#100](https://github.com/eknowledger/toolbench/issues/100))

  "Show 1 more result" reveals the rest underneath; the chart above it keeps its card size. A host that set `--tb-chart-card-max: none` to avoid the jump can remove it.

- [#133](https://github.com/eknowledger/toolbench/pull/133) [`618c06d`](https://github.com/eknowledger/toolbench/commit/618c06d1167f3da47c765e8b0f116445a3d416fe) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: a tool page that draws no chart no longer downloads the chart styles.** The chart rules moved from the runtime's stylesheet into the chart chunk, which adopts them when the first chart is drawn: 1.4 KB less for every page without a chart.

- [#131](https://github.com/eknowledger/toolbench/pull/131) [`926a15d`](https://github.com/eknowledger/toolbench/commit/926a15d2b8be7007b293eb5fcb5ffd180cc0f121) Thanks [@eknowledger](https://github.com/eknowledger)! - **Fixed: charts read correctly over whole-number x values.** ([#111](https://github.com/eknowledger/toolbench/issues/111))

  - Axis ticks land on round values (0, 100, 200 rather than 0, 118, 235), and an axis of whole numbers never shows a fraction such as frame 4.8.
  - A bar chart's x labels sit on its bars, and two or more bar series are drawn side by side instead of on top of each other.
  - Bars grow from zero, so negative values point down and a series of zeros draws nothing, instead of a row of solid bars under an axis from -1 to 1.
  - Bars are drawn opaque, so they match their legend colour.

- Updated dependencies [[`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa), [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa), [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10), [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa), [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10), [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10), [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa), [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa), [`d09bca0`](https://github.com/eknowledger/toolbench/commit/d09bca0a311821f7126861dbe60f0a618732fea5), [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10), [`b6b171c`](https://github.com/eknowledger/toolbench/commit/b6b171c249bcd5faf720f102b68c002f7222aa10), [`b74570a`](https://github.com/eknowledger/toolbench/commit/b74570a82998544a917e24fd82d785d9ee605a91), [`618c06d`](https://github.com/eknowledger/toolbench/commit/618c06d1167f3da47c765e8b0f116445a3d416fe), [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa), [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa), [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa), [`ccce533`](https://github.com/eknowledger/toolbench/commit/ccce53334fd5444e5c83f60cd76086ed4e7d7afa), [`b74570a`](https://github.com/eknowledger/toolbench/commit/b74570a82998544a917e24fd82d785d9ee605a91), [`b74570a`](https://github.com/eknowledger/toolbench/commit/b74570a82998544a917e24fd82d785d9ee605a91), [`618c06d`](https://github.com/eknowledger/toolbench/commit/618c06d1167f3da47c765e8b0f116445a3d416fe), [`3027d43`](https://github.com/eknowledger/toolbench/commit/3027d430e92ef15ecf1bef1d1bfbb937da911ad8), [`d09bca0`](https://github.com/eknowledger/toolbench/commit/d09bca0a311821f7126861dbe60f0a618732fea5)]:
  - @toolbench/sdk@0.7.0

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
