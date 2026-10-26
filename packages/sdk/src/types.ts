/**
 * The contract. A tool is a function; everything else here describes what goes in and what comes
 * out, so a runtime can build an interface for a tool it has never seen.
 *
 * Two rules govern every change to this file:
 *
 *  1. **Additive only.** New output kinds and input types get added. Existing ones never change
 *     meaning, never lose a field, and never gain a required one.
 *  2. **No DOM, no framework, no host.** A tool must be runnable in plain Node, because that is how
 *     its fixtures are checked. Anything that needs a browser belongs in the runtime, not here.
 */

// ---------------------------------------------------------------------------
// Output: what a tool returns
// ---------------------------------------------------------------------------

/** A label and a value. The plainest thing a tool can say. */
export interface Field {
	/** What the value is: the term the value is listed under. */
	label: string;
	/** The value, shown as the tool formatted it. */
	value: string;
	/** A qualifier shown beside the value: a unit, a caveat, "(dynamic)". */
	note?: string;
	/** Fields sharing a group are rendered together under its name. */
	group?: string;
	/** Draws attention without inventing a severity scale, or `muted` to let a routine value recede. */
	tone?: TextTone;
	/**
	 * A name for this one field, rendered as `data-role`, so a host stylesheet can find "the verdict"
	 * without counting rows. The runtime gives it no meaning. Contract version 5.
	 */
	role?: string;
	/**
	 * Set the value, and its note, in the monospace face, for an address, a hex string or a header the
	 * reader compares character by character. `false` for a sentence or a plain number with a unit, which
	 * read like terminal output in it. Rendered as `.tb-mono` on the `<dd>`, the class a table cell uses.
	 * Contract version 8.
	 * @default true
	 */
	mono?: boolean;
}

export type Tone = "normal" | "warn" | "bad" | "good";

/**
 * The tones a field value or a table cell can take: every `Tone`, plus `muted` (contract version 5).
 *
 * `muted` is for the routine majority of a dense table, so the cells that matter are not buried among
 * cells coloured like them. Charts and byte ranges keep `Tone`, where a faded mark would read as missing.
 */
export type TextTone = Tone | "muted";

export interface Column {
	/** The header text, also set on each cell as `data-label` so host CSS can name a value on a narrow screen. */
	label: string;
	/**
	 * Alignment of the header and the column's cells. Without it, a cell given as a number aligns to the end
	 * and every other cell to the start.
	 * @default "start"
	 */
	align?: "start" | "end";
	/** Monospace, for anything the reader will compare digit by digit. */
	mono?: boolean;
	/**
	 * How the column's text wraps, rendered as `data-wrap` on its header and every cell, so a narrow layout
	 * knows which columns are sentences: `prose` may wrap and wants a reading width, `none` is a short token
	 * (a hash, a date, a status word) kept on one line. A cell's own `wrap` overrides it. Absent makes no
	 * claim, and no attribute is written. Contract version 8.
	 */
	wrap?: "prose" | "none";
	/**
	 * The column names each row: its cells render as `<th scope="row">` instead of `<td>`, so a screen reader
	 * announces the row's name with every cell, and on a narrow tool the column stays in view while the rest
	 * scrolls. Opt-in, because a host selector such as `td:first-child` stops matching those cells.
	 * Contract version 8.
	 * @default false
	 */
	rowHeader?: boolean;
}

/** A cell's `wrap` overrides its column's (contract version 8). */
export type Cell = string | number | { text: string; mono?: boolean; tone?: TextTone; wrap?: "prose" | "none" };

/** One line, bar or area on a chart. */
export interface Series {
	/** The series' name in the legend, the readout and the data table. */
	label: string;
	/** One value per x. A `null` is a gap, not a zero, and the distinction matters on a chart. */
	points: (number | null)[];
	/**
	 * Shown after each value in the readout, and after `label` in the legend and the data table. The first
	 * right-axis series' unit also goes beside `yLabelRight`.
	 */
	unit?: string;
	/**
	 * `points` draws a marker at each value and no line between them: for an x of separate items (frames,
	 * requests, runs) where nothing exists between two of them, so a joining line would invent a slope.
	 * Contract version 4.
	 *
	 * `step` holds each value until the next x, then rises or falls straight to the next: for state sampled
	 * on events (a buffer's depth, a configured rate), where a sloped line invents a gradual change (#117).
	 */
	shape?: "line" | "area" | "bar" | "points" | "step" | "band" | "box";
	/**
	 * The summary each `box` draws, one per x (#122, contract version 4): whiskers from `low` to `high`, a box
	 * from `q1` to `q3`, a rule at `median`, and `outliers` as points. The tool computes it, so what the
	 * whiskers mean (1.5 IQR, min to max, p5 to p95) is the tool's and belongs in the chart's labels. Set
	 * `points` to the medians, which is what the readout, links and scale read where they read one value.
	 */
	boxes?: ({ low: number; q1: number; median: number; q3: number; high: number; outliers?: number[] } | null)[];
	/**
	 * The lower edge of a `band`, one per x, with `points` as the upper edge: a spread such as p5 to p95,
	 * or a min-to-max envelope, filled between the two under every other series (#119, contract version 4).
	 * A `null` in either edge breaks the band.
	 */
	lower?: (number | null)[];
	/**
	 * Draw a marker at each value of a `line` or `area`, so every real point is visible and a series under
	 * an identical one can still be found. Each series gets its own marker shape. Contract version 4.
	 */
	markers?: boolean;
	/**
	 * Bar series sharing a `stack` id are stacked at each x, in series order, bottom to top, so a reader
	 * sees each part and the total (#115, contract version 4). Positive and negative values stack away from
	 * zero separately. Bar series without one are grouped beside the stack as before.
	 */
	stack?: string;
	/**
	 * This series' own x values, one per point, instead of the chart's shared `x`: for measurements that do
	 * not share x positions, a scatter of (delay, cut-off) pairs say (#120, contract version 4). The x scale
	 * covers every series. Usually with `shape: "points"`.
	 */
	x?: number[];
	/**
	 * A third measure per point, drawn as the AREA of a bubble on a `points` series (#127, contract version 4).
	 * By area, not radius, so a value twice as large looks twice as large. `sizeLabel` names it in the key
	 * and the readout: "Calls".
	 */
	sizes?: (number | null)[];
	/**
	 * The name of `sizes` in the key, the readout and the data table.
	 * @default "Size"
	 */
	sizeLabel?: string;
	/**
	 * `right` draws the series against a second y scale on the right, titled by the chart's `yLabelRight`.
	 * @default "left"
	 */
	axis?: "left" | "right";
	/**
	 * What the readout says for this series at each point, replacing the formatted value there: "250 ms,
	 * 60 ms late". `null` keeps the default for that point. Same length as `points`. Contract version 4.
	 */
	notes?: (string | null)[];
}

