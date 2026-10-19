/**
 * Drawing a laid-out graph: SVG for the picture, a readout and a live region for the keyboard, and the edge
 * table that says everything the picture does.
 *
 * Everything positional comes from `layout`; this only turns coordinates into elements. Every node, edge,
 * group and lane carries `data-kind`, and `data-role` when the tool gave one, so a host stylesheet can find
 * any part by name (STYLING.md lists them). Colour is always a theme token, through one custom property, so a
 * host restyles a category by its `data-color` alone.
 *
 * The keyboard model, one tab stop for the whole picture: the arrow along the flow follows the selected edge
 * out of the focused node, the arrow against it goes back the way it came, the arrows across it choose among
 * the outgoing edges, Space marks the two ends of a path to highlight, Enter opens a collapsed group and `-`
 * closes the focused node's group, Home and End jump, Escape clears.
 */
import { GRAPH_COLORS, type Graph } from "@toolbench/sdk";
import { el, svg } from "../dom.ts";
import { adoptStyles } from "../styles.ts";
import { ext } from "./chunks.ts";
import { badgeBox, r1 } from "./geometry.ts";
import type { GraphLayout, LaidNode } from "./model.ts";

export const GRAPH_STYLES = /* css */ `
${GRAPH_COLORS.slice(1).map((c) => `[data-color="${c}"]{--c:var(--tb-${c.startsWith("series-") ? `s${c.slice(7)}` : c})}`).join("")}
.tb-graph{margin:0}
.tb-graph-plot{position:relative;border-radius:6px;overflow-x:auto}
.tb-graph-plot:focus{outline:none}
.tb-graph-plot:focus-visible{outline:2px solid var(--tb-accent);outline-offset:4px}
.tb-graph-plot svg{display:block;max-width:none;user-select:none;-webkit-user-select:none}
.tb-graph-title{fill:var(--tb-muted);font:600 11px var(--tb-font)}
.tb-graph-line{fill:none;stroke:var(--c,var(--tb-faint));stroke-width:1.5;stroke-linejoin:round}
[data-width=thin]>.tb-graph-line{stroke-width:1}[data-width=thick]>.tb-graph-line{stroke-width:3}
[data-line=dashed]>.tb-graph-line{stroke-dasharray:6 4}[data-line=dotted]>.tb-graph-line{stroke-dasharray:1.5 3.5;stroke-linecap:round}
.tb-graph-mark{stroke:var(--c,var(--tb-faint));stroke-width:1.5;stroke-linejoin:round;fill:none}
[data-fill=solid]{fill:var(--c,var(--tb-faint))}[data-fill=hollow]{fill:var(--tb-bg)}
.tb-graph-label-bg{fill:var(--tb-bg)}
.tb-graph-label{fill:var(--tb-muted);font:11px var(--tb-mono)}
.tb-graph-shape{fill:var(--tb-surface);stroke:var(--tb-faint);stroke-width:1.25}
[data-color]>.tb-graph-shape{stroke:var(--c);stroke-width:1.5;fill:color-mix(in oklab,var(--c) 11%,var(--tb-bg))}
[data-shape=point]>.tb-graph-shape{fill:var(--tb-fg);stroke:none}
.tb-graph-note{fill:var(--tb-muted);font:10px var(--tb-mono)}
.tb-graph-name{fill:var(--tb-fg);font:12px var(--tb-mono)}
.tb-graph-badge rect{fill:var(--c,var(--tb-muted))}.tb-graph-badge text{fill:var(--tb-bg);font:600 9px var(--tb-mono)}
.tb-graph-ring{fill:none;stroke:var(--tb-fg);stroke-width:2;display:none}
:is(.tb-hot,.tb-path)>.tb-graph-ring{display:inline}.tb-path>.tb-graph-ring{stroke-dasharray:3 2}
:is(.tb-graph-dim .tb-graph-edge:not(.tb-hot),.tb-graph-dim .tb-graph-node:not(.tb-hot,.tb-near)){opacity:.25}
:is(.tb-hot,.tb-path)>:is(.tb-graph-line,.tb-graph-mark){stroke:var(--tb-fg)}:is(.tb-hot,.tb-path)>.tb-graph-line{stroke-width:2.5}
:is(.tb-hot,.tb-path)>[data-fill=solid]{fill:var(--tb-fg)}:is(.tb-hot,.tb-path)>.tb-graph-label{fill:var(--tb-fg);font-weight:700}
.tb-graph-readout{min-height:1.5em;margin:.4rem 0 0;font-size:.8rem;color:var(--tb-muted)}
.tb-graph-message{margin:0;padding:.75rem;border:1px dashed var(--tb-border);border-radius:8px;color:var(--tb-muted);font-size:.86rem}
.tb-graph-data{margin-top:.5rem;font-size:.8rem;overflow-x:auto}
.tb-graph-data summary:focus-visible{outline:2px solid var(--tb-accent);outline-offset:-2px}
.tb-graph-data summary{color:var(--tb-faint);cursor:pointer;min-height:24px;line-height:24px}
.tb-graph-data table{margin-top:.5rem}
`;

