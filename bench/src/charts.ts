import "./boot.ts";
import { installThemeControl } from "./theme.ts";

installThemeControl();

/**
 * The chart gallery. One figure per case of the `discrete-series` fixture, in the order a reader meets
 * them: the shapes of a series first, then the chart kinds of their own.
 *
 * Each figure is a page-owned host, `controls="none"`, driven through `values` and `run()`. A form per
 * figure would be a dozen copies of the same select above charts that are the point of the page.
 */
const sections: { id: string; heading: string; note: string; cases: { id: string; caption: string }[] }[] = [
	{
		id: "lines",
		heading: "Lines, areas and steps",
		note: "For a quantity that changes along x. Markers show every real value; points drop the line where nothing exists between two values.",
		cases: [
			{ id: "lines", caption: "Line: frame 5 is lost, and the release line runs flat until the copy arrives" },
			{ id: "markers", caption: "Line with markers: every value visible, one shape per series, so equal values stay apart" },
			{ id: "points", caption: "Points: the same data with no line between frames" },
			{ id: "area", caption: "Area: one call's send rate over a minute, filled from zero (illustrative values)" },
			{ id: "step", caption: "Step: a value that holds until it changes, beside the same data as a line (offset by 10), which invents slopes" },
			{ id: "band", caption: "Band: the p5 to p95 spread around a median, drawn beneath it, with a gap where second 7 has no data (illustrative values)" },
			{ id: "thresholds", caption: "Thresholds: two labelled limits, the higher one above every value, so the scale widens to show it" },
		],
	},
	{
		id: "bars",
		heading: "Bars and histograms",
		note: "Bars grow from zero, sit side by side when there are several series, and take their labels from the bars themselves.",
		cases: [
			{ id: "histogram", caption: "Histogram: bars over bins, 200 inter-arrival gaps 2 ms wide (illustrative values)" },
			{ id: "two-bars", caption: "Grouped bars: two series side by side" },
			{ id: "signed-bars", caption: "Bars either side of zero" },
			{ id: "categories", caption: "Categories: three call topologies, in the order the tool gave them" },
			{ id: "many-categories", caption: "Many categories: twenty-four of them, every third labelled, and all in the data table and the readout" },
			{ id: "stacked", caption: "Stacked bars: where each path's delay goes, stage by stage, against a budget line" },
			{ id: "stacked-signed", caption: "Stacked either side of zero, beside a bar that is not stacked" },
		],
	},
	{
		id: "horizontal",
		heading: "Horizontal bars and pyramids",
		note: "One row per category, for long names and for budgets read left to right. A pyramid is a mirrored horizontal chart: one side drawn left, every number a magnitude.",
		cases: [
			{ id: "horizontal", caption: "Horizontal stacked bars: the delay budget read left to right, the threshold now a vertical rule" },
			{ id: "horizontal-grouped", caption: "Horizontal grouped bars: long names on their own line beside their bars (illustrative values)" },
			{ id: "pyramid", caption: "Pyramid: upload left, download right, every number a magnitude (illustrative values)" },
		],
	},
	{
		id: "combined",
		heading: "Combinations and two axes",
		note: "Shapes mix on one chart, each series on the left or right axis.",
		cases: [{ id: "combo", caption: "Combination: calls as bars on the left axis, the drop rate as a marked line on the right (illustrative values)" }],
	},
	{
		id: "scatter",
		heading: "Scatter, bubbles and distributions",
		note: "Series with their own x values, a third measure as bubble area, and the spread of a measurement per group.",
		cases: [
			{ id: "scatter", caption: "Scatter: two series with their own x values, so the readout snaps to the nearest point (illustrative values)" },
			{ id: "bubble", caption: "Bubble: loss against delay per region, each bubble's area its number of calls (illustrative values)" },
			{ id: "box", caption: "Box plot: the spread per network, morning and evening, whiskers p5 to p95 and outliers beyond (illustrative values)" },
		],
	},
	{
		id: "log",
		heading: "Log scales",
		note: "For values across orders of magnitude.",
		cases: [{ id: "log", caption: "Log scales: one TCP flow's throughput ceiling across loss from 0.01% to 10%, a straight line on two log axes" }],
	},
	{
		id: "reading",
		heading: "Reading a value",
		note: "Every chart answers a pointer, and a keyboard: tab to a chart and the arrow keys step through it. What the card says can be the tool's, and a chart can be linked to its table.",
		cases: [
			{ id: "readout", caption: "Readout written by the tool: a heading for frame 5, and how late each held frame was" },
			{ id: "linked", caption: "Linked chart and table: point at the chart and the row lights, or at a row and the chart follows. Open the data table to see it there too" },
		],
	},
	{
		id: "heatmaps",
		heading: "Heatmaps",
		note: "A value over two dimensions. Sequential is one hue, light to dark; diverging is two hues around a neutral midpoint. The key shows the scale, and every cell answers the pointer and the arrow keys.",
		cases: [
			{ id: "heatmap", caption: "Heatmap, sequential: packet loss by hour and weekday, with one cell not measured (illustrative values)" },
			{ id: "heatmap-diverging", caption: "Heatmap, diverging: change in p95 latency against last week, faster in orange, slower in blue (illustrative values)" },
		],
	},
	{
		id: "parts",
		heading: "Pies and donuts",
		note: "Parts of a whole, drawn in the order given from 12 o'clock, every part labelled with its share. More than six parts fold into Other.",
		cases: [
			{ id: "pie", caption: "Pie: where one voice stream's 48 kb/s goes" },
			{ id: "donut", caption: "Donut: the total in the centre (illustrative values)" },
			{ id: "donut-exploded", caption: "Exploded donut: one slice pulled out to point at it, its share unchanged (illustrative values)" },
			{ id: "pie-many", caption: "Pie of eight parts, folded to six: the three smallest become Other (illustrative values)" },
		],
	},
	{
		id: "profiles",
		heading: "Radar, treemap and Venn",
		note: "A profile across several measures, a hierarchy by area, and how two or three sets overlap.",
		cases: [
			{ id: "radar", caption: "Radar: three networks scored on five measures, with one not measured (illustrative values)" },
			{ id: "treemap", caption: "Treemap: a month's cost by area and component, three levels deep (illustrative values)" },
			{ id: "venn-two", caption: "Venn, two sets, drawn exactly: each circle's area its size, the lens its overlap" },
			{ id: "venn-three", caption: "Venn, three sets: every region labelled with its count, the areas approximate (illustrative values)" },
		],
	},
	{
		id: "refused",
		heading: "When the data cannot be drawn",
		note: "These are meant to look like this. Each kind refuses data it would draw wrongly, and says why, rather than drawing a chart that misleads.",
		cases: [
			{ id: "zero-bars", caption: "All zeros: no bars, on an axis that does not go below zero" },
			{ id: "log-zero", caption: "A zero on a log axis: that point is left out, and the data table says so" },
			{ id: "pie-negative", caption: "A negative share: a pie of it means nothing, so a message instead" },
			{ id: "venn-impossible", caption: "Impossible overlaps, 25 shared inside a set of 10: a message instead of a diagram" },
		],
	},
];