/**
 * How a chart answers a pointer or keyboard focus. Omit it for the default: a crosshair at the nearest x
 * and a card listing every series there. Contract version 4.
 */
export interface Readout {
	/** `x`: every series at the nearest x (default). `point`: only the nearest point. `none`: no readout. */
	mode?: "x" | "point" | "none";
	/** Which crosshair lines to draw. Default `x`. */
	crosshair?: "x" | "y" | "both" | "none";
	/** A heading per x, replacing "<xLabel> <x>": "Frame 6 (lost)". `null` keeps the default. Same length as `x`. */
	titles?: (string | null)[];
	/** Highlight the matching row of this chart's own data table as the readout moves (#124). */
	highlightTable?: boolean;
}

export interface Chart {
	/** The x axis title, with `xUnit` in parentheses. Also heads the data table's x column. */
	xLabel: string;
	/** The left y axis title, with `yUnit` in parentheses. */
	yLabel: string;
	/**
	 * One position per value. Numbers for a quantity; text for named things, "Mesh", "SFU", "p99", which
	 * are drawn as evenly spaced categories in the order given (#113, contract version 4). If any value is
	 * text, all are read as text.
	 */
	x: (number | string)[];
	/** Every line, bar or area, drawn in order, each in the next of six series colours. A legend is shown when there is more than one. */
	series: Series[];
	/** Shown after `xLabel` in parentheses, on the axis and in the data table. */
	xUnit?: string;
	/** Shown after `yLabel` in parentheses. */
	yUnit?: string;
	/** A vertical marker with a name: "the knee", "capacity", "p99". */
	annotations?: { x: number | string; label: string }[];
	/**
	 * A labelled horizontal rule at a y value: a budget, an SLO, a limit (#114, contract version 4). Not a
	 * series, so it adds no legend entry, no data-table column and no readout row, and the y scale widens
	 * to show it. `tone` lets a limit read as one.
	 */
	thresholds?: { y: number; label: string; axis?: "left" | "right"; tone?: Tone }[];
	/** Second axis label, required if any series sets `axis: "right"`. */
	yLabelRight?: string;
	/** How the chart answers a pointer or keyboard focus. Default: a crosshair and every series at the nearest x. */
	readout?: Readout;
	/** A name a `table` in the same result can link to with `link.chart` (#124). Unique within a result. */
	id?: string;
	/**
	 * `horizontal` draws bars growing rightward, one row per x, for long category names and budgets read left
	 * to right (#116, contract version 4). Bar series only: other shapes are not drawn on a horizontal chart,
	 * and the data table's caption says so.
	 */
	orientation?: "vertical" | "horizontal";
	/**
	 * On a horizontal bar chart: series the tool gives as negative values are drawn to the left, and every
	 * label (ticks, readout, data table) shows the magnitude. For back-to-back comparisons and pyramids,
	 * where both sides are quantities and neither is negative (#125, contract version 4).
	 */
	mirror?: boolean;
	/**
	 * `log` draws an axis in powers of ten, for values spanning orders of magnitude: latency distributions,
	 * loss from 0.01% to 10% (#118, contract version 4). A log axis cannot show zero or a negative, so those
	 * points are left out and the data table's caption says so; bars are not drawn on a log y axis, because
	 * a bar's length means nothing there.
	 */
	yScale?: "linear" | "log";
	/**
	 * `log` draws the x axis in powers of ten, as `yScale` does for y. Ignored when `x` is text.
	 * @default "linear"
	 */
	xScale?: "linear" | "log";
}

/**
 * A value over two dimensions: latency by hour and weekday, loss by bitrate and delay (#121).
 *
 * `values[row][column]`, one row per `y` and one column per `x`. A `null` cell has no value and is drawn
 * hatched, never as zero. Colour alone never carries a value: every cell is in the readout and the data
 * table, and a key shows the scale.
 */
export interface Heatmap {
	/** The title under the columns. */
	xLabel: string;
	/** The title above the row labels. */
	yLabel: string;
	/** What a cell's value is, for the key and the readout: "p95 latency". */
	label: string;
	/** Shown after each value in the readout, and after `label` in the key and the data table's caption. */
	unit?: string;
	/** The column labels, left to right. */
	x: (number | string)[];
	/** The row labels, top to bottom. */
	y: (number | string)[];
	/** `values[row][column]`. A `null` or missing cell has no value and is drawn hatched. */
	values: (number | null)[][];
	/** `sequential` (default) is one hue, light to dark: how much. `diverging` is two hues either side of `midpoint`. */
	scale?: "sequential" | "diverging";
	/** The neutral value of a diverging scale. Default 0. */
	midpoint?: number;
}

/**
 * Parts of a whole (#123). Built so the known ways a pie misleads cannot happen: every slice is labelled
 * with its share, slices are drawn in the order given from 12 o'clock clockwise, more than six fold into
 * "Other", and a negative or zero total draws a message rather than a chart.
 */
export interface Pie {
	/** What the whole is: "Traffic by codec". */
	label: string;
	/** Shown after each value in the readout and in the data table's Value column. */
	unit?: string;
	/**
	 * `explode` pulls a slice out a little to point at it (#126). A slice pulled out looks bigger than it is,
	 * so use it for the one part the surrounding text is about, not for decoration.
	 */
	slices: { label: string; value: number; tone?: Tone; explode?: boolean }[];
	/** A ring rather than a disc, with `total` in its centre. */
	donut?: boolean;
	/** The donut's centre text: "48 kb/s". */
	total?: string;
}

/**
 * A profile across several measures (#128): one spoke per axis, clockwise from 12 o'clock, each series a
 * closed shape. All spokes share one scale from zero unless an axis gives its own `max`. At most four series
 * are drawn, since more overlap past reading.
 */
