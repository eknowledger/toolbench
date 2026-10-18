/**
 * The layout, start to finish: collapse, size, place, snap, attach, route, search, finish. A pure function
 * of the graph: plain coordinates out, no DOM, the same numbers in every engine and in a worker.
 *
 * A placement or shape the base chunk does not have throws `GraphChunkMissing`; the caller loads the chunk
 * and calls again. See chunks.ts.
 */
import { graphProblem, type Graph, type GraphMarker } from "@toolbench/sdk";
import { ext, need, routingOf, type GroupBox, type Placed, type Side } from "./chunks.ts";
import { badgeBox, HEAD, hyp, mark, oddUp, outline, P, polygon, r1, ROW, shapeOf, textW } from "./geometry.ts";
import { crossings, order, place, type LState, type Placement } from "./layered.ts";
import type { Box, GraphLayout, LaidEdge, LaidGroup, LaidLane, LaidNode, Pt } from "./model.ts";
import { assign, type End } from "./ports.ts";
import { router, type Router } from "./router.ts";

export type LayoutOptions = {
	/** Groups drawn closed, overriding each group's own `collapsed`. */
	collapsed?: ReadonlySet<string>;
	/** Skip the crossing search whatever the graph: for tests that compare with and without it. */
	noSearch?: boolean;
	/** Time spent in each phase, in milliseconds, written here when given. */
	timings?: Record<string, number>;
};

export const collapsedOf = (g: Graph): Set<string> => new Set((g.groups ?? []).filter((x) => x.collapsed).map((x) => x.id));

/** The graph the layout draws: each closed group replaced by one node standing for it, from the groups chunk. */
export const effective = (g: Graph, set: ReadonlySet<string> = collapsedOf(g)): Graph => (set.size ? need(ext.collapse, "groups")(g, new Set(set)) : g);

const snap = (v: number, f = Math.round) => f((v - P / 2) / P) * P + P / 2;
const snapBox = (b: Box): Box => {
	const [x, y] = [snap(b.x, Math.floor), snap(b.y, Math.floor)];
	return { x, y, w: snap(b.x + b.w, Math.ceil) - x, h: snap(b.y + b.h, Math.ceil) - y };
};

/** A node's size from its content and shape: odd multiples of the pitch, so its centre lines are grid lines. */
export function nodeSize(n: Graph["nodes"][number]): number[] {
	if (n.shape === "record") return need(ext.record, "er").size(n);
	const [w, h] = shapeOf(n).size(Math.max(textW(n.label ?? n.id, 12), n.note ? textW(n.note, 10) : 0, n.badge ? 16 : 0), 14 + (n.note ? 12 : 0));
	return n.shape === "point" ? [24, 24] : [oddUp(Math.max(w!, 5 * P)), oddUp(h!)];
}

/** One routed attempt: what the search compares and what `finish` turns into coordinates. */
export type Built = { rt: Router; boxes: Box[]; groups: GroupBox[]; lanes: Placement["lanes"]; shapes: string[]; extra: (Pt[] | undefined)[]; moved: number; ends: End[][] };
/** The search chunk's entry point. */
export type Search = (g: Graph, st: LState, first: Built, build: (p: Placement) => Built, budget: number, work: { pops: number }) => Built;

/**
 * Whether the base layout leaves enough crossings for the search to be worth fetching and running: a layered
 * graph of at most 60 nodes whose order crosses at least once for every two edges. The order's own count,
 * between layers, which the base has already made: counting the drawn crossings as well cost 0.3 KB here.
 *
 * Measured, not chosen. Of the eleven bench families only the bipartite graph is past it, 14 crossings on 16
 * edges, and the search takes it to 4. Every family below it ends with the same crossings with or without the
 * search, which spent 79 ms on the dense call graph for none. On seeded layered graphs it saved 2 crossings at
 * 30 nodes, which is below the threshold and so drawn with 8 rather than 6, none at 40, 2 at 50 and 5 at 60,
 * then none at 80, 100 or 120 for 108 to 142 ms each. Force layouts never search: it reorders layers, and a
 * force layout has none.
 */
export const wantsSearch = (g: Graph, crossings: number): boolean => (g.layout ?? "layered") === "layered" && g.nodes.length <= 60 && crossings > 0 && 2 * crossings >= g.edges.length;

