# Styling tool output

A tool's result is drawn inside a shadow root. Your page's CSS cannot reach in, so a host restyles it in
one of two ways:

1. **Custom properties** (`--tb-accent`, `--tb-bg`, `--tb-font` and the rest), set on `tool-host` from
   your page. Colours, fonts, radius, spacing. See [Theming](README.md#theming).
2. **Host stylesheets**, adopted into every tool's shadow root by the runtime. Layout, size, borders,
   emphasis: anything CSS can do to the markup described below.

This document is about the second, and it is versioned API: the class names and attributes listed here
are a contract, under the rule in [What may change](#what-may-change).

## Passing a stylesheet

```ts
import { defineToolHost, setHostStyles } from "@toolbench/runtime";

defineToolHost({
  source,
  styles: [hostSheet, ".tb-out-table td { border: 1px solid var(--tb-border); }"],
});
```

`styles` takes a `CSSStyleSheet`, a string of CSS, or a list of either. A string is parsed once and the
resulting sheet shared by every tool on the page. To give one tool something extra, pass a map, where
`"*"` applies to every tool and comes first:

```ts
defineToolHost({ source, styles: { "*": [base], "my-tool-id": [extra] } });
```

`setHostStyles(styles)` replaces the host's sheets on every tool already on the page and on every one
created later, without reloading, which is what a theme switch needs. `setHostStyles(undefined)` removes
them.

A sheet your page adopted into a shadow root by hand is left where it is, after the runtime's own.

### The guarantee: your rules win

**Every rule the runtime ships is inside `@layer toolbench`.** A rule in your sheet that is not inside a
layer beats every runtime rule, whatever the specificity of either. You do not need to match the
runtime's selectors, or read them, to override them.

So `.tb-out-table td { text-align: start }` wins over the runtime's more specific
`.tb-out-table td[data-align="end"] { text-align: end }`. Without the layer it lost, and stacked table rows
kept half their values pinned to the right edge.

If you put your own rules in a layer, they are compared with `toolbench` by layer order instead, which is
standard CSS: a layer declared later wins.

The runtime's sheet is always first in the root, and yours after it, whichever was adopted first.

Where `adoptedStyleSheets` is unavailable, the runtime's sheet and yours become `<style>` elements in the
same order, so the cascade is the same.

## What you can select

### Structure

| Class | Element |
|---|---|
| `.tb` | The frame around everything a tool draws. A size container, so `@container` queries measure the tool, not the viewport |
| `.tb-head`, `.tb-title`, `.tb-name`, `.tb-blurb`, `.tb-mark` | The heading, the tool's name, its one-line blurb, and a `deprecated` or `retired` mark |
| `.tb-body` | Form, actions, status and output |
| `.tb-facade`, `.tb-facade-hint` | A closed card, and its "Try it" control |
| `.tb-form`, `.tb-field-row`, `.tb-label`, `.tb-desc`, `.tb-input`, `.tb-textarea`, `.tb-select`, `.tb-checkbox`, `.tb-slider` | The generated form |
| `.tb-samples`, `.tb-sample` | The row of sample inputs, and each button |
| `.tb-actions`, `.tb-run`, `.tb-progress` | The Run button and the progress bar |
| `.tb-status` | The visible status line |
| `.tb-output` | Where the result is drawn |
| `.tb-more`, `.tb-disclose`, `.tb-rest` | A truncated result's notice, its expand button, and the parts it reveals |
| `.tb-copy-bar`, `.tb-copy`, `.tb-copy-note` | Under a code or table result: the row, its Copy button, and the note beside it saying whether the copy worked. Not on a closed card |
| `.tb-foot` | Links under the tool |

### Result parts

Every part of a result has `data-kind` on its root element, naming its kind: `fields`, `text`, `code`,
`table`, `series`, `heatmap`, `pie`, `radar`, `treemap`, `venn`, `graph`, `bytes`, `group` or `error`. A part
the tool gave a `role` also has `data-role`, with the tool's string unchanged.

| Kind | Root | Inside it |
|---|---|---|
| `group` | `.tb-group` | One root per part |
| `fields` | `.tb-out-fields` | `.tb-fields` (a `<dl>`, for grouped and ungrouped fields alike), `.tb-field-group` with an `<h4>` for a group, `.tb-field` (with `<dt>` and `<dd>`), `.tb-value`, `.tb-note` |
| `table` | `.tb-out-table` | A `<table>`, with `<caption>`, `<thead>`, `<tbody>`, then `.tb-copy-bar` |
| `text` | `.tb-out-text` | A `<p>`, or a `<pre class="tb-mono">` |
| `code` | `.tb-out-code` | `<pre><code class="language-…">`, then `.tb-copy-bar` |
| `bytes` | `.tb-out-bytes` | `.tb-bytes-grid`, `.tb-bytes-row`, `.tb-bytes-offset`, `.tb-bytes-hex`, `.tb-bytes-ascii`, `.tb-byte`, `.tb-bytes-legend`, `.tb-bytes-caption` |
| every chart kind | `.tb-out-chart`, plus `.tb-out-chart-card` on a card | The chart's own markup. Not covered: see below |
| `graph` | `.tb-out-graph` | `.tb-graph-plot` (the picture, one tab stop), `.tb-graph-readout`, `.tb-graph-data` (the edge table, a `<details>`), `.tb-graph-message` (why a graph is listed instead of drawn, or that it is being laid out). Inside the picture, the parts below |
| `error` | `.tb-out-error` | `.tb-error-message` |

A chart's internal markup, the SVG and its classes, is not part of this contract. Style a chart through its
root and the series colour properties. Its insides are drawn geometry and will change.

### Inside a graph

A graph's picture is different: a tool names its nodes, edges, groups and lanes, so a host can style them
by name. Every one carries `data-kind`, and `data-role` when the tool gave it one. Where they are drawn is
geometry and not covered; what they are, below, is.

| `data-kind` | Element | Also carries |
|---|---|---|
| `node` | `.tb-graph-node`, a `<g>` with `.tb-graph-shape` (the outline), `.tb-graph-name` and `.tb-graph-note` | `data-id`, `data-shape`, `data-color` |
| `collapsed-group` | `.tb-graph-node` standing for a closed group's members | `data-id` (the group's), `data-color` |
| `edge` | `.tb-graph-edge`, a `<g>` with `.tb-graph-line`, `.tb-graph-mark` for each end and `.tb-graph-label` | `data-line` (`dashed`, `dotted`), `data-width` (`thin`, `thick`), `data-color`, `data-routed` |
| `group` | `.tb-graph-group`, the rectangle | `data-id`, `data-depth`, `data-color` |
| `group-title` | The group's title, which closes it | `data-id` |
| `lane` | `.tb-graph-lane`, the band | `data-id` |
| `badge` | `.tb-graph-badge` | |

`data-color` is the tool's `tone` or `color`, `bad` or `series-3` say, and every coloured rule reads one
custom property, `--c`, so a host recolours a category by its `data-color` alone. A mark carries
`data-end` (`head`, `tail`) and `data-fill` (`solid`, `hollow`, `none`). A node or edge on the highlighted
path carries the class `tb-path`, and while a reader points at or focuses a node, it and its edges carry
`tb-hot` and its neighbours `tb-near`. A row of the edge table for a node with no edges carries
`data-orphan`.

```css
/* Decisions in a flowchart, drawn heavier: the tool set role: "decision" on them. */
.tb-graph-node[data-role="decision"] > .tb-graph-shape { stroke-width: 2.5; }
/* Development-only dependencies, faded. */
.tb-graph-edge[data-role="dev"] { opacity: 0.5; }
```

### Attributes

| Attribute | On | Values |
|---|---|---|
| `data-kind` | Every part's root | The part's kind |
| `data-role` | A part's root, or a `.tb-field` | Whatever `role` the tool set. Absent when it set none |
| `data-part` | A part's root | Whatever `id` the tool set, unique in the result. Absent when it set none. `host.reveal(id)` goes to it |
| `data-label` | Every table cell | Its column's label. Absent for a column with an empty label |
| `data-tone` | `.tb-field`, table cells | `normal`, `good`, `warn`, `bad`, `muted` |
| `data-align` | Table cells and headers | `start`, `end` |
| `data-series` | `.tb-byte`, `.tb-bytes-legend li` | `1` to `6`: the series colour of a range with no tone, in order, round again after six. Absent on a toned range |
| `data-lang` | `.tb-out-code` | The code's language |
| `data-state` | `.tb-output` | `running`, `idle` |
| `data-stale` | `.tb-output` | Present when the inputs have changed since the result was drawn |
| `data-status` | `tool-host` itself | `deprecated`, `retired`. Absent for a live tool |

`role` is the tool's to set: `{ kind: "fields", role: "stats", fields }` names a part, and
`{ label, value, role: "verdict" }` names one field. The runtime attaches no meaning to it, so a host
that styles nothing sees no difference.

## Examples

All four are plain CSS in a host sheet, and the
[styling page](bench/styling.html) applies them to real results in the browser tests.

**A prominent, colour-coded verdict.** One field, named by the tool with `role: "verdict"`:

```css
.tb-field[data-role="verdict"] { display: block; padding: 0.75rem 1rem; border-radius: var(--tb-radius); border: 1px solid var(--tb-border); }
.tb-field[data-role="verdict"][data-tone="bad"]  { background: color-mix(in oklab, var(--tb-bad) 12%, transparent);  border-color: var(--tb-bad); }
.tb-field[data-role="verdict"][data-tone="good"] { background: color-mix(in oklab, var(--tb-good) 12%, transparent); border-color: var(--tb-good); }
.tb-field[data-role="verdict"] dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
.tb-field[data-role="verdict"] .tb-value { font-family: var(--tb-font); font-size: 1.35rem; font-weight: 650; }
```

**Stat tiles.** A part named `role: "stats"`. `grid-template-columns: 1fr` on the tile is needed: the
runtime lays a field out as label and value side by side, and a tile that keeps that puts both in a 9rem
box and wraps the note a letter at a time.

```css
[data-role="stats"] .tb-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.5rem; }
[data-role="stats"] .tb-field { grid-template-columns: 1fr; gap: 0.25rem; padding: 0.75rem; border: 1px solid var(--tb-border); border-radius: 8px; background: var(--tb-surface); }
[data-role="stats"] .tb-value { font-size: 1.5rem; font-family: var(--tb-font); font-weight: 650; }
[data-role="stats"] .tb-note { display: block; margin: 0; }
```

**Bordered tables.** The good and muted tones are coloured by the runtime's own sheet.

```css
.tb-out-table table { border: 1px solid var(--tb-border); }
.tb-out-table th, .tb-out-table td { border: 1px solid var(--tb-border); }
```

**Stacked rows on a narrow tool.** `.tb` is the query container, so this follows the tool's width, not
the screen's:

```css
@container (max-width: 30rem) {
  .tb-out-table thead { display: none; }
  .tb-out-table tr { display: grid; padding: 0.5rem 0; border-bottom: 1px solid var(--tb-border); }
  .tb-out-table td { border: 0; text-align: start; }
  .tb-out-table td[data-label]::before { content: attr(data-label); display: block; font-size: 0.72rem; color: var(--tb-muted); font-family: var(--tb-font); }
}
```

## What may change

Under semver, against `@toolbench/runtime`:

- **Removing or renaming** a class or attribute listed here, changing what it is on, or removing one of its
  values, is a **major** change.
- **Adding** a class, an attribute, or a value is a **minor** change. A host sheet written against one minor
  version keeps working on the next.
- Moving the runtime's rules out of `@layer toolbench` is a major change: it is what makes your rules win.
- Anything **not** listed here, including element nesting beyond what the tables say, chart internals, a
  graph's coordinates, and the runtime's own rule values, may change in any release. Do not select by position
  (`.tb-output > :nth-child(2)`); ask the tool for a `role` instead.