export interface Radar {
	/** What the chart is: its accessible name and the data table's caption. */
	label: string;
	/** Shown after each value in the readout, and after each series' name in the legend and the data table. */
	unit?: string;
	/**
	 * One spoke per axis, clockwise from 12 o'clock. An axis `max` gives that spoke its own scale; otherwise every
	 * spoke shares one, rounded up from the largest value to 1, 2 or 5 times a power of ten. Values are clamped
	 * between zero and the scale's top.
	 */
	axes: { label: string; max?: number }[];
	/** One value per axis; a `null` breaks the shape at that spoke rather than drawing it at the centre. */
	series: { label: string; values: (number | null)[] }[];
}

/** One node of a treemap: a leaf has a `value`, a branch has `children`. */
export interface TreemapNode {
	/** Drawn on the rectangle where it fits, cut at 18 characters, and always in the readout and the data table. */
	label: string;
	/**
	 * A leaf's size. A negative counts as zero, and a node of zero is not drawn. On a branch the children's sum
	 * is drawn instead, and the data table's caption says the two differed.
	 */
	value?: number;
	/** Drawn inside this node's rectangle, largest first. Past the third level they fold into their parent. */
	children?: TreemapNode[];
	/** Replaces the colour this node's top-level group gives it. `normal` keeps the group's colour. */
	tone?: Tone;
}

/** A hierarchy of sizes (#129): areas proportional to values, at most three levels drawn. */
export interface Treemap {
	/** What the whole is: its accessible name and the data table's caption. */
	label: string;
	/** Shown after each value on a rectangle, in the readout and in the data table. */
	unit?: string;
	/** The whole. Not drawn itself: its children are the top level, each in its own series colour. */
	root: TreemapNode;
}

/**
 * The overlap of two or three sets (#130). Two sets are drawn with exact areas. Three cannot in general be,
 * so every region is labelled with its count and the caption says the areas are approximate. More than three
 * sets, or an overlap larger than a set, draws a message instead.
 */
export interface Venn {
	/** What the diagram is: its accessible name and the data table's caption. */
	label: string;
	/** Shown after each count in the readout and in the data table's Count column. */
	unit?: string;
	/**
	 * Two or three sets, each `size` above zero and counting every member, including those in an overlap.
	 * Any other number of sets draws a message instead.
	 */
	sets: { label: string; size: number }[];
	/** `sets` are indices into `sets`: [0, 1], or [0, 1, 2] for the middle of three. */
	overlaps: { sets: number[]; size: number }[];
}

/**
 * A colour for a node, edge or group: a tone, or one of the eight series colours, always a theme token and
 * never a raw value, so dark mode and a host's theme keep working. Contract version 7.
 */
export type GraphColor = Tone | "accent" | "muted" | "series-1" | "series-2" | "series-3" | "series-4" | "series-5" | "series-6" | "series-7" | "series-8";

/**
 * Every `GraphColor`, as data: the union is closed only to TypeScript, so the runtime and the fixture runner
 * check a value against this list. The first four are the tones.
 */
export const GRAPH_COLORS: readonly GraphColor[] = ["normal", "warn", "bad", "good", "accent", "muted", "series-1", "series-2", "series-3", "series-4", "series-5", "series-6", "series-7", "series-8"];

/**
 * A node's outline. `rect`, `rounded`, `pill`, `circle`, `ellipse`, `diamond` and `point` are drawn by the
 * graph renderer itself; `hexagon`, `parallelogram`, `cylinder` and `document` by a chunk fetched for the
 * first graph that uses one; `record` draws `rows`. Contract version 7.
 */
export type GraphShape = "rect" | "rounded" | "pill" | "circle" | "ellipse" | "diamond" | "hexagon" | "parallelogram" | "cylinder" | "document" | "record" | "point";

export type GraphSide = "left" | "right" | "top" | "bottom";

/**
 * What an edge end looks like. `arrow` and `open` for direction; `diamond`, `circle` and `bar` for UML;
 * the crow's-foot cardinalities `one` to `zero-or-many` for entity-relationship diagrams. Contract version 7.
 */
export type GraphMarker =
	| "none"
	| "arrow"
	| "open"
	| "diamond"
	| "open-diamond"
	| "circle"
	| "open-circle"
	| "bar"
	| "one"
	| "only-one"
	| "zero-or-one"
	| "many"
	| "one-or-many"
	| "zero-or-many";

/** One row of a `record` node: a column of a table, with a port of its own an edge can name. */
export type GraphRow = {
	/** Unique within the node; what `fromPort` and `toPort` name. */
	id: string;
	/** The row's text, after `tag` and before `detail`. */
	label: string;
	/** Right-aligned and muted: a column type, a value. */
	detail?: string;
	/** A short tag before the label, such as PK or FK. */
	tag?: string;
};

export type GraphNode = {
	/** Unique within the graph. What edges, `highlight` and the edge table name. */
	id: string;
	/** Default: the id. */
	label?: string;
	/** A second, muted line under the label. */
	note?: string;
	/** Default `rounded`. */
	shape?: GraphShape;
	/** Status: the border and tint of the tone. Wins over `color`. */
	tone?: Tone;
	/** Category: a series colour or a named token. */
	color?: GraphColor;
	/** A few characters over the top-right corner: a count, a version. */
	badge?: string;
	/** The rows of a `record` node. */
	rows?: GraphRow[];
	/** The innermost group this node belongs to. Groups nest through `parent`. */
	group?: string;
	/** Layered layouts only: the swimlane. */
	lane?: string;
	/** Layered layouts only: pin this node to a rank, 0 being the first. */
	rank?: number;
	/** `manual` layout: the centre. `force` layout: pins the node here. */
	x?: number;
	/** `manual` layout: the centre's y, in the same units as `x`; a missing one counts as 0. `force` layout: pins the node only with `x` set too. */
	y?: number;
	/** Rendered as `data-role`, for host stylesheets. The runtime gives it no meaning. */
	role?: string;
};

