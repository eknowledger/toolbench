/**
 * The interaction chunk: the shortest path between two nodes a reader picked, highlighted. Fetched the first
 * time a reader asks for one, so a graph that is only looked at never downloads it.
 */
import { adoptStyles } from "../styles.ts";
import { ext } from "./chunks.ts";
import type { Ctx } from "./draw.ts";

/** The tool's own highlighted path, remembered per picture so clearing a reader's path brings it back. */
const own = new WeakMap<SVGSVGElement, Element[]>();
const unpath = (c: Ctx) => {
	const all = [...c.nodes, ...c.edges.values()];
	if (!own.has(c.pic)) own.set(c.pic, all.filter((x) => x.classList.contains("tb-path")));
	c.pic.classList.remove("tb-graph-paths");
	for (const x of all) x.classList.toggle("tb-path", own.get(c.pic)!.includes(x));
};
const CSS = `.tb-graph-paths :is(.tb-graph-edge,.tb-graph-node):not(.tb-path){opacity:.25}`;

/** Breadth first, along edge direction when the graph is directed. */
const path = (c: Ctx, a: number, b: number) => {
	const { g } = c;
	const directed = g.directed ?? true;
	const name = (id: string) => g.nodes.find((n) => n.id === id)?.label || id;
	const prev = new Map<string, number>();
	const [s, t] = [g.nodes[a]!.id, g.nodes[b]!.id];
	const q = [s];
	const seen = new Set(q);
	for (let k = 0; k < q.length && !seen.has(t); k++)
		g.edges.forEach((e, j) => {
			const v = e.from === q[k] ? e.to : !directed && e.to === q[k] ? e.from : undefined;
			if (v !== undefined && !seen.has(v)) (seen.add(v), prev.set(v, j), q.push(v));
		});
	// Adopted here, not when the graph was drawn: this chunk arrives after the picture it acts on.
	adoptStyles(c.pic, "graph-paths", () => CSS);
	c.clear();
	unpath(c);
	if (!seen.has(t)) return c.say(`No path from ${name(s)} to ${name(t)}.`);
	c.pic.classList.add("tb-graph-paths");
	for (const x of [...c.nodes, ...c.edges.values()]) x.classList.remove("tb-path");
	const ids = new Set([s]);
	let n = 0;
	for (let v = t; v !== s; n++) {
		const j = prev.get(v)!;
		c.edges.get(j)?.classList.add("tb-path");
		ids.add(v);
		v = g.edges[j]!.from === v ? g.edges[j]!.to : g.edges[j]!.from;
	}
	c.nodes.forEach((x, k) => x.classList.toggle("tb-path", ids.has(g.nodes[k]!.id)));
	c.say(`Path from ${name(s)} to ${name(t)}: ${n} edge${n === 1 ? "" : "s"}.`);
};

ext.path = { path, unpath };