type Moves = Map<number, { fromSide?: Side; toSide?: Side }>;
const repair = () => need(ext.repair, "repair");

export function layout(input: Graph, opts: LayoutOptions = {}): GraphLayout {
	const t = opts.timings ?? {};
	const now = () => performance.now();
	const t0 = now();
	const problem = graphProblem(input, { colors: false });
	if (problem) throw new Error(problem);
	const g = effective(input, opts.collapsed);
	const kind = g.layout ?? "layered";
	const routing = routingOf(g);
	const sizes = g.nodes.map(nodeSize);
	const n = g.nodes.length;
	const idOf = new Map(g.nodes.map((x, i) => [x.id, i]));
	const work = { pops: 0, soft: 0 };
	let st: LState | undefined;
	let pl: Placement | Placed;
	if (kind === "layered") ((st = order(g, sizes)), (pl = place(st)));
	else pl = need(ext.place[kind], kind === "force" || kind === "manual" ? "force" : "tree")(g, sizes);
	t.place = now() - t0;

	const eight = routing === "polyline" || routing === "straight";
	const build = (pl: Placement | Placed, moved?: Moves, skip?: Set<number>): Built => {
		// The graph as `assign` sees it: an end moved off a walled-in side is forced onto its new one.
		const ga = moved?.size ? { ...g, edges: g.edges.map((e, i) => ({ ...e, ...moved.get(i) })) } : g;
		const boxes = pl.boxes.map((b) => ({ x: snap(b.x), y: snap(b.y), w: b.w, h: b.h }));
		const lp = "groups" in pl ? pl : undefined;
		const groups = (lp?.groups ?? (g.groups?.length ? need(ext.groupBoxes, kind === "tree" || kind === "radial" ? "tree" : "force")(g, boxes) : [])).map((x) => {
			const b = snapBox(x.box);
			return { ...x, box: b, title: { ...x.title, x: b.x + 6, y: b.y + 2 } };
		});
		const lanes = (lp?.lanes ?? []).map((x) => ({ ...x, box: snapBox(x.box) }));
		const shapes = g.nodes.map((x) => x.shape ?? "rounded");
		const badges = g.nodes.map((nd, u) => badgeBox(nd.badge, boxes[u]!));
		// Where an end's other end is forced to a side, that side's midpoint is what to order by: the layer
		// order knows nothing of forced sides, and ordering by it crossed a forced edge at its own port.
		const mid = (b: Box, s: Side) => [b.x + (s === "left" ? 0 : s === "right" ? b.w : b.w / 2), b.y + (s === "top" ? 0 : s === "bottom" ? b.h : b.h / 2)];
		const keys = ga.edges.map((e, i) => ({ ...lp?.keys[i], ...(e.fromSide && { to: mid(boxes[idOf.get(e.from)!]!, e.fromSide) }), ...(e.toSide && { from: mid(boxes[idOf.get(e.to)!]!, e.toSide) }) }));
		const rowOff = (u: number, row: string) => {
			const k = g.nodes[u]!.rows?.findIndex((r) => r.id === row) ?? -1;
			return k < 0 ? undefined : HEAD + k * ROW + ROW / 2 - boxes[u]!.h / 2;
		};
		const { ends, moved: overflow, share } = assign(ga, boxes, shapes, pl.sides ?? [], keys, rowOff, badges.map((b) => b?.w ?? 0));
		const rt = router({
			g,
			boxes,
			polys: boxes.map((b, u) => polygon(shapes[u]!, b)),
			ends,
			titles: [...groups, ...lanes].map((x) => x.title).concat(badges.filter((b): b is Box => !!b)),
			borders: [...groups, ...lanes].map((x) => x.box),
			guides: lp?.guides,
			rankAxis: lp?.rankAxis,
			// A spline is an orthogonal route with its corners rounded as far as the neighbours allow: routed in
			// eight directions and smoothed, the same edges crossed more and cost three times as long.
			D: eight ? 8 : 4,
			work,
			share,
			cross: n <= 60 ? 1000 : n <= 150 ? 300 : 100,
			// The heuristic's weight: a hair over one keeps a small graph's routes the shortest there are; past 120
			// nodes it trades a little length for time. Measured at 500 nodes: at 2.5, a layered graph took 0.9 s
			// instead of 6.9 at 1.25, and a force graph 1.6 instead of 3.5, for 2% and 4% more crossings. Routes
			// in eight directions left overlaps at 2.5, and none at 2.
			weight: n <= 120 ? 1.001 : eight ? 2 : 2.5,
			// Straight lines and direct curves come first, from the lines chunk; the grid takes what they cannot draw.
			skip,
			pre: routing === "straight" || (routing === "spline" && kind !== "layered") ? (need(ext.lines?.direct, "lines") as (r: string) => never)(routing) : undefined,
		});
		const extra = rt.extra;
		const dist = (i: number) => Math.abs(boxes[rt.ue[i]![0]!]!.x - boxes[rt.ue[i]![1]!]!.x) + Math.abs(boxes[rt.ue[i]![0]!]!.y - boxes[rt.ue[i]![1]!]!.y);
		// Labelled edges first, then short ones: a label needs a clear straight run, and a short edge has few ways to go.
		for (const i of g.edges
			.map((_, i) => i)
			.filter((i) => !extra[i])
			.sort((a, b) => +!g.edges[a]!.label - +!g.edges[b]!.label || dist(a) - dist(b) || a - b))
			rt.route(i);
		// A route that had to share: the repair chunk reroutes what it ran into.
		if (rt.R.some((r) => r?.soft)) repair().unshare(rt as never);
		return { rt, boxes, groups, lanes, shapes, extra, moved: overflow + (moved?.size ?? 0), ends };
	};
	const t1 = now();
	// Moving ends is for orthogonal and spline routes: a straight graph's grid fallbacks that end soft only
	// run near a line, and moving their ends on a seeded network of 250 nodes turned no overlap into three.
	let cur = build(pl);
	// Still sharing: a straight line in the way goes to the grid, or a walled-in end moves to another side.
	if (cur.rt.R.some((r) => r?.soft))
		cur = eight ? (ext.lines!.unwall as (b: Built, again: (skip: Set<number>) => Built) => Built)(cur, (skip) => build(pl, undefined, skip)) : (repair().reattach as unknown as (b: Built, again: (m: Moves) => Built) => Built)(cur, (m) => build(pl, m));
	t.route = now() - t1;
	const t2 = now();
	let searched = false;
	if (st && !opts.noSearch && wantsSearch(g, crossings(st))) {
		// The budget, in A* states rather than milliseconds so every machine gives the same answer: four times
		// what the first routing cost, at most 600,000. Ten times took the bipartite family to the same 4
		// crossings in 54 ms instead of 20.
		cur = (need(ext.search, "search") as Search)(g, st, cur, build, Math.min(4 * work.pops, 6e5), work);
		searched = true;
	}
	t.search = now() - t2;
	t.pops = work.pops;
	return finish(g, cur, searched);
}