export type GraphEdge = {
	/** The id of the node the edge leaves. Must name a node, or the graph is listed instead of drawn. */
	from: string;
	/** The id of the node the edge arrives at. Must name a node; the same as `from` draws a loop. */
	to: string;
	/** A row id on the `from` node, a `record`: the edge attaches at that row. Must name one of its rows. */
	fromPort?: string;
	/** A row id on the `to` node, a `record`: the edge attaches at that row. Must name one of its rows. */
	toPort?: string;
	/** The side of the `from` node the edge must use. Default: the side facing the other end. */
	fromSide?: GraphSide;
	/** The side of the `to` node the edge must use. Default: the side facing the other end. */
	toSide?: GraphSide;
	/** Drawn on the line at `labelAt`, and shown in the edge table and the keyboard readout. */
	label?: string;
	/** Where along the edge the label sits. Default `middle`. */
	labelAt?: "start" | "middle" | "end";
	/** Default `solid`. */
	line?: "solid" | "dashed" | "dotted";
	/** Default `normal`. */
	width?: "thin" | "normal" | "thick";
	/** Status: the line in the tone's colour. Wins over `color`, except `normal`. */
	tone?: Tone;
	/** Category: a series colour or a named token for the line. An unknown value draws the default colour. */
	color?: GraphColor;
	/** At `to`. Default `arrow` when the graph is directed, else `none`. */
	head?: GraphMarker;
	/** At `from`. Default `none`. */
	tail?: GraphMarker;
	/** Rendered as `data-role`, for host stylesheets. The runtime gives it no meaning. */
	role?: string;
};

export type GraphGroup = {
	/** Unique among groups and nodes, because a collapsed group is drawn as a node with this id. What a node's `group` names. */
	id: string;
	/** The title at the group's top-left corner, which collapses the group when pressed. Also the collapsed node's label. */
	label: string;
	/** The enclosing group. Groups nest to any depth; a cycle of parents is refused. */
	parent?: string;
	/** Drawn as one node standing for its members until a reader opens it. Default false. */
	collapsed?: boolean;
	/** The box's colour, and the colour of the node standing for the group when collapsed. Default: the plain border. */
	color?: GraphColor;
	/** Rendered as `data-role` on the box and on the collapsed node, for host stylesheets. The runtime gives it no meaning. */
	role?: string;
};

/** A swimlane: a straight band across a layered layout. A group may not span two. */
export type GraphLane = {
	/** Unique among lanes. What a node's `lane` names. */
	id: string;
	/** The title at the start of the band. */
	label: string;
	/** Rendered as `data-role` on the band, for host stylesheets. The runtime gives it no meaning. */
	role?: string;
};

/**
 * Nodes and edges, laid out and drawn by the runtime (#152, contract version 7): flowcharts, state machines,
 * dependency graphs, org charts, networks, entity-relationship diagrams.
 *
 * The tool says what is connected and the runtime decides where everything goes, deterministically: the same
 * graph gives the same picture in every engine. Every edge is also listed in a table under the picture, and the
 * picture can be walked with the keyboard, so the graph is never only a picture.
 *
 * Nothing here is a hard limit. Sizes, nesting depth and counts are the tool's decision; `limits` lets a tool
 * say where its own graph stops being worth drawing.
 */
export type Graph = {
	/** What the graph is: "Order lifecycle". The figure's accessible name. */
	label: string;
	/**
	 * Default `layered`: ranks along `direction`, for anything with a flow. `tree` and `radial` for a
	 * hierarchy, `force` for a network with no direction, `manual` to place every node at its `x` and `y`.
	 */
	layout?: "layered" | "tree" | "radial" | "force" | "manual";
	/** Default `LR` for layered, `TB` for tree. */
	direction?: "LR" | "RL" | "TB" | "BT";
	/**
	 * Default `orthogonal` for layered and tree, `straight` for force and manual, `spline` for radial. An edge
	 * a straight line cannot draw without crossing a node is drawn as a polyline instead.
	 */
	routing?: "orthogonal" | "spline" | "straight" | "polyline";
	/** Default true. */
	directed?: boolean;
	/**
	 * Default `none`: no two edges ever share a stretch of line. `source` lets the edges leaving one node share
	 * a trunk, the bus of an org chart; `target` the edges arriving at one.
	 */
	merge?: "none" | "source" | "target";
	/** Force layout only. Default 1. The same seed gives the same picture everywhere. */
	seed?: number;
	/** Default `normal`. */
	spacing?: "compact" | "normal" | "loose";
	/** Every node, ids unique. At least one, or the graph is listed instead of drawn. */
	nodes: GraphNode[];
	/** Every edge, each end naming a node. All are also listed in a table under the picture. */
	edges: GraphEdge[];
	/** Boxes drawn around their members in any layout. A node joins one with `group`. */
	groups?: GraphGroup[];
	/** Swimlanes, in order. Layered layouts only. A node joins one with `lane`. */
	lanes?: GraphLane[];
	/** A path to emphasise, as node ids in order. */
	highlight?: string[];
	/**
	 * The tool's own limits. Past either, the runtime shows the edge table and says why instead of drawing.
	 * No default: without one, any size is drawn.
	 */
	limits?: { nodes?: number; edges?: number };
	/** What a reader can do with the picture. Every part is on by default. */
	interaction?: {
		/** Whether a reader can collapse and open groups. Default true. */
		collapse?: boolean;
		/** What pointing at or focusing a node emphasises. Default `neighbours`. */
		focus?: "neighbours" | "none";
		/** Whether picking two nodes highlights the shortest path between them. Default true. */
		paths?: boolean;
	};
};

/**
 * A run of bytes worth calling out inside a `bytes` output: a header field, a length prefix, the
 * region an error points at.
 *
 * `label` is what makes this more than colour. A highlight a reader cannot name tells them something
 * is interesting without saying what, and the label is also the only thing a screen reader gets.
 */
export interface ByteRange {
	/** Offset from the start of `bytes`, not from `offset`. */
	at: number;
	/** How many bytes, from `at`. Bytes past the end of `bytes` are not marked. */
	len: number;
	/** Named in the legend with its length and offset, and the hover title of each of its bytes. */
	label: string;
	/** Default: the next of six series colours, counted over ranges without a tone, so neighbouring ranges differ. */
	tone?: Tone;
}

/**
 * What a tool returns. A closed union: a runtime can render every member, and a tool cannot invent
 * a shape nobody can draw.
 *
 * ⚠️ `group` is what lets one tool answer in more than one shape. A decode that produces both a
 * field list and a table is the common case, not the exception.
 *
 * Every part may also carry the names in `PartNames`.
 */
export type Output = OutputBody & PartNames;

