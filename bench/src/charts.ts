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
		],
	},
	{
		heading: "Bars",
		note: "Bars grow from zero, sit side by side when there are several series, and take their labels from the bars themselves.",
		cases: [
			{ id: "two-bars", caption: "Two bar series, grouped" },
			{ id: "signed-bars", caption: "Bars either side of zero" },
			{ id: "zero-bars", caption: "A series of zeros draws nothing, on an axis that does not go below zero" },
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
