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
const sections: { heading: string; note: string; cases: { id: string; caption: string }[] }[] = [
	{
		heading: "Lines, markers and points",
		note: "A line suits a continuous x. Over separate items, markers show every real value, and points alone drop the line that would invent one between them.",
		cases: [
			{ id: "lines", caption: "Lines: frame 5 is lost, and the release line runs flat until the copy arrives" },
			{ id: "markers", caption: "Markers: every value visible, one shape per series, so equal values stay apart" },
			{ id: "points", caption: "Points: the same data with no line between frames" },
			{ id: "thresholds", caption: "Thresholds: two labelled limits, the higher one above every value, so the scale widens to show it" },
			{ id: "step", caption: "Step: a value that holds until it changes, beside the same data as a line (offset by 10), which invents slopes" },
			{ id: "scatter", caption: "Scatter: two series with their own x values, so the readout snaps to the nearest point, not the nearest x (illustrative values)" },
			{ id: "band", caption: "A band: the p5 to p95 spread around a median, drawn beneath it, with a gap where second 7 has no data (illustrative values)" },
			{ id: "log", caption: "Log scales: one TCP flow's throughput ceiling across loss from 0.01% to 10%, a straight line on two log axes" },
			{ id: "log-zero", caption: "A log axis given a zero: that point is left out, and the data table says so" },
		],
	},
	{
		heading: "Reading a value",
		note: "Every chart answers a pointer, and a keyboard: tab to a chart and the arrow keys step through it. What the card says can be the tool's.",
		cases: [
			{ id: "readout", caption: "A readout the tool writes: a heading for frame 5, and how late each held frame was" },
			{ id: "linked", caption: "Linked: point at the chart and the table's row lights, and the other way round. Open the data table to see it there too" },
		],
	},
	{
		heading: "Bars",
		note: "Bars grow from zero, sit side by side when there are several series, and take their labels from the bars themselves.",
		cases: [
			{ id: "two-bars", caption: "Two bar series, grouped" },
			{ id: "signed-bars", caption: "Bars either side of zero" },
			{ id: "zero-bars", caption: "A series of zeros draws nothing, on an axis that does not go below zero" },
			{ id: "categories", caption: "Named categories: three call topologies, in the order the tool gave them" },
			{ id: "stacked", caption: "Stacked: where each path's delay goes, stage by stage, against a budget line" },
			{ id: "stacked-signed", caption: "A stack either side of zero, beside a bar that is not stacked" },
			{ id: "horizontal", caption: "Horizontal: the same budget read left to right, the threshold now a vertical rule" },
			{ id: "horizontal-grouped", caption: "Horizontal grouped bars: long names on their own line beside their bars (illustrative values)" },
			{ id: "many-categories", caption: "Twenty-four categories: every third is labelled, and all are in the data table and the readout" },
		],
	},
];

const gallery = document.getElementById("gallery");
for (const section of sections) {
	const h2 = document.createElement("h2");
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