/**
 * Names any part of a result may carry, whatever its kind. Contract version 5.
 *
 * Names, not instructions: the runtime renders them as attributes and attaches no meaning, so a tool that
 * sets them looks the same on a host that styles nothing, and an older runtime simply ignores them.
 */
export interface PartNames {
	/**
	 * What this part is to the reader, `"verdict"` or `"stats"` say, rendered as `data-role` on the part's
	 * root element for host CSS and tests to find it by name rather than by position.
	 */
	role?: string;
	/**
	 * A name for this one part, unique within the result, rendered as `data-part`, so a page can link
	 * to it: `host.reveal(id)` opens it if it is collapsed, scrolls to it and moves focus there (#147).
	 * Where `role` says what kind of part this is, `id` says which one.
	 */
	id?: string;
}

type OutputBody =
	| {
			kind: "fields";
			/** Shown in order as a list of labels and values, grouped by `group`. A card shows the first `cardFields`. */
			fields: Field[];
	  }
	| {
			kind: "text";
			/** Shown as a paragraph, or preformatted when `mono` is set. */
			text: string;
			/**
			 * Monospace and preformatted, keeping spaces and line breaks.
			 * @default false
			 */
			mono?: boolean;
	  }
	| {
			kind: "code";
			/** Passed to the host's `highlight(source, lang)` hook and set as `data-lang`. A single token also becomes the `language-<lang>` class. */
			lang: string;
			/** Shown as is, and what Copy copies even when a highlighter adds line numbers. */
			source: string;
	  }
	| {
			kind: "table";
			/** The header row. Each row's cells line up with these in order. */
			columns: Column[];
			/** One array of cells per row, in column order. */
			rows: Cell[][];
			/** Shown above the table, except on a card. */
			caption?: string;
			/**
			 * Link these rows to a chart in the same result (#124): `keys[i]` is the chart x that row i
			 * describes, `null` for a row with none. Pointing at the chart highlights the matching rows, and
			 * pointing at a row moves the chart's readout to it. Contract version 4.
			 */
			link?: { chart: string; keys: (number | string | null)[] };
	  }
	| {
			kind: "series";
			/** The chart: its axes, its series and how it answers a pointer. */
			chart: Chart;
	  }
	/** A value over two dimensions, one coloured cell each (#121, contract version 4). */
	| {
			kind: "heatmap";
			/** The grid of values and its row and column labels. */
			heatmap: Heatmap;
	  }
	/** Parts of a whole, every slice labelled with its name and share (#123, contract version 4). */
	| {
			kind: "pie";
			/** The whole and its slices. */
			pie: Pie;
	  }
	/** A profile across several measures, one spoke each (#128, contract version 4). */
	| {
			kind: "radar";
			/** The axes and the series drawn across them. */
			radar: Radar;
	  }
	/** A hierarchy of sizes as nested rectangles (#129, contract version 4). */
	| {
			kind: "treemap";
			/** The hierarchy, from its root. */
			treemap: Treemap;
	  }
	/** The overlap of two or three sets (#130, contract version 4). */
	| {
			kind: "venn";
			/** The sets and their overlaps. */
			venn: Venn;
	  }
	/** Nodes and edges, laid out by the runtime, with every edge also in a table (#152, contract version 7). */
	| {
			kind: "graph";
			/** The nodes, edges, groups and lanes, and how to lay them out. */
			graph: Graph;
	  }
	| {
			kind: "group";
			/** Rendered in order, each by its own kind, and may nest. A host's `cardParts` caps how many are shown. */
			parts: Output[];
	  }
	/**
	 * Raw bytes, as a reader of a wire format wants to see them: offsets down the side, hex in the
	 * middle, printable characters in a gutter, and named ranges over the top.
	 *
	 * ⚠️ Added in contract version 2. A `table` can approximate this and gets it wrong in a way that
	 * matters: alignment has to be fought rather than given, and there is nowhere to put a highlight
	 * that spans columns or wraps a row.
	 *
	 * `offset` is what the first byte should be *labelled*, for a tool showing a window into
	 * something larger. It does not shift `ByteRange.at`, which is always relative to `bytes`.
	 */
	| {
			kind: "bytes";
			/** One number per byte, 0 to 255, drawn sixteen to a row. A card shows the first four rows. */
			bytes: number[];
			/**
			 * What the first byte is labelled in the offset column and the legend.
			 * @default 0
			 */
			offset?: number;
			/** Named ranges, each coloured over its bytes and listed in a legend. Where two overlap, the later one wins. */
			highlight?: ByteRange[];
			/** Shown above the grid, on a card too. */
			caption?: string;
	  }
	/**
	 * The INPUT was wrong, and the tool worked correctly by saying so. `input` names the control at
	 * fault so a generated form can mark it invalid and point a screen reader at the message.
	 * Without it, an error can only ever float unattached.
	 *
	 * A tool that is itself broken should THROW instead. The two render differently on purpose.
	 */
	| {
			kind: "error";
			/** Shown in full, never truncated, and announced. Also read as the description of the input named by `input`. */
			message: string;
			/** The id of the input at fault: that control is marked `aria-invalid` and points its description at the message. */
			input?: string;
			/** Where in that input's value the problem starts, shown after the message. The tools here give a character offset. */
			at?: number;
			/** How far the problem runs from `at`, shown as a range after the message. */
			len?: number;
			/**
			 * For a `rows` input, the index of the row at fault, 0 for the first: the message is shown under that
			 * row, named "Limits, row 2: ...", and its cells are marked invalid. Contract version 9.
			 */
			row?: number;
	  };

export type OutputKind = Output["kind"];

/** Every kind this contract version can express. The runtime checks its renderers against this. */
export const OUTPUT_KINDS: readonly OutputKind[] = [
	"fields",
	"text",
	"code",
	"table",
	"series",
	"group",
	"error",
	"bytes",
	"heatmap",
	"pie",
	"radar",
	"treemap",
	"venn",
	"graph",
];

// ---------------------------------------------------------------------------
// Input: what a tool asks for
// ---------------------------------------------------------------------------