/** "Graph, Order lifecycle: 8 nodes, 11 edges": the figure's description and the table's caption. */
export const summary = (g: Graph): string => `Graph, ${g.label}: ${g.nodes.length} node${g.nodes.length === 1 ? "" : "s"}, ${g.edges.length} edge${g.edges.length === 1 ? "" : "s"}`;
const nameOf = (g: Graph, id: string) => g.nodes.find((n) => n.id === id)?.label || id;
const text = (cls: string, x: number, y: number, s: string, anchor = "middle") => svg("text", { class: cls, x: r1(x), y: r1(y), "text-anchor": anchor, "dominant-baseline": "central" }, s);
/*
 * ⚠️ A colour is an attribute, checked against the closed list, and never a style built from the string. It used
 * to be `style="--c:var(--tb-<color>)"`, and since the union is closed only to TypeScript a tool could send
 * `x);background:url(https://example.com/?leak)` and add a rule fetched from another origin. An unknown value
 * is left out and drawn in the default colour; the stylesheet maps each known one to --c.
 */
const tok = (t?: string): Record<string, string> => (t && t !== "normal" && (GRAPH_COLORS as readonly string[]).includes(t) ? { "data-color": t } : {});
const names = (kind: string, role?: string, color?: string) => ({ "data-kind": kind, "data-role": role, ...tok(color) });

/** Every edge as a row, and every node with none as a row saying so: the graph without the picture. */
export function edgeTable(g: Graph): HTMLDetailsElement {
	const end = (id: string, port?: string) => nameOf(g, id) + (port ? `.${port}` : "");
	const rows = g.edges.map((e) => el("tr", {}, el("td", {}, end(e.from, e.fromPort)), el("td", {}, e.label ?? ""), el("td", {}, end(e.to, e.toPort))));
	const used = new Set(g.edges.flatMap((e) => [e.from, e.to]));
	// A node with no edges is not in any row above, and a reader of the table alone would never learn it exists.
	for (const n of g.nodes) if (!used.has(n.id)) rows.push(el("tr", { "data-orphan": "" }, el("td", {}, nameOf(g, n.id)), el("td", { colspan: 2 }, "no edges")));
	const head = ["From", "Edge", (g.directed ?? true) ? "To" : "With"].map((h) => el("th", { scope: "col" }, h));
	return el(
		"details",
		{ class: "tb-graph-data" },
		el("summary", {}, "Show the edges as a table"),
		el("table", {}, el("caption", {}, summary(g)), el("thead", {}, el("tr", {}, ...head)), el("tbody", {}, ...rows)),
	);
}

function drawNode(n: LaidNode, gn: Graph["nodes"][number], standIn: boolean): SVGGElement {
	const node = svg("g", { class: "tb-graph-node", "data-id": n.id, "data-shape": n.shape, ...names(standIn ? "collapsed-group" : "node", gn.role, gn.tone && gn.tone !== "normal" ? gn.tone : gn.color) });
	node.append(svg("rect", { class: "tb-graph-ring", x: n.x - 4, y: n.y - 4, width: n.w + 8, height: n.h + 8, rx: 8 }), svg("path", { class: "tb-graph-shape", d: n.outline }));
	const cx = n.x + n.w / 2;
	const cy = n.y + n.h / 2 + (n.shape === "cylinder" ? 4 : n.shape === "document" ? -3 : 0);
	if (n.shape === "record") ext.record!.draw(n, gn, (tag, attrs, s) => node.append(svg(tag as "text", attrs, s)));
	else if (n.shape !== "point") {
		node.append(text("tb-graph-name", cx, gn.note ? cy - 6 : cy, n.label));
		if (gn.note) node.append(text("tb-graph-note", cx, cy + 8, gn.note));
	}
	const bb = badgeBox(gn.badge, n);
	if (bb) node.append(svg("g", { class: "tb-graph-badge", "data-kind": "badge" }, svg("rect", { x: bb.x, y: bb.y, width: bb.w, height: bb.h, rx: 7 }), text("", bb.x + bb.w / 2, bb.y + 7, gn.badge!)));
	return node;
}

