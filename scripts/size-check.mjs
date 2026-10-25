/**
 * Transfer-size budget for the built bench.
 *
 * The README and docs/architecture.md quote gzip sizes. A number in a document rots the moment nobody
 * checks it, and the whole lazy-loading argument rests on these staying small, so CI checks them.
 *
 * Budgets are ceilings with deliberate headroom, not targets. A failure here is not automatically a
 * bug: it is a prompt to look at what grew, decide whether it was worth it, and either fix it or raise
 * the ceiling in the same commit that spent it. Raising a budget silently is the one thing to avoid.
 *
 * Usage: node scripts/size-check.mjs [--update]
 *   --update  rewrite the sizes quoted in README.md and docs/architecture.md
 */
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS = join(import.meta.dirname, "..", "bench", "dist", "assets");

/**
 * Each entry matches one built chunk. `budget` is bytes, gzipped.
 *
 * `boot` is the runtime plus the bench's own wiring, which is the closest honest proxy for "what a
 * page pays to use any tool at all". It is not the runtime alone, and the docs say so.
 */
const BUDGETS = [
	/*
	 * Raised from 18,000 by contract v2: the bytes renderer is about 1.5 KB gzipped, which is real
	 * runtime code every consumer pays for. Recorded here rather than raised quietly, and the README's
	 * size table moved with it.
	 *
	 * Raised again from 19,000 by contract v3, in the commit that spent it. The sample row is 907 bytes
	 * of runtime code, and percentiles declaring its own samples added another 164, because
	 * `bench/src/registry.ts` imports every `tool.json` and so manifest data lands in this chunk too.
	 * That left 75 bytes under the old ceiling, which is not a ceiling with headroom: the next
	 * unrelated change would have failed here for reasons that had nothing to do with it.
	 */
	/*
	 * Raised from 19_500 to 20_000 in the commit that spent it: the element honouring `status` costs 649
	 * gzipped bytes, measured, which is 137 over the ceiling the chart split had just set. Worth recording
	 * that the two changes together leave the figure LOWER than before either: 20,360 before the split,
	 * 19,637 after both, while gaining the feature. The two bench fixtures this added cost nothing here,
	 * because fixture manifests live in their own chunk since the fixture split.
	 *
	 * ⚠️ Lowered from 20_500 to 19_500 by splitting the chart renderer out, measured at 1,372 bytes.
	 * A ceiling that only ever rises stops being a constraint, so when a change genuinely removes weight
	 * the number should follow it down. 18,988 measured, leaving 512.
	 *
	 * Raised from 19_500 to 20_500 in the commit that spent it. What it bought: a second live region so a
	 * result summary is announced without rendering as a line of metadata above the result; a query
	 * container and three rules so a card's chart keeps legible labels when the card is narrower than the
	 * chart's own viewBox; and the `parts` attribute plumbing. 19_500 left 46 bytes of headroom, which is
	 * not headroom.
	 *
	 * Raised from 20_000 to 21_250 in the commit that spent it, and this one is worth reading twice
	 * because almost none of it is runtime code.
	 *
	 * 19,782 measured on the commit before, 20,832 after: 1,050 bytes for two `tool.json` files. The
	 * tools' *code* is not here, it is in tool-regex-explainer and tool-histogram. What lands here is
	 * manifest data, because `bench/src/registry.ts` imports every `tool.json` eagerly, which is the
	 * third time that mechanism has moved this number (percentiles' samples, then the bench fixtures,
	 * which is why those now live in their own chunk).
	 *
	 * ⚠️ 0.2 KB of the gap between this figure and the published one predates this change. The tables
	 * said 19.6 KB while the commit before measured 19.8: the Pages demo added host wiring and the
	 * published figures were not re-run. `--update` in this commit corrects both, so do not read the
	 * 19.6 to 20.9 move as all belonging here.
	 *
	 * ⚠️ And a stale paragraph removed from this block: it recorded a raise to 21_500 for the `status`
	 * work that was never taken, because that change landed at 20_000 instead. A budget history that
	 * describes a ceiling the file does not have is worse than no history.
	 */
	/*
	 * Raised from 21_250 to 22_000 in the commit that spent it: 20,898 to 21,691 measured, 793 bytes for
	 * the in-place disclosure. What it bought, and this one is runtime code rather than manifest data:
	 * the group cap working in every mode instead of card mode only, the button with its two labels and
	 * `aria-expanded`, the delegated toggle, and the styles for a 24px target.
	 *
	 * Worth recording why it is not cheaper. The hidden parts are rendered up front and hidden with the
	 * `hidden` attribute, rather than rendered on first press. Rendering lazily would save nothing here,
	 * because the renderers are already in this chunk, and it would cost the guarantee that matters: that
	 * expanding never re-runs the tool. For a worker-mode tool, a lazy version would be a round trip.
	 *
	 * 21_250 left 341 bytes, so this was always going to be the change that spent it.
	 */
	/*
	 * Raised from 22_000 to 23_000 in the commit that spent it: 21,686 to 22,573 measured, 887 bytes for
	 * the 0.7.0 card fixes taken together. The card rebuilt as content with a button in it rather than a
	 * button around content, the run area without its status line or its Run button under autoRun, the
	 * themed focus ring, the expand that holds a chart's size, the fallback when the chart chunk cannot
	 * load, and the two accent tokens.
	 *
	 * ⚠️ Each of those branches fitted under 22_000 on its own, and nobody measured them together until CI
	 * did. Measure the combination before stacking branches, not only the tip: the tip of this release sits
	 * lower again once the chart styles leave this chunk, which hid the overshoot here.
	 */
	/*
	 * Raised from 23_000 to 23_500 by contract v4's first features: 22,573 to 23,249 measured, 676 bytes.
	 * The chart markers' and legend keys' styles, 242 bytes of it, live in the runtime's stylesheet, which
	 * is in this chunk; the rest is the slider control and the host's `layout` and `controls` attributes.
	 */
	/*
	 * Raised from 23_500 to 24_000 by the chart readout's styles (#112), +351 bytes, 23,628 measured.
	 *
	 * Lowered from 24_000 to 22_500 when the chart rules moved into the chart chunk: 23,628 to 22,195, so a
	 * tool page that draws no chart stopped paying about 1.4 KB for styles it never used.
	 *
	 * Raised from 22_500 to 23_000 by linked table rows (#124): a linked table finds its chart and moves its
	 * readout, and its highlight is styled here because a table is not chart code.
	 *
	 * Raised from 23_000 to 23_500 by the radar, treemap and Venn kinds (#128 to #130): a loader each, their
	 * cases in the two exhaustive switches, and a screen-reader summary each. 23,079 measured. The renderers
	 * themselves are chunks of their own, below.
	 *
	 * Raised from 23_500 to 24_500 by host stylesheets and the styling contract (#157, #154, #156): 23,437 to
	 * 24,118 measured, 681 bytes. The `styles` option and `setHostStyles`, which parse, share and order a
	 * host's sheets in every root; `data-kind`, `data-role` and `data-label` on rendered parts; the runtime's
	 * sheet inside `@layer toolbench`; and the default sheet's good and muted tones and the `min-width: 0`
	 * that stops a wide result clipping its tool.
	 *
	 * #147's `reveal(id)` and `data-part` spent 230 of the headroom, 24,118 to 24,348, inside this ceiling.
	 *
	 * Raised from 24_500 to 25_500 by select presets (#151) and contract v6, in the commit that spent it:
	 * 24,348 to 25,022 measured, 674 bytes. 355 of them are validation, because `validateManifest` ships in
	 * this chunk: the payload checker that samples and presets now share, and the four rules a preset adds,
	 * each with a message naming the field. The other 319 are the runtime, the select writing its option's
	 * values and following the form after typing, a sample or a host write, with the status line saying so,
	 * plus the v6 changelog line. 24_500 left 152 bytes after v5, so no version of this fitted under it.
	 *
	 * The undo fix (#162) spent 7 inside it, 25,029.
	 *
	 * Raised from 25_500 to 26_000 by the painted textarea (#153), in the commit that spent it: 25,029 to
	 * 25,326 measured, 297 bytes, 93 of them validating `lang`. The rest is the wiring only: deciding at
	 * activation whether to fetch the `paint` chunk, placing its wrapper, repainting after a value is written
	 * without a keystroke, and `lang` in the v6 changelog line. The layer, its repaint and its sheet are that
	 * chunk, 956 bytes. Measured before the rebase onto v5, building them into this chunk instead cost 761
	 * bytes here against 313 split, which is why they are split. 25_500 would have left 174 bytes.
	 */
	/*
	 * Raised from 26_000 to 27_000 by the graph kind (#152), in the commit that spent it: 25,428 to 26,511
	 * measured, 1,083 bytes. 462 of them are the build-order example's manifest, which `registry.ts` inlines here
	 * as it does every tool's. The other 621 are the runtime: the graph kind's loader and its case in both
	 * exhaustive switches, the screen-reader summary, `prepareOutput` so a seeded graph paints with its chunks,
	 * the renderer's own way to say which chunk is missing, `adoptStyles` moved here from the chart chunk so
	 * the graph kind shares it, two more series tokens, the closed list of graph colours and the v7 changelog
	 * line. The layout and the drawing are chunks of their own, below. 26_000 would have left the build 511
	 * bytes over.
	 *
	 * The graph families (#152) moved it 3 bytes, to 26,514, and passing the host's worker factory to a large
	 * graph spent 17 more, 26,531, both inside it.
	 *
	 * Raised from 27_000 to 27_500 by the Copy action on code and table results (#155), in the commit that
	 * spent it: 26,765 to 27,290 measured, 525 bytes. The button, its note and their styles, drawn with the
	 * result, and the host announcing the outcome. The copying itself is a chunk of its own, below; built into
	 * this chunk instead it cost 685 here, measured on v6. 27_000 would have left the build 60 over.
	 *
	 * Raised from 27_500 to 28_000 by refusing a manifest that under-declares its sdk (#170), in the commit
	 * that spent it: 27,322 to 27,701 measured, 379 bytes. The rows of the version table after version 1 and
	 * the check that names the field and the sdk to declare, here because `upgradeManifest` and
	 * `validateManifest` are. The first version carried every key at every version and a general walker, 654
	 * bytes; the full table now lives in the test that keeps the two in step. The output half is the fixture
	 * harness's and tree-shaking leaves it out of this chunk. 27_500 would have left the build 201 over.
	 *
	 * Raised from 28_000 to 28_500 by a tool's own textarea grammar (#163), in the commit that spent it:
	 * 27,701 to 28,252 measured, 551 bytes. Most of it is validation, because `validateManifest` ships here:
	 * the four grammar keys and their caps as one rule table, the refusal of any other key with the reason a
	 * pattern is not allowed, and a message naming the field for each; written as a branch per key it was 85
	 * bytes larger. The rest is the textarea's grammar checks, deciding to fetch the paint chunk for a grammar
	 * as well as for a hook, its row in the version table and the v7 changelog line. The tokeniser is in the
	 * paint chunk, never here. 28_000 would have left the build 252 over.
	 *
	 * Raised from 28_500 to 29_000 by the wide-graph option (#198), in the commit that spent it: 28,424 to
	 * 28,534 measured, 110 bytes. The two `defineToolHost` options, the two attributes and passing both to the
	 * renderer; the bench's import of its own query switches is in that, their code is not. Fitting, the
	 * button and its icons are in the graph chunk, never here. 28_500 would have left the build 34 over.
	 */
	{ label: "runtime + host wiring", pattern: /^boot-[^/]+\.js$/, budget: 29_000 },
	/*
	 * The bench's theme switch, split out of `boot` on purpose. It is a test instrument, so it must not
	 * be counted in the figure the README quotes for what a consumer pays. Tracked so it cannot grow
	 * unnoticed either.
	 */
	{ label: "bench theme switch", pattern: /^bench-theme-[^/]+\.js$/, budget: 1_500, deployOnly: true },
	/*
	 * The fixture manifests, split out of `boot` for the same reason as the theme switch and measured for the
	 * same one: a chunk nobody watches is a chunk that grows. 571 bytes for one fixture, and open pull
	 * requests add three more, so the ceiling is set to leave room for those without leaving room for
	 * everything.
	 *
	 * Raised from 2_000 to 2_500 by the slider fixture (#102), the one that crossed it, after the
	 * discrete-series fixture (#111). Both exist so browser tests can put a contract feature on screen; no
	 * reader downloads this chunk.
	 */
	/*
	 * Both raised to 4_000 in 0.7.0: the discrete-series fixture grows a case for each chart feature (#111
	 * to #124), so the charts page and the browser tests can put every one on screen. Bench-only; no reader
	 * downloads either chunk.
	 */
	/*
	 * Main copy raised from 4_000 to 5_000 by the highlighted-input fixture (#153): 3,441 to 4,123 measured,
	 * because its default is 842 characters of JSON, long enough to scroll and to wrap, which is what the
	 * overlay has to survive. Bench-only. The worker copy still fits its line.
	 *
	 * Raised from 5_000 to 5_500 by the grammar fixture (#163): 4,686 to 5,141 measured, its two textareas'
	 * defaults and grammars. Bench-only.
	 *
	 * Raised from 5_500 to 6_000 by the wide-output fixture (#194): 5,141 to 5,544 measured, its manifest's nine
	 * cases. The option labels are long on purpose: one of them is what showed WebKit counting a select's text
	 * as overflow of the tool. Bench-only.
	 */
	{ label: "bench fixtures", pattern: /^bench-fixtures-[^/]+\.js$/, budget: 6_000, deployOnly: true },
	/*
	 * Worker copy raised from 4_000 to 4_500 by the graph-families fixture (#152): 3,716 to 4,020 measured with
	 * the cases the graph kind's base draws, 4,210 with every family's, and 4,237 with the large graph too.
	 * Bench-only.
	 *
	 * Raised from 4_500 to 5_000 by the grammar fixture (#163): 4,237 to 4,649 measured. Bench-only.
	 *
	 * Raised from 5_000 to 5_500 by the wide-output fixture (#194): 4,649 to 5,013 measured. Bench-only.
	 */
	{ label: "bench fixtures, worker copy", pattern: /^worker-bench-fixtures-[^/]+\.js$/, budget: 5_500, deployOnly: true },
	/*
	 * The demo highlighter passed to `defineToolHost({ highlight })`. Host-only, split out of `boot` for
	 * the same reason as the theme switch: a consumer does not download it.
	 */
	{ label: "bench highlighter", pattern: /^bench-highlight-[^/]+\.js$/, budget: 1_500, deployOnly: true },
	// `?wide=` and `?wideToggle=` as host options, for the wide-graph tests (#198). 165 measured.
	{ label: "bench host options", pattern: /^bench-host-options-[^/]+\.js$/, budget: 500, deployOnly: true },
	/*
	 * The chart renderer, fetched only by a page whose tool declares `series`. Counted as reader cost
	 * rather than deployOnly, because a reader of a chart tool genuinely downloads it: the saving is that
	 * everybody else does not.
	 *
	 * Raised from 2_500 to 3_000 by contract v4's markers and points (#111), which spent it: six marker
	 * shapes and their placement, on top of #111's readable ticks and grouped bars. 2,738 measured.
	 *
	 * Raised again, from 3_000 to 4_500, by the chart readout (#112): the crosshair, the card, pointer,
	 * touch and key handling and the nearest-x arithmetic, 1,510 bytes. 4,257 measured. Only a page that
	 * draws a chart downloads it.
	 *
	 * Raised from 4_500 to 6_500 when the chart rules moved here from the runtime: 4,257 to 6,288. A page
	 * with a chart pays about 0.6 KB more than before, because CSS compresses better in one file than split
	 * across two; a page without one saves 1.4 KB. That trade favours the pages that never draw a chart.
	 *
	 * Raised from 6_500 to 7_000 by linked rows (#124): highlighting the chart's own data table and linked
	 * tables, and answering a row that asks for its x.
	 *
	 * Raised from 7_000 to 8_000 by thresholds (#114): rules, tones and haloed labels. 7185 measured.
	 *
	 * Raised from 8_000 to 9_500 by stacked bars (#115) and horizontal bars (#116), a second layout with its own axes, labels and readout geometry. 8,561 measured.
	 *
	 * Raised from 9_500 to 11_500 by bands (#119) and scatter (#120): a second readout that snaps to the nearest point in two dimensions, and a one-row-per-point data table. 10,349 measured.
	 *
	 * Lowered from 11_500 to 9_000 when the stylesheet and the number format moved into plot-common, the
	 * chunk every chart kind shares (#121): about 10.9 KB to 8,266. A line or bar page now fetches both, 11,191
	 * together, 0.3 KB more than one chunk was, which buys a heatmap or pie page not fetching this one.
	 */
	{ label: "chart renderer", pattern: /^chart-[^/]+\.js$/, budget: 9_000 },
	/*
	 * What every chart kind shares: the chart stylesheet and the number format. Fetched with the series
	 * chart, the heatmap or the pie, whichever a page draws first. 2,925 measured.
	 */
	{ label: "chart common", pattern: /^plot-common-[^/]+\.js$/, budget: 3_500 },
	/*
	 * The heatmap (#121), its own chunk so only a page that draws one fetches it: cells, the key, the
	 * hatch for missing values and its cell-by-cell readout. 2,852 measured.
	 */
	{ label: "heatmap renderer", pattern: /^heatmap-[^/]+\.js$/, budget: 3_500 },
	/*
	 * The pie and donut (#123), its own chunk: slices, the key beside them, folding into Other and its
	 * slice-by-slice readout. 2,731 measured.
	 */
	{ label: "pie renderer", pattern: /^pie-[^/]+\.js$/, budget: 3_500 },
	/*
	 * Three more chart kinds, each its own chunk so only a page drawing one fetches it: radar (#128, 2,805
	 * measured), treemap with its squarified layout (#129, 2,955) and Venn with its exact two-set geometry
	 * and three-set placement (#130, 3,256).
	 */
	{ label: "radar renderer", pattern: /^radar-[^/]+\.js$/, budget: 3_500 },
	{ label: "treemap renderer", pattern: /^treemap-[^/]+\.js$/, budget: 3_500 },
	{ label: "venn renderer", pattern: /^venn-[^/]+\.js$/, budget: 4_000 },
	/*
	 * The painted textarea (#153): the layer, its debounced repaint and its own sheet. A chunk of its own,
	 * fetched on activation only by a tool declaring `lang` on a host that passes a highlight hook, so every
	 * other page pays nothing for it. Reader cost, because that reader does download it. 956 measured.
	 *
	 * Raised from 1_500 to 2_000 by the tool-defined grammar (#163): 955 to 1,500 measured, 545 bytes for the
	 * tokeniser, the hook-first order and four token colours. Here rather than in boot by design, so only a
	 * page whose tool declares `lang` pays for it. 1,500 would have left none.
	 */
	{ label: "painted textarea", pattern: /^paint-[^/]+\.js$/, budget: 2_000 },
	/*
	 * What a Copy button does (#155): the clipboard write, the tab-separated form of a table with spreadsheet
	 * quoting and its guard against a pasted formula, the fallback that selects the text, and the words for
	 * each outcome. Fetched when the first code or table result is drawn, so a page with neither pays nothing.
	 * Reader cost: that reader downloads it. 576 measured, 63 of them the formula guard.
	 */
	{ label: "copy action", pattern: /^copy-[^/]+\.js$/, budget: 1_000 },
	/*
	 * The graph kind (#152): a base chunk and eleven fetched on demand, so a page pays for the graphs it draws.
	 *
	 * The base lays out and draws a layered graph with orthogonal edges and the basic shapes, which is most
	 * graphs, with its keyboard model, readout and edge table: 17,856 measured. Exactly an 8-character hash after
	 * "graph-", so it cannot match a chunk below, whose names are longer.
	 *
	 * The chunks, each fetched by the first graph that needs it and counted as reader cost, because that reader
	 * downloads it: tree and radial placement 1,756; force and manual 895; what those two share 937; straight
	 * lines and curves 2,632; hexagon, parallelogram, cylinder and document 464; records and crow's feet 969;
	 * groups and lanes 2,837; path highlighting 734; the crossing search 1,570, for a dense layered graph of at
	 * most 60 nodes; the repair of a route that had to share 898; and the large-graph path 693, past 100 nodes.
	 * Each budget sits above what it measured with room for a fix, not for a feature.
	 *
	 * Fitting a wide graph (#198), its toggle, the two icons and their rules, spent 616 of the base's room:
	 * 17,865 to 18,481. Inside 18_500 without raising it, which leaves 19 bytes, so the next feature here
	 * raises it.
	 *
	 * Raised to 18_750 by #201: a seed's graph is laid out before the paint, so the chunks its layout asks for
	 * part way through (the search, the repair) are fetched first, and that layout is kept for the draw. 74
	 * bytes, 18,484 to 18,558.
	 */
	{ label: "graph: base", pattern: /^graph-[A-Za-z0-9_-]{8}\.js$/, budget: 18_750 },
	{ label: "graph: tree and radial", pattern: /^graph-tree-[^/]+\.js$/, budget: 2_250 },
	{ label: "graph: force and manual", pattern: /^graph-force-[^/]+\.js$/, budget: 1_250 },
	{ label: "graph: free placement, shared", pattern: /^graph-free-[^/]+\.js$/, budget: 1_250 },
	{ label: "graph: lines and curves", pattern: /^graph-lines-[^/]+\.js$/, budget: 3_250 },
	{ label: "graph: more shapes", pattern: /^graph-shapes-[^/]+\.js$/, budget: 750 },
	{ label: "graph: records and crow's feet", pattern: /^graph-er-[^/]+\.js$/, budget: 1_250 },
	{ label: "graph: groups and lanes", pattern: /^graph-groups-[^/]+\.js$/, budget: 3_500 },
	{ label: "graph: path highlighting", pattern: /^graph-interact-[^/]+\.js$/, budget: 1_000 },
	{ label: "graph: crossing search", pattern: /^graph-search-[^/]+\.js$/, budget: 1_750 },
	{ label: "graph: repair", pattern: /^graph-repair-[^/]+\.js$/, budget: 1_250 },
	{ label: "graph: large graphs", pattern: /^graph-large-[^/]+\.js$/, budget: 1_000 },
	/*
	 * ⚠️ The worker's copies of the layout, and NOT deployOnly, unlike a tool's worker copy. A tool's two copies
	 * are alternatives, since it declares one thread. A graph past 100 nodes is drawn on the page and laid out
	 * in the worker, so its reader downloads both the page's base and this one: 13,708 measured, the layout
	 * without the drawing, named after `graph/graph-worker.ts`, the module the worker imports. Each chunk's copy
	 * is fetched by the worker for a large graph that needs it.
	 */
	{ label: "graph worker: base", pattern: /^worker-graph-worker-[^/]+\.js$/, budget: 14_000 },
	{ label: "graph worker: tree and radial", pattern: /^worker-graph-tree-[^/]+\.js$/, budget: 2_250 },
	{ label: "graph worker: force and manual", pattern: /^worker-graph-force-[^/]+\.js$/, budget: 1_250 },
	{ label: "graph worker: free placement, shared", pattern: /^worker-graph-free-[^/]+\.js$/, budget: 1_250 },
	{ label: "graph worker: lines and curves", pattern: /^worker-graph-lines-[^/]+\.js$/, budget: 3_250 },
	{ label: "graph worker: more shapes", pattern: /^worker-graph-shapes-[^/]+\.js$/, budget: 750 },
	{ label: "graph worker: records and crow's feet", pattern: /^worker-graph-er-[^/]+\.js$/, budget: 1_250 },
	{ label: "graph worker: groups and lanes", pattern: /^worker-graph-groups-[^/]+\.js$/, budget: 3_500 },
	{ label: "graph worker: crossing search", pattern: /^worker-graph-search-[^/]+\.js$/, budget: 1_750 },
	{ label: "graph worker: repair", pattern: /^worker-graph-repair-[^/]+\.js$/, budget: 1_250 },
	{ label: "stylesheet", pattern: /^boot-[^/]+\.css$/, budget: 1_200 },
	/*
	 * Raised from 4_000 to 4_500 in the commit that spent it. The worker imports the same eager
	 * `tool.json` glob as the page, so two new manifests (regex-explainer, histogram) land in this
	 * chunk. Tool *code* stays in worker-tool-* copies; this is the registry plus the protocol.
	 * 4_000 left the chunk 237 bytes over after those manifests, which is not a ceiling.
	 */
	/*
	 * Raised from 4_500 to 5_000 by the graph kind's example (#152): 4,252 to 4,705 measured, 416 of it the
	 * build-order manifest, inlined here as every tool's is. 4_500 would have left the build 205 bytes over.
	 *
	 * The worker's half of laying out a large graph (#152), one message and a dynamic import of the layout,
	 * spent 123 inside it, 4,827. The layout itself is the "graph worker" chunks above, which a worker-mode tool
	 * never fetches.
	 */
	{ label: "worker entry", pattern: /^tool\.worker-[^/]+\.js$/, budget: 5_000 },
	{ label: "tool: percentiles", pattern: /^tool-percentiles-[^/]+\.js$/, budget: 2_000 },
	{ label: "tool: queue-explorer", pattern: /^tool-queue-explorer-[^/]+\.js$/, budget: 2_000 },
	/*
	 * ⚠️ These four lines arrived after the tools did, and that is the finding rather than the sizes.
	 *
	 * Nothing in this file fails on a chunk no entry matches, so regex-explainer shipped 2,791 gzipped
	 * bytes, plus its worker copy, entirely unmeasured: the run was green and the largest tool in the
	 * repository was invisible to it. Same denylist-shaped mistake this project has now made three
	 * times. Tracked in the backlog as a guard, because remembering to add a line is not a mechanism.
	 *
	 * regex-explainer gets 3_000 where every other tool gets 2_000, and the extra is not slack: a regex
	 * walker is a parser, and 2,791 of parser does not fit in a budget set for tools that compute. A
	 * uniform number here would be a number chosen for tidiness over truth.
	 */
	{ label: "tool: regex-explainer", pattern: /^tool-regex-explainer-[^/]+\.js$/, budget: 3_000 },
	{ label: "tool: histogram", pattern: /^tool-histogram-[^/]+\.js$/, budget: 1_500 },
	// The graph kind's example (#152): parsing, rounds, the longest chain and the cycle. 1,209 measured.
	{ label: "tool: build-order", pattern: /^tool-build-order-[^/]+\.js$/, budget: 1_500 },
	/*
	 * ⚠️ The two bench FIXTURES, measured but deployOnly, and labelled so nobody mistakes them for shipped
	 * tools. `json-code` arrived counted as reader cost, which would have put a chunk only the bench
	 * downloads into the "worst case for one reader" total, and `stress` had no line at all so it could grow
	 * unwatched. A fixture is an instrument: track it, never charge a consumer for it.
	 */
	{ label: "bench fixture: json-code", pattern: /^tool-json-code-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	{ label: "bench fixture: stress", pattern: /^tool-stress-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	/*
	 * Lines that #86's check found missing: chunks the build emitted and nothing measured. utf8-bytes is a real
	 * example tool, so a reader of it pays for it; the rest are bench fixtures and bench pages, which no reader
	 * of a consumer's site downloads. Budgets sit just above what each measured.
	 */
	{ label: "tool: utf8-bytes", pattern: /^tool-utf8-bytes-[^/]+\.js$/, budget: 1_000 },
	{ label: "bench fixture: deprecated", pattern: /^tool-deprecated-[^/]+\.js$/, budget: 500, deployOnly: true },
	{ label: "bench fixture: retired", pattern: /^tool-retired-[^/]+\.js$/, budget: 500, deployOnly: true },
	{ label: "bench fixture: slider", pattern: /^tool-slider-[^/]+\.js$/, budget: 500, deployOnly: true },
	{ label: "bench fixture: discrete-series", pattern: /^tool-discrete-series-[^/]+\.js$/, budget: 5_000, deployOnly: true },
	// The styling page's fixture (#157, #147): a result that names its parts. 528 measured.
	{ label: "bench fixture: styled-output", pattern: /^tool-styled-output-[^/]+\.js$/, budget: 1_000, deployOnly: true },
	// Select presets (#151) on screen for the browser tests. 248 measured.
	{ label: "bench fixture: presets", pattern: /^tool-presets-[^/]+\.js$/, budget: 500, deployOnly: true },
	// A textarea declaring `lang` (#153) on screen for the browser tests. 228 measured.
	{ label: "bench fixture: highlighted-input", pattern: /^tool-highlighted-input-[^/]+\.js$/, budget: 500, deployOnly: true },
	// The graph families (#152), the layout's test data drawn through a tool, for the graphs page. 5,871 measured.
	{ label: "bench fixture: graph-families", pattern: /^tool-graph-families-[^/]+\.js$/, budget: 6_500, deployOnly: true },
	// A textarea painted by its tool's own grammar (#163), beside one the host's hook paints. 446 measured.
	{ label: "bench fixture: grammar-input", pattern: /^tool-grammar-input-[^/]+\.js$/, budget: 1_000, deployOnly: true },
	// Every kind the runtime draws itself, wider than a phone (#194), for the scroll-never-clip test. 1,058 measured.
	{ label: "bench fixture: wide-output", pattern: /^tool-wide-output-[^/]+\.js$/, budget: 1_500, deployOnly: true },
	{ label: "bench page: index", pattern: /^index-[^/]+\.js$/, budget: 1_000, deployOnly: true },
	// Exactly an 8-character hash after "tool-", hyphens allowed: a tool's chunk is tool-<id>-<hash>, always longer.
	{ label: "bench page: tool", pattern: /^tool-[A-Za-z0-9_-]{8}\.js$/, budget: 7_000, deployOnly: true },
	{ label: "bench page: charts", pattern: /^charts-[^/]+\.js$/, budget: 3_500, deployOnly: true },
	// The graph gallery (#152). 1,089 measured.
	{ label: "bench page: graphs", pattern: /^graphs-[^/]+\.js$/, budget: 1_500, deployOnly: true },
	// STYLING.md's four example sheets, the toggle that removes them, and the reveal links (#157, #147). 1,046 measured.
	{ label: "bench page: styling", pattern: /^styling-[^/]+\.js$/, budget: 1_500, deployOnly: true },
	{ label: "bench source links", pattern: /^source-[^/]+\.js$/, budget: 1_500, deployOnly: true },
	/*
	 * The worker's own copies. Vite builds the worker in a separate Rollup pass, so every tool
	 * reachable from it is emitted twice. A reader downloads one copy (a tool declares one thread);
	 * the second copy costs deploy bytes only. Tracked so it stays a known cost rather than a
	 * surprise, and named so the network panel says which thread ran.
	 */
	{ label: "worker copy: percentiles", pattern: /^worker-tool-percentiles-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	{ label: "worker copy: queue-explorer", pattern: /^worker-tool-queue-explorer-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	{ label: "worker copy: regex-explainer", pattern: /^worker-tool-regex-explainer-[^/]+\.js$/, budget: 3_000, deployOnly: true },
	{ label: "worker copy: histogram", pattern: /^worker-tool-histogram-[^/]+\.js$/, budget: 1_500, deployOnly: true },
	{ label: "worker copy: json-code", pattern: /^worker-tool-json-code-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	{ label: "worker copy: bench fixture stress", pattern: /^worker-tool-stress-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	{ label: "worker copy: utf8-bytes", pattern: /^worker-tool-utf8-bytes-[^/]+\.js$/, budget: 1_000, deployOnly: true },
	{ label: "worker copy: bench fixture deprecated", pattern: /^worker-tool-deprecated-[^/]+\.js$/, budget: 500, deployOnly: true },
	{ label: "worker copy: bench fixture retired", pattern: /^worker-tool-retired-[^/]+\.js$/, budget: 500, deployOnly: true },
	{ label: "worker copy: bench fixture slider", pattern: /^worker-tool-slider-[^/]+\.js$/, budget: 500, deployOnly: true },
	{ label: "worker copy: bench fixture discrete-series", pattern: /^worker-tool-discrete-series-[^/]+\.js$/, budget: 5_000, deployOnly: true },
	{ label: "worker copy: bench fixture styled-output", pattern: /^worker-tool-styled-output-[^/]+\.js$/, budget: 1_000, deployOnly: true },
	{ label: "worker copy: bench fixture presets", pattern: /^worker-tool-presets-[^/]+\.js$/, budget: 500, deployOnly: true },
	{ label: "worker copy: bench fixture highlighted-input", pattern: /^worker-tool-highlighted-input-[^/]+\.js$/, budget: 500, deployOnly: true },
	{ label: "worker copy: build-order", pattern: /^worker-tool-build-order-[^/]+\.js$/, budget: 1_500, deployOnly: true },
	{ label: "worker copy: bench fixture graph-families", pattern: /^worker-tool-graph-families-[^/]+\.js$/, budget: 6_500, deployOnly: true },
	{ label: "worker copy: bench fixture grammar-input", pattern: /^worker-tool-grammar-input-[^/]+\.js$/, budget: 1_000, deployOnly: true },
	{ label: "worker copy: bench fixture wide-output", pattern: /^worker-tool-wide-output-[^/]+\.js$/, budget: 1_500, deployOnly: true },
];

let files;
try {
	files = readdirSync(ASSETS);
} catch {
	console.error(`No build found at ${ASSETS}. Run \`pnpm bench:build\` first.`);
	process.exit(1);
}

const kb = (n) => `${(n / 1000).toFixed(1)} KB`;
const rows = [];
let failed = 0;

for (const { label, pattern, budget, deployOnly } of BUDGETS) {
	const matches = files.filter((f) => pattern.test(f));
	if (matches.length !== 1) {
		// Zero means the chunk vanished or was renamed; more than one means manualChunks stopped
		// splitting the way the docs describe. Both are real problems, not test noise.
		console.error(`✗ ${label}: expected exactly one file matching ${pattern}, found ${matches.length}`);
		failed++;
		continue;
	}
	const size = gzipSync(readFileSync(join(ASSETS, matches[0]))).length;
	const over = size > budget;
	if (over) failed++;
	rows.push({ label, size, budget, over, deployOnly });
}

/*
 * ⚠️ Every built asset must be claimed by a budget line (#86).
 *
 * The loop above only looks at files a pattern matches, so a new chunk nobody wrote a line for was never
 * measured, and the run stayed green: regex-explainer arrived as the largest tool in the repository and
 * was invisible, and the same mistake had happened twice before. Anything left over now fails the run,
 * which turns "remember to add a line" into something CI does. Source maps are not shipped to a reader,
 * so they are the one exclusion, by name rather than by silence.
 */
const UNMEASURED = [/\.map$/];
const claimed = new Set(BUDGETS.flatMap(({ pattern }) => files.filter((f) => pattern.test(f))));
const unclaimed = files.filter((f) => !claimed.has(f) && !UNMEASURED.some((p) => p.test(f)));
for (const file of unclaimed) {
	console.error(
		`✗ ${file}: no budget line measures this file. Add one to BUDGETS in scripts/size-check.mjs, and decide whether a reader downloads it (reader cost) or only the bench does (deployOnly: true).`,
	);
	failed++;
}

/*
 * The project site (site/), measured as a page rather than as chunks: everything its landing page loads
 * from the HTML itself, scripts, module preloads and stylesheets, before any tool code is fetched.
 *
 * deployOnly, because no consumer downloads the project's own site. It is watched anyway because the
 * landing page is where the "tiny" claim is made, and a page that argues for its runtime size while
 * weighing twice that would undo the argument. A web font, if one is ever adopted, is not in this
 * figure; it would need a line of its own.
 *
 * 34_000, measured at 32,796 on the system font stack: 25,718 is the runtime with the site's tool
 * manifests, the same cost a consumer pays, and 7,078 the page's own script and stylesheet. The line
 * was drafted at 33_000 against 31,240, before the graph kind (#181 to #183) grew the runtime by about
 * 0.9 KB; turning off Vite's modulepreload polyfill took 0.2 KB back. 33_000 would have left 204 bytes.
 *
 * Raised to 35_000 when the site moved onto 0.10.1, measured at 34,610: the runtime with the site's
 * manifests is now 27,571, up 1,853 from the Copy action, byte colours, the declared-sdk check, the
 * grammar and the fix that lets a wide result scroll, all spent in the runtime and paid by every consumer
 * too. The page's own script and stylesheet are 7,039, 39 fewer than before. 34_000 would have been 610
 * bytes over.
 */
const SITE = join(import.meta.dirname, "..", "site", "dist");
const SITE_PAGES = [{ label: "site landing page, JS and CSS", page: "index.html", budget: 35_000 }];
let siteHtml = null;
try {
	siteHtml = readFileSync(join(SITE, "index.html"), "utf8");
} catch {
	/*
	 * ⚠️ Missing is a failure in CI and a warning locally. CI builds the site before this script, so a
	 * missing build there means the step was removed and the line would stop measuring silently. Locally,
	 * `pnpm bench:build && pnpm size` is the documented loop for runtime work and should not need a site build.
	 */
	const message = `No site build at ${SITE}. Run \`pnpm site:build\` to measure the site's landing page.`;
	if (process.env.CI) {
		console.error(`✗ ${message}`);
		failed++;
	} else console.warn(`⚠ ${message} Skipped locally.`);
}
if (siteHtml !== null) {
	for (const { label, page, budget } of SITE_PAGES) {
		const text = readFileSync(join(SITE, page), "utf8");
		const refs = [
			...[...text.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]),
			...[...text.matchAll(/<link[^>]*rel="(?:stylesheet|modulepreload)"[^>]*href="([^"]+)"|<link[^>]*href="([^"]+)"[^>]*rel="(?:stylesheet|modulepreload)"/g)].map((m) => m[1] ?? m[2]),
		];
		// Asset URLs carry the Pages prefix in a production build; the files sit under dist/assets either way.
		const files = [...new Set(refs.filter((r) => r.includes("/assets/")).map((r) => r.slice(r.indexOf("/assets/") + 1)))];
		const size = files.reduce((sum, f) => sum + gzipSync(readFileSync(join(SITE, f))).length, 0);
		const over = size > budget;
		if (over) failed++;
		rows.push({ label, size, budget, over, deployOnly: true });
	}
}

const width = Math.max(...rows.map((r) => r.label.length));
console.log("\nTransfer size, gzipped:\n");
for (const { label, size, budget, over } of rows) {
	const pct = Math.round((size / budget) * 100);
	console.log(
		`  ${over ? "✗" : "✓"} ${label.padEnd(width)}  ${kb(size).padStart(8)}  of ${kb(budget).padStart(8)} budget  (${pct}%)`,
	);
}
// Only what a single reader can actually download: the worker copies are alternatives to the
// main-thread ones, never both on one page.
const total = rows.filter((r) => !r.deployOnly).reduce((sum, r) => sum + r.size, 0);
console.log(`\n  ${"worst case for one reader".padEnd(width)}  ${kb(total).padStart(8)}\n`);

if (process.argv.includes("--update")) {
	const find = (label) => rows.find((r) => r.label === label)?.size ?? 0;
	const edits = [
		/*
		 * ⚠️ Anchored on the leading "| Runtime" and the trailing "| " only.
		 *
		 * These patterns quoted each table's whole row label, so editing the prose in a row silently
		 * stopped it matching, and the README then published 17.8 KB while the chunk was really 18.9 KB.
		 * Nothing failed: this script only exits non-zero on a budget overrun, so a figure it can no
		 * longer find is a figure nobody checks. Matching the least text that still identifies the row is
		 * what keeps it working when somebody rewords the label.
		 */
		/*
		 * ⚠️ The badge as well as the table. It is the most-read number in the repository and the only one
		 * that was not covered here, so it sat at 19.6 KB while the table beside it moved twice. A published
		 * figure the refresh tool cannot reach is a figure that rots, which is the whole argument for this
		 * block existing.
		 */
		["README.md", /(runtime-)[\d.]+(%20KB%20gzip)/, kb(find("runtime + host wiring")).replace(" KB", "")],
		["README.md", /(\| Runtime[^|]*\| )[\d.]+ KB/, kb(find("runtime + host wiring"))],
		["docs/architecture.md", /(\| Runtime[^|]*\| )[\d.]+ KB/, kb(find("runtime + host wiring"))],
		["README.md", /(\| Worker entry[^|]*\| )[\d.]+ KB/, kb(find("worker entry"))],
		["README.md", /(\| Graph kind[^|]*\| )[\d.]+ KB/, kb(find("graph: base"))],
		["docs/architecture.md", /(\| Graph kind[^|]*\| )[\d.]+ KB/, kb(find("graph: base"))],
		["docs/architecture.md", /(\| Worker entry[^|]*\| )[\d.]+ KB/, kb(find("worker entry"))],
		/*
		 * ⚠️ The per-tool rows, which this block did not own until a tool was added and somebody checked.
		 *
		 * They were typed by hand, so they drifted exactly as you would expect: both tables published
		 * `percentiles` at 1.2 KB while the chunk measured 1.3. Nobody noticed, because nothing fails on a
		 * stale figure. Generated from the same rows as everything else here, so adding a tool means adding
		 * one line below and one row to each table, and never a number.
		 */
		...["percentiles", "queue-explorer", "regex-explainer", "histogram", "build-order"].flatMap((id) => [
			["README.md", new RegExp(`(\\| \`${id}\` tool chunk[^|]*\\| )[\\d.]+ KB`), kb(find(`tool: ${id}`))],
			["docs/architecture.md", new RegExp(`(\\| \`${id}\` chunk[^|]*\\| )[\\d.]+ KB`), kb(find(`tool: ${id}`))],
		]),
	];
	for (const [file, pattern, value] of edits) {
		const path = join(import.meta.dirname, "..", file);
		const before = readFileSync(path, "utf8");
		/*
		 * ⚠️ A function, not a `$1${value}$2` string.
		 *
		 * The badge pattern has a trailing group and the table patterns do not, and `$2` in a replacement
		 * string is left LITERALLY when the pattern has no second group. That shipped: four published
		 * figures read "20.2 KB$2" until somebody looked. A function receives the groups as arguments, so a
		 * missing one is `undefined` and defaults away instead of printing itself.
		 */
		const after = before.replace(pattern, (...args) => {
			/*
			 * `replace` calls this with (match, ...groups, offset, string), so the groups are everything
			 * between the first argument and the last two. Naming them positionally is how the first
			 * attempt at this went wrong twice: `$2` in a replacement STRING printed itself literally when
			 * the pattern had one group, and a named second parameter then picked up the offset and
			 * published "20.2 KB18571". Slicing is the only form that does not depend on how many groups a
			 * particular pattern happens to have.
			 */
			const groups = args.slice(1, -2);
			return `${groups[0] ?? ""}${value}${groups[1] ?? ""}`;
		});
		if (after !== before) {
			const { writeFileSync } = await import("node:fs");
			writeFileSync(path, after);
			console.log(`updated ${file} -> ${value}`);
		}
	}
}

if (failed > 0) {
	console.error(
		`${failed} budget${failed === 1 ? "" : "s"} exceeded. Look at what grew, then either fix it or\n` +
			"raise the budget in scripts/size-check.mjs in the same commit, saying what bought the bytes.\n",
	);
	process.exit(1);
}