interface InputBase {
	/** The key this input's value has in `run(values)`. Unique within the tool. */
	id: string;
	/** The visible label, which is also the control's accessible name. */
	label: string;
	/**
	 * The hint a form shows and a screen reader reads. Not a placeholder: those vanish on focus. Takes light
	 * markup: a blank line starts a paragraph, a line starting "- " is a list item, `code`, **strong**, and
	 * {good|text} for the tones good, warn, bad, muted and accent. Anything else is text.
	 */
	description?: string;
	/**
	 * The rest of the help, behind a native disclosure under the description: every case a format covers,
	 * per-vendor rules, the reasons. Takes the same markup as `description`. It is not part of the control's
	 * accessible description, so a screen reader announces only the short hint on focus. Contract version 8.
	 */
	details?: string;
	/** Shown after the control: "ms", "req/s", "bytes". A number without one is a riddle. */
	unit?: string;
	/**
	 * Show this input on a compact card, where there is only room for what matters.
	 *
	 * Mark as many as the question genuinely needs: a card asking "how many servers" is useless with only
	 * one of a rate and a duration. Mark none and a card shows the first input. Every input is shown on the
	 * full tool regardless.
	 */
	primary?: boolean;
	/**
	 * Force text direction. Bytes, code and identifiers are left-to-right even inside right-to-left
	 * prose, and a runtime cannot know which is which, so the tool says.
	 */
	dir?: "ltr" | "auto";
	/**
	 * Whether a host may put this input's value in a link it builds from `host.values`, and read it back
	 * from one. `false` for a credential or pasted private material: a URL ends up in browser history,
	 * server logs, chat previews and referrer headers. A privacy hint for hosts, not access control: the
	 * runtime builds no links and does not enforce it, and `host.values` still writes the input. Contract
	 * version 8.
	 * @default true, and false on a secret
	 */
	share?: boolean;
	/**
	 * A name for this input, rendered as `data-role` on its `.tb-field-row`, so a host stylesheet can style
	 * "the credential" or "the advanced ones" without naming each id. The runtime gives it no meaning, as
	 * with a result part's `role`. Contract version 8.
	 */
	role?: string;
}

export type InputSpec =
	| (InputBase & {
			type: "text";
			/** The value the form opens with. */
			default: string;
			/** The most characters the control accepts. */
			maxLength?: number;
	  })
	| (InputBase & {
			type: "textarea";
			/** The value the form opens with. */
			default: string;
			/**
			 * Visible lines of text.
			 * @default 3
			 */
			rows?: number;
			/** The most characters the control accepts. */
			maxLength?: number;
			/**
			 * The language of what the reader types, passed to the host's `highlight(source, lang)` hook, the
			 * same one `code` results use, which paints it behind the textarea. A hint: with no hook, or a hook
			 * that cannot paint it, the textarea is the plain one. Contract version 6.
			 */
			lang?: string;
			/**
			 * The tool's own notation for `lang`, so a textarea is painted where no host highlighter knows the
			 * language: a state-machine syntax, a packet filter (#163). Requires `lang`. A host hook that paints
			 * `lang` still wins. Contract version 7.
			 */
			grammar?: TextareaGrammar;
	  })
	| (InputBase & {
			type: "number";
			/** The value the form opens with, within `min..max`. */
			default: number;
			/** The lowest value. Required: the only guard against a runaway value, and `run` receives it clamped. */
			min: number;
			/** The highest value, above `min`. */
			max: number;
			/** The increment for the arrow keys and the slider. Any value when omitted. */
			step?: number;
			/**
			 * `slider` asks for a range control beside the number box, for a tool read by sweeping a value
			 * rather than by typing one. A hint, not a type: a runtime that does not know it renders the box
			 * alone. Contract version 4.
			 */
			control?: "slider";
	  })
	| (InputBase & {
			type: "select";
			/** The option value the form opens with. */
			default: string;
			/** Two or more choices, with unique values. */
			options: SelectOption[];
			/**
			 * `segmented` draws the options as a row of segments instead of a dropdown, for two to five short
			 * choices a reader should see at once. They are native radio buttons in a fieldset, so the arrow keys,
			 * the single tab stop and the announcement are the browser's, and the chosen one is a solid accent
			 * fill. When a segment would not fit its label, measured as the form resizes, the row becomes stacked
			 * radios. A hint, not a type: `run` still receives an option value, presets work as they do on a
			 * dropdown, and a runtime that does not know it draws the dropdown. Contract version 9.
			 * @default the dropdown
			 */
			control?: "segmented";
	  })
	| (InputBase & {
			type: "toggle";
			/** Whether the form opens with it on. */
			default: boolean;
	  })
	| (InputBase & {
			type: "date";
			/**
			 * What the reader picks, in the browser's own picker: a day, a time of day, or both. `run` gets
			 * `YYYY-MM-DD`, `HH:MM` or `YYYY-MM-DDTHH:MM`, local time, with no zone. Contract version 9.
			 * @default "date"
			 */
			mode?: "date" | "time" | "datetime";
			/** The value the form opens with, written in the mode's format, within `min..max`. */
			default: string;
			/**
			 * The earliest value, in the mode's format. A value before it is refused before `run`, with a
			 * message naming the input, so `run` can trust the range.
			 */
			min?: string;
			/** The latest value, in the mode's format, not before `min`. */
			max?: string;
	  })
	| (InputBase & {
			type: "color";
			/**
			 * The colour the form opens with, as `run` gets every colour: a lowercase `#rrggbb`, with no alpha
			 * and no shorthand. The reader types it in a hex box, the labelled control, or picks it from the
			 * system's picker in the swatch beside it. Contract version 9.
			 */
			default: string;
	  })
	| (InputBase & {
			/**
			 * A password, a token or a key, in a password field with a button to show it (#203). It has no
			 * `default`, and no sample or preset may set it: a manifest is published, so a value in it would be
			 * every reader's. The form opens empty, and a seed or a sample run sees `""`. `share` is `false`
			 * unless the input says `true`. Do not return the value in a result: a result is on screen,
			 * announced to a screen reader, and in a host's `tool-run` event. Contract version 9.
			 */
			type: "secret";
			/** The fewest characters `run` accepts. A shorter value is refused before `run`, naming the input. */
			minLength?: number;
			/** The most characters the control accepts, not below `minLength`. */
			maxLength?: number;
	  })
	| (InputBase & {
			/**
			 * Several choices from a fixed list (#204): `run` receives the chosen option values as a `string[]`, in
			 * the options' order, never more than `max` and never fewer than `min`. A reader below `min` is told so
			 * when they press Run, and the tool is not called. Contract version 9.
			 */
			type: "multiselect";
			/** The option values the form opens with chosen, each once, between `min` and `max` of them. `[]` for none. */
			default: string[];
			/** Two or more choices, with unique values. An option here takes no `sets`: several presets at once have no single meaning. */
			options: SelectOption[];
			/**
			 * The fewest a reader may choose. `1` is what makes "pick at least one" a rule.
			 * @default 0
			 */
			min?: number;
			/**
			 * The most a reader may choose. At it, the rest are marked unavailable, with the reason beside them.
			 * @default the number of options
			 */
			max?: number;
			/**
			 * How the choices are drawn: `checkboxes`, a native checkbox per option, or `chips`, a row of toggle
			 * buttons that wraps, for a long list of short values. A hint, like a number's `slider`.
			 * @default checkboxes up to 6 options, chips above
			 */
			control?: "checkboxes" | "chips";
	  })
	| (InputBase & {
			/**
			 * A list of rows the reader adds, removes and reorders (#204): hosts, or paths and their limits. `run`
			 * receives a `Row[]`, one object per row keyed by column id, even for one column, so a list of hosts is
			 * `rows.map((r) => r.host)`. Number cells arrive clamped, and never fewer rows than `minRows`: a reader
			 * below it is told so when they press Run, and the tool is not called. Contract version 9.
			 */
			type: "rows";
			/** One to four columns, each a text, number, select or toggle with that type's keys and no `default`. */
			columns: RowColumn[];
			/**
			 * The most rows a reader may add, at most 50. Required, as a number's `max` is: the guard against a
			 * runaway list, and a runaway link. At it, Add stays focusable with the reason beside it.
			 */
			maxRows: number;
			/**
			 * The fewest rows Run accepts.
			 * @default 0
			 */
			minRows?: number;
			/** The rows the form opens with, each with a value for every column. `[]` for none. */
			default: Row[];
	  });

