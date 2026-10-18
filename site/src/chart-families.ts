/**
 * The chart showcase, one family per page. Imported by the build (to write the family navigation into
 * the static markup) and by the page (to draw the current family's figures).
 *
 * Every figure is one case of the bench's `discrete-series` fixture, drawn by the real renderer. The
 * captions are the site's own, written for a visitor choosing a chart rather than for a test.
 */
export type ChartCase = { id: string; caption: string };
export type Family = { id: string; name: string; note: string; cases: ChartCase[]; planned?: boolean };

export const families: Family[] = [
	{
		id: "lines",
		name: "Lines, areas and steps",
		note: "For a quantity that changes along x. Markers show every real value, and a gap stays a gap.",
		cases: [
			{ id: "lines", caption: "Line. Frame 5 is lost, and the release line runs flat until the copy arrives." },
			{ id: "markers", caption: "Line with markers. One shape per series, so equal values stay apart." },
			{ id: "points", caption: "Points. The same data with nothing drawn between frames." },
			{ id: "area", caption: "Area. A send rate over a minute, filled from zero." },
			{ id: "step", caption: "Step. A value that holds until it changes, beside the same data as a line." },
			{ id: "band", caption: "Band. The p5 to p95 spread around a median, with a gap where data is missing." },
			{ id: "thresholds", caption: "Thresholds. Two labelled limits, and the scale widens to show the higher one." },
		],
	},
	{
		id: "bars",
		name: "Bars and histograms",
		note: "Bars grow from zero, sit side by side when there are several series, and stack when parts add up.",
		cases: [
			{ id: "histogram", caption: "Histogram. 200 gaps between arrivals, in bins 2 ms wide." },
			{ id: "two-bars", caption: "Grouped bars. Two series side by side." },
			{ id: "signed-bars", caption: "Bars either side of zero." },
			{ id: "categories", caption: "Categories, in the order the tool gave them." },
			{ id: "many-categories", caption: "Twenty-four categories. Every third is labelled; all of them are in the table." },
			{ id: "stacked", caption: "Stacked bars. Where each path's delay goes, against a budget line." },
			{ id: "stacked-signed", caption: "Stacked either side of zero, beside a bar that is not stacked." },
		],
	},
	{
		id: "horizontal",
		name: "Horizontal bars and pyramids",
		note: "One row per category, for long names and for budgets read left to right.",
		cases: [
			{ id: "horizontal", caption: "Horizontal stacked bars. The threshold becomes a vertical rule." },
			{ id: "horizontal-grouped", caption: "Horizontal grouped bars. Long names get a line of their own." },
			{ id: "pyramid", caption: "Pyramid. Upload to the left, download to the right, every number a magnitude." },
		],
	},
	{
		id: "combined",
		name: "Two axes",
		note: "Shapes mix on one chart, and each series reads the left or the right axis.",
		cases: [{ id: "combo", caption: "Calls as bars on the left axis, the drop rate as a line on the right." }],
	},
	{
		id: "scatter",
		name: "Scatter, bubbles and box plots",
		note: "Series with their own x values, a third measure as area, and the spread of a measurement per group.",
		cases: [
			{ id: "scatter", caption: "Scatter. The readout snaps to the nearest point." },
			{ id: "bubble", caption: "Bubble. Each bubble's area is its number of calls." },
			{ id: "box", caption: "Box plot. Whiskers from p5 to p95, outliers beyond." },
		],
	},
	{
		id: "log",
		name: "Log scales",
		note: "For values that span orders of magnitude.",
		cases: [{ id: "log", caption: "A throughput ceiling across loss from 0.01% to 10%: a straight line on two log axes." }],
	},
	{
		id: "reading",
		name: "Reading a value",
		note: "Every chart answers a pointer and a keyboard: tab to it, then step through it with the arrow keys.",
		cases: [
			{ id: "readout", caption: "A readout the tool writes itself." },
			{ id: "linked", caption: "A chart linked to its table. Point at either and the other follows." },
		],
	},
	{
		id: "heatmaps",
		name: "Heatmaps",
		note: "A value over two dimensions, on a sequential or a diverging scale, with a key.",
		cases: [
			{ id: "heatmap", caption: "Sequential. Packet loss by hour and weekday, one cell not measured." },
			{ id: "heatmap-diverging", caption: "Diverging. Change in p95 latency against last week." },
		],
	},
	{
		id: "parts",
		name: "Pies and donuts",
		note: "Parts of a whole, from 12 o'clock, each labelled with its share. Past six parts, the rest fold into Other.",
		cases: [
			{ id: "pie", caption: "Pie. Where one voice stream's 48 kb/s goes." },
			{ id: "donut", caption: "Donut, with the total in the centre." },
			{ id: "donut-exploded", caption: "Exploded donut. One slice pulled out, its share unchanged." },
			{ id: "pie-many", caption: "Eight parts folded to six." },
		],
	},
	{
		id: "profiles",
		name: "Radar, treemap and Venn",
		note: "A profile across several measures, a hierarchy by area, and how sets overlap.",
		cases: [
			{ id: "radar", caption: "Radar. Three networks on five measures, one not measured." },
			{ id: "treemap", caption: "Treemap. A month's cost, three levels deep." },
			{ id: "venn-two", caption: "Venn, two sets, drawn to scale." },
			{ id: "venn-three", caption: "Venn, three sets, every region labelled with its count." },
		],
	},
	{
		id: "refused",
		name: "When data cannot be drawn",
		note: "A chart that would mislead is refused, with the reason, instead of drawn.",
		cases: [
			{ id: "zero-bars", caption: "All zeros: no bars, on an axis that does not invent a range." },
			{ id: "log-zero", caption: "A zero on a log axis is left out, and the table says so." },
			{ id: "pie-negative", caption: "A negative share: a message instead of a pie." },
			{ id: "venn-impossible", caption: "Impossible overlaps: a message instead of a diagram." },
		],
	},
	{
		id: "graphs",
		name: "Graphs",
		note: "Nodes and edges: dependencies, flows and trees. This family arrives with the graph result kind, which is being built now.",
		cases: [],
		planned: true,
	},
];

export const DEFAULT_FAMILY = "bars";
