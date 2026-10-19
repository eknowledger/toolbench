import "./boot.ts";
import { families } from "../../packages/runtime/test/graph/families.ts";
import fixture from "../fixtures/graph-families/tool.json";

/**
 * The graph gallery. One figure per case of the `graph-families` fixture, in the order the families are
 * listed, with their variants side by side, then any graph large enough to be laid out off the main thread,
 * then the two a tool gets refused.
 *
 * The cases come from the fixture's manifest, so the page draws exactly what the fixture offers and the
 * browser tests, which read the same fixture, compare exactly what is on the page.
 *
 * Each figure is a page-owned host, `controls="none"`, driven through `values` and `run()`, as the chart
 * gallery is.
 */
type Case = { id: string; caption: string };
const offered = new Set((fixture.inputs[0]?.options ?? []).map((o: { value: string }) => o.value));
const sections: { id: string; heading: string; note: string; cases: Case[] }[] = families.map((f) => ({
	id: f.id,
	heading: f.title,
	note: f.shows,
	cases: (f.variants ?? [{ label: "", graph: f.graph }]).map((v) => ({ id: v.label ? `${f.id}-${v.label.toLowerCase()}` : f.id, caption: v.label || f.title })),
}));
sections.find((s) => s.id === "nested")!.cases.push({ id: "nested-collapsed", caption: "With the VPC closed: one node standing for everything inside it, its edges joined" });
sections.push(
	{
		id: "large",
		heading: "A large graph",
		note: "150 nodes. Past 100 the layout runs off the main thread: the edges are listed at once, and the picture replaces the message saying so when it is ready.",
		cases: [{ id: "large", caption: "A seeded layered graph of 150 nodes" }],
	},
	{
		id: "refused",
		heading: "When a graph cannot be drawn",
		note: "These are meant to look like this. A graph that names something that does not exist, or is past the tool's own limits, is listed as a table with the reason.",
		cases: [
			{ id: "dangling", caption: "An edge to a node that does not exist" },
			{ id: "limits", caption: "22 nodes against the tool's own limit of 12" },
		],
	},
);
for (const s of sections) s.cases = s.cases.filter((c) => offered.has(c.id));
const shown = sections.filter((s) => s.cases.length);

const gallery = document.getElementById("gallery");
const contents = document.createElement("nav");
contents.className = "chart-contents";
contents.setAttribute("aria-label", "Graph families on this page");
const list = document.createElement("ul");
for (const section of shown) {
	const item = document.createElement("li");
	const link = document.createElement("a");
	link.href = `#${section.id}`;
	link.textContent = section.heading;
	item.append(link);
	list.append(item);
}
contents.append(list);
gallery?.append(contents);
for (const section of shown) {
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
		host.setAttribute("tool", "graph-families");
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