/**
 * One column of a `rows` input: the keys of a single-value input of its type, without `default`,
 * `description` and the rest, which belong to the rows input. A new row's cell is empty text, the number
 * nearest 0 within `min..max`, the first option, or off. Contract version 9.
 */
export type RowColumn =
	| (RowColumnBase & {
			type: "text";
			/** The most characters a cell accepts. */
			maxLength?: number;
	  })
	| (RowColumnBase & {
			type: "number";
			/** The lowest value. Required, as on a number input. */
			min: number;
			/** The highest value, above `min`. */
			max: number;
			/** The increment for the arrow keys. Any value when omitted. */
			step?: number;
	  })
	| (RowColumnBase & {
			type: "select";
			/** Two or more choices, with unique values and no `sets`. */
			options: SelectOption[];
	  })
	| (RowColumnBase & { type: "toggle" });

/** What every column of a `rows` input has. */
export interface RowColumnBase {
	/** The key of this column's value in each row `run` receives. Unique within the input. */
	id: string;
	/** The column's heading, and the start of each cell's accessible name: "Path, row 2 of 3". */
	label: string;
	/** Shown after each cell: "req/s". */
	unit?: string;
	/** Force text direction, as on an input. */
	dir?: "ltr" | "auto";
}

/** One row of a `rows` input's value: a cell per column, keyed by column id. Contract version 9. */
export type Row = Record<string, string | number | boolean>;

/**
 * A textarea language a tool defines itself (#163), tokenised by the runtime and painted behind the real
 * textarea the way a host's highlighter is.
 *
 * Deliberately small, and data only: there is no pattern field, so a tool cannot ship a regular expression
 * that backtracks for seconds on a line a reader pasted. Validation caps every list. Contract version 7.
 */
export interface TextareaGrammar {
	/** Whole words drawn as keywords, case-sensitive: letters, digits and `_`. At most 64, each 32 characters or fewer. */
	keywords?: string[];
	/** What starts a comment that runs to the end of its line, `#` or `//`: ASCII punctuation, at most 4 characters. */
	comment?: string;
	/** Literal operators, `->` or `|`, the longest match winning: ASCII punctuation. At most 32, each 4 characters or fewer. */
	operators?: string[];
	/**
	 * The characters that open a string, each closed by itself, `"` or `"'`. A backslash escapes the next
	 * character, and a string ends at the end of its line. At most 4.
	 */
	strings?: string;
}

/** One choice in a `select`. */
export interface SelectOption {
	/** What `run` receives when this option is chosen. Unique within the select. */
	value: string;
	/** What the reader sees. */
	label: string;
	/**
	 * A preset: choosing this option writes these values into the other inputs it names, which the reader
	 * then edits. Partial, keyed by input id, checked like a sample's `input`. `run` still receives the
	 * select's own value.
	 *
	 * The select follows the form afterwards: once the values stop matching this option, it shows the
	 * preset they do match, or the first option with no `sets` (a "Custom"), or stays put if there is
	 * none. Contract version 6.
	 */
	sets?: InputValues;
}

export type InputType = InputSpec["type"];

export const INPUT_TYPES: readonly InputType[] = ["text", "textarea", "number", "select", "toggle", "date", "color", "secret", "multiselect", "rows"];

/**
 * One input's value: a string, a number or a boolean for the single-value types, a `string[]` for a
 * multiselect and a `Row[]` for rows (contract version 9). Widened, never narrowed, so a tool's own `type Input = { ... }` of
 * single values still satisfies `InputValues`.
 */
export type InputValue = string | number | boolean | string[] | Row[];

/** The shape a tool's `run` receives: one entry per declared input, keyed by id. */
export type InputValues = Record<string, InputValue>;

// ---------------------------------------------------------------------------
// Capabilities: what a tool is allowed to do
// ---------------------------------------------------------------------------

/**
 * `pure` is the only capability in contract version 1: a function of its inputs, no I/O, no clock,
 * no randomness that is not seeded. That is not a limitation to apologise for: it is what makes a
 * tool testable by fixture, runnable at build time, and safe to put on a landing page.
 *
 * Reading files and calling networks arrive in later versions, each with its own capability, so a
 * runtime can always tell from the manifest what a tool will try to do before it runs.
 */
export type Capability = "pure";

export const CAPABILITIES: readonly Capability[] = ["pure"];

// ---------------------------------------------------------------------------
// The tool itself
// ---------------------------------------------------------------------------

