/**
 * The graph kind's optional chunks, and the registry they fill in when they arrive.
 *
 * The base chunk lays out and draws a layered graph with orthogonal edges and the basic shapes, which is most
 * graphs. Everything else is a chunk of its own, fetched for the first graph that needs it: tree and radial
 * placement, force and manual placement, straight lines and curves, the extra shapes, records and crow's
 * feet, groups and lanes, path highlighting, the crossing search, and the repair of a route that had to share. A chunk registers itself into `ext`
 * when imported; code that needs one that is not there throws `GraphChunkMissing`, and the caller loads it
 * and lays out again, the pattern the chart kinds use for their renderers.
 *
 * ⚠️ Nothing here may import the DOM: the worker that lays out a large graph imports this module too.
 */
import type { Graph, GraphMarker, GraphNode } from "@toolbench/sdk";
import type { Box, GraphLayout, LaidNode, Pt } from "./model.ts";

export type Side = "left" | "right" | "top" | "bottom";
export type Placed = { boxes: Box[]; sides?: { out?: Side | undefined; in?: Side | undefined }[] };
export type GroupBox = { id: string; box: Box; title: Box; depth: number };

/** What the optional chunks provide. Typed loosely where the shape belongs to the chunk that fills it. */
export type Ext = {
	/** Placements other than layered, by layout name. */
	place: Record<string, (g: Graph, sizes: number[][]) => Placed>;
	/** The markers other than arrow and open. */
	mark?: (m: GraphMarker, at: (back: number, side: number) => string) => [string, string];
	/** The lines chunk: direct lines and curves, eight-direction grid moves, corner radii. */
	lines?: { direct: unknown; grid: unknown; smooth: unknown; unwall: unknown };
	/** Records: their size, and their rows drawn with the element factory the caller passes, so no DOM import here. */
	record?: { size: (n: GraphNode) => number[]; draw: (n: LaidNode, g: GraphNode, add: (tag: string, attrs: Record<string, string | number>, text?: string) => void) => void };
	collapse?: (g: Graph, set: Set<string>) => Graph;
	/** The groups chunk's hooks into the layered placement. */
	compound?: unknown;
	/** Drawing lanes and groups. */
	drawGroups?: unknown;
	/** Group rectangles round their members, for the free placements. */
	groupBoxes?: (g: Graph, boxes: Box[]) => GroupBox[];
	/** The crossing search. */
	search?: unknown;
	/** Rerouting what a shared route ran into, and moving a walled-in end to another side. */
	repair?: { unshare: (rt: never) => void; reattach: unknown };
	/** Path highlighting, which acts on a drawing. */
	path?: unknown;
	/** Drawing a graph too large to lay out on the main thread. */
	large?: unknown;
	/** Stylesheets the chunks bring, by chunk, adopted with the graph's own. */
	css: Record<string, string>;
};
export const ext: Ext = { place: {}, css: {} };

export type Chunk = "free" | "tree" | "force" | "lines" | "shapes" | "er" | "groups" | "interact" | "search" | "repair" | "large";

export class GraphChunkMissing extends Error {
	readonly chunk: Chunk;
	constructor(chunk: Chunk) {
		super(`the graph ${chunk} chunk has not loaded yet`);
		this.name = "GraphChunkMissing";
		this.chunk = chunk;
	}
}

export function need<T>(value: T | undefined, chunk: Chunk): T {
	if (value === undefined) throw new GraphChunkMissing(chunk);
	return value;
}

/*
 * One import per chunk, each a literal path a bundler can follow. `free` is shared by tree and force, so it
 * is imported by them rather than listed here, and `interact` and `large` act on a drawing, so the drawing
 * loads them: listed here, the worker's build would carry a copy of each.
 */
const loaders: Record<Exclude<Chunk, "free" | "interact" | "large">, () => Promise<unknown>> = {
	tree: () => import("./graph-tree.ts"),
	force: () => import("./graph-force.ts"),
	lines: () => import("./graph-lines.ts"),
	shapes: () => import("./graph-shapes.ts"),
	er: () => import("./graph-er.ts"),
	groups: () => import("./graph-groups.ts"),
	search: () => import("./graph-search.ts"),
	repair: () => import("./graph-repair.ts"),
};

export async function loadChunk(chunk: Chunk): Promise<void> {
	if (chunk !== "free" && chunk !== "interact" && chunk !== "large") await loaders[chunk]();
}

/** Orthogonal for layered and tree; straight for force and manual; curved for radial. */
export const routingOf = (g: Graph): NonNullable<Graph["routing"]> =>
	g.routing ?? (g.layout === "force" || g.layout === "manual" ? "straight" : g.layout === "radial" ? "spline" : "orthogonal");

const BASE_SHAPES = new Set(["rect", "rounded", "pill", "circle", "ellipse", "diamond", "point"]);
const BASE_MARKS = new Set([undefined, "none", "arrow", "open"]);

/**
 * The chunks a graph needs, decided from the graph alone, before any layout. The search and the repair are not
 * listed: whether a graph needs them depends on what the base layout leaves, so the layout itself asks.
 */
export function needs(g: Graph): Chunk[] {
	const out = new Set<Chunk>();
	const kind = g.layout ?? "layered";
	if (kind === "tree" || kind === "radial") out.add("tree");
	if (kind === "force" || kind === "manual") out.add("force");
	if (routingOf(g) !== "orthogonal" || kind === "radial") out.add("lines");
	for (const n of g.nodes) if (n.shape !== undefined && !BASE_SHAPES.has(n.shape) && n.shape !== "record") out.add("shapes");
	if (g.nodes.some((n) => n.shape === "record") || g.edges.some((e) => !BASE_MARKS.has(e.head) || !BASE_MARKS.has(e.tail))) out.add("er");
	if (g.groups?.length || g.lanes?.length) out.add("groups");
	return [...out];
}

/**
 * Lay out with whatever chunks the graph turns out to need, loading each as it is asked for. A layout that
 * asks for the same chunk twice has a chunk that does not register itself, which would otherwise loop.
 */
export async function layoutLoading(run: () => GraphLayout, first: readonly Chunk[] = []): Promise<GraphLayout> {
	await Promise.all(first.map(loadChunk));
	const asked = new Set<Chunk>();
	for (;;) {
		try {
			return run();
		} catch (error) {
			if (!(error instanceof GraphChunkMissing) || asked.has(error.chunk)) throw error;
			asked.add(error.chunk);
			await loadChunk(error.chunk);
		}
	}
}

export type { Pt };