const gallery = document.getElementById("gallery");
// A contents list first: thirty-odd figures are a long page, and a reader looking for one kind should not scroll for it.
const contents = document.createElement("nav");
contents.className = "chart-contents";
contents.setAttribute("aria-label", "Chart kinds on this page");
const list = document.createElement("ul");
for (const section of sections) {
	const item = document.createElement("li");
	const link = document.createElement("a");
	link.href = `#${section.id}`;
	link.textContent = section.heading;
	item.append(link);
	list.append(item);
}
contents.append(list);
gallery?.append(contents);
for (const section of sections) {
	const h2 = document.createElement("h2");
	h2.id = section.id;
	h2.textContent = section.heading;
	const note = document.createElement("p");
	note.className = "note";
	note.textContent = section.note;
	gallery?.append(h2, note);
	for (const c of section.cases) {
		const figure = document.createElement("figure");
		figure.className = "chart-case";
		const host = document.createElement("tool-host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
		host.setAttribute("tool", "discrete-series");
		host.setAttribute("mode", "embed");
		host.setAttribute("controls", "none");
		host.dataset.case = c.id;
		const caption = document.createElement("figcaption");
		caption.textContent = c.caption;
		figure.append(host, caption);
		gallery?.append(figure);
		void customElements.whenDefined("tool-host").then(async () => {
			host.values = { case: c.id };
			await host.run();
		});
	}
}