/**
 * An example input a tool ships with, rendered as a button under its form.
 *
 * These live in the manifest rather than in a host slot because example inputs are *tool* knowledge.
 * The author knows which input demonstrates a one-byte extension and which one is malformed; a host
 * does not, and a slot would make every host invent its own examples for every tool.
 *
 * The malformed example is the one that earns this field. It is the most useful thing a decoder can
 * offer and the one a reader will never type by hand, and it is how a tool shows that its failure
 * paths were designed rather than discovered.
 */
export interface Sample {
	/** What the button says. Short: it sits in a row with the others. */
	label: string;
	/**
	 * Values keyed by input id. Partial on purpose: a sample may set one field and leave the rest as
	 * the reader left them.
	 */
	input: InputValues;
}

export interface Manifest {
	/** The contract version this tool was written against. */
	sdk: number;
	/** Stable, lowercase, hyphenated. Also the directory name and the URL segment. */
	id: string;
	/** The tool's title, shown as its heading. */
	name: string;
	/** One sentence. Shown on cards and used as a page description. */
	blurb: string;
	/** The tool's own version, independent of `sdk`. */
	version: string;
	/** What the tool is allowed to do. At least one; `pure` is the only capability today. */
	capabilities: Capability[];
	/** The form, one control per entry, in order. At least one. */
	inputs: InputSpec[];
	/** Every kind `run` can return, so a host can refuse a tool it cannot draw. */
	kinds: OutputKind[];
	/** How the runtime loads and runs the tool. */
	runtime: {
		/** Entry file, relative to the tool's directory. */
		entry: string;
		/**
		 * `main` is the default and costs nothing. `worker` is for a tool whose running time depends
		 * on its input. It is the only mode where a timeout can actually stop anything.
		 */
		thread?: "main" | "worker";
	};
	/**
	 * Lifecycle. Default `live`.
	 *
	 * `deprecated` still runs, with a visible marker a host can style, and is refused as a live card.
	 * `retired` does not run: the element explains and renders `links`, so a bookmarked URL is not a 404.
	 */
	status?: "live" | "deprecated" | "retired";
	/** How the tool appears in a compact slot: runnable, a summary that links out, or not at all. */
	card?: "live" | "info" | "none";
	/** How many fields a card shows before it stops. Errors are never truncated. */
	cardFields?: number;
	/**
	 * Re-run as the reader types, instead of waiting for the Run button.
	 *
	 * Off by default, and that default is deliberate. A tool that runs on every keystroke does work
	 * nobody asked for, makes the Run button look broken (the answer is already there), and takes the
	 * decision away from the reader. Opt in only for a tool that is genuinely instant and reads better
	 * live, a unit converter say. Anything with a worker or a heavy loop should leave it alone.
	 */
	autoRun?: boolean;
	/**
	 * `false` hides the runtime's Reset control, which puts every input back to the values the tool opened
	 * with: for a tool with one input, where retyping it is the reset. Contract version 8.
	 * @default true
	 */
	reset?: boolean;
	/** Worker mode only. A tool that declares this on the main thread is rejected: nothing there can be stopped. */
	timeoutMs?: number;
	/** Markdown file, relative to the tool's directory, rendered as the tool's help. */
	help?: string;
	/** Free-form labels a host can filter or group tools by. */
	tags?: string[];
	/**
	 * Anything the tool wants to point at: a spec it implements, a post explaining it, a reference
	 * decoder. Deliberately generic: a host site's own content relations are the host's business.
	 */
	links?: {
		/** The link text. */
		label: string;
		/** An `http`, `https` or `mailto` URL, or a relative path. Anything else is refused. */
		href: string;
	}[];
	/**
	 * Example inputs, rendered as a row of buttons under the form. Added in contract version 3.
	 *
	 * Clicking one fills the form. It is an input change like any other, so the result goes stale and
	 * waits for Run, or re-runs if the tool set `autoRun`. A compact card does not show samples at all,
	 * because it has room for one input and a Run button, and a row of buttons there would crowd out
	 * the result the card exists to show.
	 */
	samples?: Sample[];
}

/** Passed to `run`. Built by whatever is executing the tool, never sent across a boundary. */
export interface Ctx {
	/**
	 * Aborted when the reader cancels, when the input changes mid-run, or when a worker-mode timeout
	 * fires. A loop whose length depends on input MUST check it: on the main thread it is the only
	 * way to stop.
	 */
	signal: AbortSignal;
	/**
	 * Progress, and optionally a partial result. A runtime renders `partial` at most once per frame,
	 * which is what lets a simulation show itself converging instead of hiding behind a bar.
	 */
	progress(fraction: number, partial?: Output): void;
}

/**
 * What a tool is.
 *
 * ⚠️ **Declare your input type as a `type`, not an `interface`.** TypeScript gives an implicit index
 * signature to a type alias of an object literal and not to an interface, so an interface will not
 * satisfy `InputValues` and the error message ("index signature is missing") does not hint at the
 * fix. This is the first thing a new tool author trips over.
 *
 * ```ts
 * type Input = { values: string; method: string };   // ✓
 * interface Input { values: string }                 // ✗ won't satisfy InputValues
 *
 * export default { run(input: Input, ctx) { … } } satisfies Tool<Input>;
 * ```
 */
export interface Tool<I extends InputValues = InputValues> {
	run(input: I, ctx: Ctx): Output | Promise<Output>;
}

/** What a tool module default-exports. */
export type ToolModule<I extends InputValues = InputValues> = { default: Tool<I> };

/** A manifest plus the module that implements it, which is what a runtime actually consumes. */
export interface LoadedTool<I extends InputValues = InputValues> {
	manifest: Manifest;
	tool: Tool<I>;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export interface Case {
	/** What the case checks, shown when it fails. */
	name: string;
	/** The values `run` receives, keyed by input id, passed exactly as given. */
	input: InputValues;
	/** The result `run` must return. */
	expect: Output;
	/**
	 * Exact deep equality by default, because that is what catches a duplicated field, a reordered
	 * one, or garbage emitted beside a correct error.
	 *
	 * `subset` is an opt-in escape for a tool whose output is genuinely open-ended, and it demands
	 * two things in return: a `why`, and a `fieldCount`, so a dropped field is still a failure.
	 */
	match?: "exact" | "subset";
	/** Why this case needs `subset`. Required with it. */
	why?: string;
	/** How many fields the result has. Required with `subset`, so a dropped field still fails. */
	fieldCount?: number;
}