function finish(g: Graph, c: Built, searched: boolean): GraphLayout {
	const { rt, boxes } = c;
	const lines = g.edges.map((_, i) => (rt.R[i] ? rt.pts(i) : c.extra[i]));
	let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
	const take = (x: number, y: number, m = 0) => ((x0 = Math.min(x0, x - m)), (y0 = Math.min(y0, y - m)), (x1 = Math.max(x1, x + m)), (y1 = Math.max(y1, y + m)));
	for (const b of [...boxes, ...[...c.groups, ...c.lanes].map((x) => x.box), ...rt.labels.filter((b): b is Box => !!b)]) (take(b.x, b.y), take(b.x + b.w, b.y + b.h));
	for (const l of lines) for (const p of l ?? []) take(p[0], p[1], 7);
	// Whole pitches, so the grid alignment everything relied on survives the move.
	const dx = Math.round((P - x0) / P) * P;
	const dy = Math.round((P - y0) / P) * P;
	const mv = (b: Box): Box => ({ x: r1(b.x + dx), y: r1(b.y + dy), w: r1(b.w), h: r1(b.h) });
	const want = routingOf(g);
	const unit = (a: Pt, b: Pt): Pt => {
		const l = hyp(b[0] - a[0], b[1] - a[1]) || 1;
		return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
	};
	const edges: LaidEdge[] = g.edges.map((e, i) => {
		const raw = (lines[i] ?? [
			[0, 0],
			[0, 0],
		]).map(([x, y]) => [x + dx, y + dy] as Pt);
		// A straight line a node was in the way of went to the grid, and is drawn as the polyline it is.
		const routed = rt.R[i] && want === "straight" ? "polyline" : want;
		// A spline's corners are as round as the lines chunk finds room for. Without it they were all rounded
		// alike, and a corner beside another route crossed into it.
		const radii = routed === "spline" && rt.R[i] ? (need(ext.lines, "lines").smooth as (r: Router, i: number, p: Pt[]) => number[])(rt, i, lines[i]!) : undefined;
		const drawn = curve(raw, routed === "orthogonal" ? P / 2 : routed === "spline" ? 3 * P : 0, radii);
		const k = raw.length;
		const u = unit(raw[k - 2]!, raw[k - 1]!);
		const hm = mark((e.head ?? ((g.directed ?? true) ? "arrow" : "none")) as GraphMarker, raw[k - 1]!, u);
		const tm = mark((e.tail ?? "none") as GraphMarker, raw[0]!, unit(raw[1]!, raw[0]!));
		// Pull the line back from a solid arrow's tip, so its square end does not blunt the point.
		if (hm?.[1] === "solid") drawn[drawn.length - 1]![0] = [raw[k - 1]![0] - u[0] * 3, raw[k - 1]![1] - u[1] * 3];
		const lab = rt.labels[i];
		const edge: LaidEdge = {
			index: i,
			from: e.from,
			to: e.to,
			d: drawn.map(([p, q], j) => (j ? (q ? `Q${r1(q[0])} ${r1(q[1])} ` : "L") : "M") + `${r1(p[0])} ${r1(p[1])}`).join(""),
			ports: [raw[0]!, raw[k - 1]!],
			routed: routed as LaidEdge["routed"],
		};
		if (hm) edge.head = { d: hm[0], fill: hm[1] as "solid" };
		if (tm) edge.tail = { d: tm[0], fill: tm[1] as "solid" };
		if (lab && e.label) edge.label = { ...mv(lab), text: e.label };
		if ((g.merge && g.merge !== "none") || rt.key(i) >= 3e6) edge.merge = `${g.merge ?? "row"}:${rt.key(i)}`;
		return edge;
	});
	const nodes: LaidNode[] = g.nodes.map((nd, u) => {
		const b = mv(boxes[u]!);
		const shape = c.shapes[u]!;
		const node: LaidNode = { index: u, id: nd.id, label: nd.label ?? nd.id, shape: shape as LaidNode["shape"], outline: outline(shape, b), ...b };
		if (nd.group !== undefined) node.group = nd.group;
		if (nd.rows) node.rows = nd.rows.map((r, k) => ({ ...r, x: b.x, y: b.y + HEAD + k * ROW, w: b.w, h: ROW }));
		return node;
	});
	const groups: LaidGroup[] = c.groups.map((x) => {
		const gr = g.groups!.find((y) => y.id === x.id)!;
		const out: LaidGroup = { id: x.id, label: gr.label, depth: x.depth, ...mv(x.box), title: mv(x.title) };
		if (gr.parent !== undefined) out.parent = gr.parent;
		return out;
	});
	const lanes: LaidLane[] = c.lanes.map((x) => ({ id: x.id, label: x.label, ...mv(x.box), title: mv(x.title) }));
	return { width: r1(x1 + dx + P), height: r1(y1 + dy + P), nodes, edges, groups, lanes, meta: { moved: c.moved, soft: rt.R.filter((r) => r?.soft).length, searched } };
}

type DP = [Pt, Pt | undefined];
/** Corners rounded by up to r, never past half of either run; `radii` overrides it per corner. */
export function curve(p: Pt[], r: number, radii?: number[]): DP[] {
	if (!r || p.length < 3) return p.map((q) => [q, undefined]);
	const out: DP[] = [[p[0]!, undefined]];
	for (let i = 1; i + 1 < p.length; i++) {
		const [a, b, c] = [p[i - 1]!, p[i]!, p[i + 1]!];
		const [la, lc] = [hyp(b[0] - a[0], b[1] - a[1]), hyp(c[0] - b[0], c[1] - b[1])];
		const rr = Math.min(radii?.[i] ?? r, la / 2, lc / 2);
		out.push([[b[0] - ((b[0] - a[0]) / la) * rr, b[1] - ((b[1] - a[1]) / la) * rr], undefined], [[b[0] + ((c[0] - b[0]) / lc) * rr, b[1] + ((c[1] - b[1]) / lc) * rr], b]);
	}
	out.push([p.at(-1)!, undefined]);
	return out;
}