/** What the interaction chunk acts on. */
export type Ctx = { g: Graph; pic: SVGSVGElement; nodes: SVGGElement[]; edges: Map<number, SVGGElement>; say: (s: string) => void; clear: () => void };
type Paths = { path: (c: Ctx, a: number, b: number) => void; unpath: (c: Ctx) => void };
/** The groups chunk's drawing of lanes and groups, given the title writer and the names, and how to close a group. */
export type DrawGroups = (pic: SVGSVGElement, g: Graph, L: GraphLayout, title: (t: { x: number; y: number; h: number }, s: string) => SVGTextElement, names: (kind: string, role?: string, color?: string) => Record<string, string | undefined>, close: false | ((id: string) => void)) => void;

/**
 * The picture, readout, live region and table for one layout. `g` is the graph as laid out, with closed groups
 * standing in for their members; `reopen` and `close` change which groups are closed and draw again.
 */
export function drawLayout(input: Graph, g: Graph, L: GraphLayout, collapsed: ReadonlySet<string>, setCollapsed: (next: Set<string>) => void): Node[] {
	const plot = el("div", { class: "tb-graph-plot", tabindex: 0, role: "group", "aria-roledescription": "graph", "aria-label": `${summary(g)}. Arrow keys follow the edges.` });
	// Its natural size, set inline: a sheet's "svg { width: 100% }" stretched a narrow graph to three times its
	// size. A wide graph scrolls rather than shrinking its text past reading.
	const pic = svg("svg", { viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, style: `width:${L.width}px;height:${L.height}px`, "aria-hidden": "true" });
	const toggle = input.interaction?.collapse ?? true;
	// Lanes and groups are the groups chunk's to draw, which a graph with either has already fetched.
	if (L.lanes.length || L.groups.length) (ext.drawGroups as DrawGroups)(pic, g, L, (t, s) => text("tb-graph-title", t.x + 4, t.y + t.h / 2 + 1, s, "start"), names, toggle && ((id) => setCollapsed(new Set([...collapsed, id]))));
	const directed = g.directed ?? true;
	const hl = input.highlight ?? [];
	const onPath = (e: Graph["edges"][number]) => hl.some((id, k) => (e.from === id && e.to === hl[k + 1]) || (!directed && e.to === id && e.from === hl[k + 1]));
	const edges = new Map<number, SVGGElement>();
	for (const e of L.edges) {
		const ge = g.edges[e.index]!;
		const node = svg("g", { class: onPath(ge) ? "tb-graph-edge tb-path" : "tb-graph-edge", "data-i": e.index, "data-line": ge.line, "data-width": ge.width, "data-routed": e.routed, ...names("edge", ge.role, ge.tone && ge.tone !== "normal" ? ge.tone : ge.color) });
		node.append(svg("path", { class: "tb-graph-line", d: e.d }));
		for (const [end, m] of [["tail", e.tail], ["head", e.head]] as const) if (m) node.append(svg("path", { class: "tb-graph-mark", "data-end": end, "data-fill": m.fill, d: m.d }));
		if (e.label) node.append(svg("rect", { class: "tb-graph-label-bg", x: e.label.x, y: e.label.y, width: e.label.w, height: e.label.h, rx: 3 }), text("tb-graph-label", e.label.x + e.label.w / 2, e.label.y + e.label.h / 2, e.label.text));
		edges.set(e.index, node);
		pic.append(node);
	}
	const open = (id: string) => setCollapsed(new Set([...collapsed].filter((x) => x !== id)));
	const nodes = L.nodes.map((n) => {
		const gn = g.nodes[n.index]!;
		const standIn = collapsed.has(gn.id);
		const node = drawNode(n, gn, standIn);
		if (hl.includes(n.id)) node.classList.add("tb-path");
		if (standIn) node.addEventListener("click", () => open(n.id));
		pic.append(node);
		return node;
	});
	plot.append(pic);
	// The readout is for eyes; the live region says the same to a screen reader, without the visual list.
	const readout = el("p", { class: "tb-graph-readout", "aria-hidden": "true" });
	const live = el("p", { class: "tb-sr", role: "status", "aria-live": "polite" });
	const incident = (id: string, out: boolean) => g.edges.filter((e) => (out ? e.from === id || (!directed && e.to === id) : directed && e.to === id));
	let cur = -1;
	let picked = 0;
	let anchor = -1;
	const trail: number[] = [];
	const ctx: Ctx = {
		g,
		pic,
		nodes,
		edges,
		say: (s) => (readout.textContent = live.textContent = s),
		clear: () => {
			pic.classList.remove("tb-graph-dim");
			for (const x of [...nodes, ...edges.values()]) x.classList.remove("tb-hot", "tb-near");
		},
	};
	/** Shortest paths come from the interaction chunk, fetched the first time a reader asks for one. */
	const paths = () => ext.path as Paths | undefined;
	const path = (a: number, b: number) => {
		if ((input.interaction?.paths ?? true) === false) return;
		const p = paths();
		if (p) return p.path(ctx, a, b);
		void import("./graph-interact.ts").then(() => paths()?.path(ctx, a, b));
	};
	const show = (u: number) => {
		cur = u;
		const id = g.nodes[u]!.id;
		const o = incident(id, true);
		const i = incident(id, false);
		const far = (e: Graph["edges"][number]) => (e.from === id ? e.to : e.from);
		if ((input.interaction?.focus ?? "neighbours") !== "none") {
			pic.classList.add("tb-graph-dim");
			const near = new Set([...o, ...i].flatMap((e) => [e.from, e.to]));
			nodes.forEach((x, k) => (x.classList.toggle("tb-hot", k === u), x.classList.toggle("tb-near", near.has(g.nodes[k]!.id))));
			for (const [k, x] of edges) x.classList.toggle("tb-hot", o.includes(g.edges[k]!) || i.includes(g.edges[k]!));
		}
		const list = (xs: Graph["edges"], w: string) => xs.map((e) => `${w} ${e.from === e.to ? "itself" : nameOf(g, far(e))}${e.label ? ` (${e.label})` : ""}`);
		const counts = directed ? `${i.length} in, ${o.length} out` : `${o.length} edge${o.length === 1 ? "" : "s"}`;
		const p = o[picked % o.length];
		readout.textContent = `${nameOf(g, id)}: ${counts}. ${[...list(o, directed ? "to" : "with"), ...list(i, "from")].join(", ")}`;
		live.textContent = `${nameOf(g, id)}, ${counts}${p ? `, selected ${p.label ?? "edge"} to ${nameOf(g, far(p))}, ${(picked % o.length) + 1} of ${o.length}` : ""}`;
	};
	nodes.forEach((x, u) => {
		x.addEventListener("pointerenter", () => !pic.classList.contains("tb-graph-paths") && ((picked = 0), show(u)));
		x.addEventListener("click", (ev) => {
			ev.stopPropagation();
			if (ev.shiftKey && anchor >= 0) path(anchor, u);
			else ((anchor = u), paths()?.unpath(ctx), show(u));
		});
	});
	const quiet = () => (ctx.clear(), (readout.textContent = ""));
	pic.addEventListener("click", () => (paths()?.unpath(ctx), quiet()));
	pic.addEventListener("pointerleave", () => (plot.getRootNode() as Document | ShadowRoot).activeElement !== plot && quiet());
	plot.addEventListener("focus", () => cur < 0 && show(0));
	plot.addEventListener("blur", () => (ctx.clear(), (cur = -1)));
	const dir = g.direction ?? (g.layout === "tree" ? "TB" : "LR");
	const fwd = { LR: "Right", RL: "Left", TB: "Down", BT: "Up" }[dir];
	const back = { Right: "Left", Left: "Right", Down: "Up", Up: "Down" }[fwd]!;
	const across = dir === "LR" || dir === "RL" ? ["Up", "Down"] : ["Left", "Right"];
	const at = (id: string) => g.nodes.findIndex((n) => n.id === id);
	plot.addEventListener("keydown", (ev) => {
		if (cur < 0) return;
		const id = g.nodes[cur]!.id;
		const o = incident(id, true);
		const k = ev.key.replace("Arrow", "");
		if (k === fwd && o.length) {
			trail.push(cur);
			const e = o[picked % o.length]!;
			picked = 0;
			show(at(e.from === id ? e.to : e.from));
		} else if (k === back) {
			picked = 0;
			const into = incident(id, false)[0];
			show(trail.pop() ?? (into ? at(into.from) : cur));
		} else if (across.includes(k) && o.length) ((picked = (picked + (k === across[1] ? 1 : o.length - 1)) % o.length), show(cur));
		// Space marks one end of a path; Space on another node highlights the shortest path between them.
		else if (k === " ") anchor >= 0 && anchor !== cur ? (path(anchor, cur), (anchor = -1)) : (anchor = cur);
		else if (k === "Enter" && collapsed.has(id)) open(id);
		else if (k === "-" && g.nodes[cur]!.group && toggle) setCollapsed(new Set([...collapsed, g.nodes[cur]!.group!]));
		else if (k === "Home" || k === "End") show(k === "Home" ? 0 : g.nodes.length - 1);
		else if (k === "Escape") (quiet(), paths()?.unpath(ctx));
		else return;
		ev.preventDefault();
	});
	return [plot, readout, live, edgeTable(g)];
}

/** The chunks' sheets with the graph's own, adopted into whatever root the figure lands in. */
export function adoptGraphStyles(figure: Element): void {
	for (const [k, css] of Object.entries({ "": GRAPH_STYLES, ...ext.css })) adoptStyles(figure, `graph${k ? `-${k}` : ""}`, () => css);
}
