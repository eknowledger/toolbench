/**
 * The graph kind (#152), the entry of its base chunk: validates, lays out and draws, synchronously, as every
 * renderer does.
 *
 * Two things are not synchronous, and both keep `render` so:
 *
 *  - **A chunk the graph needs and the page has not fetched** (a tree placement, records, the search): this
 *    throws `ChartRendererMissing` carrying the load, the element fetches it and draws again, one frame later.
 *  - **A large graph**, past `LARGE` nodes, is the large-graph chunk's: the figure comes back at once with the
 *    edge table open and a line saying the picture is being laid out, and the layout runs off the main thread.
 */
import { graphProblem, type Graph } from "@toolbench/sdk";
import { el } from "../dom.ts";
import { ChartRendererMissing, type RenderOptions } from "../render/index.ts";
import { ext, GraphChunkMissing, layoutLoading, loadChunk, needs, type Chunk } from "./chunks.ts";
import { adoptGraphStyles, drawLayout, edgeTable, summary, type Wide } from "./draw.ts";
import { SHAPES } from "./geometry.ts";
import { collapsedOf, effective, layout } from "./layout.ts";
import type { GraphLayout } from "./model.ts";

/** Past this many nodes the layout leaves the main thread: measured at 100 nodes, it takes 60 to 620 ms there. */
export const LARGE = 100;

/** Whether a chunk has registered itself, by what it registers. */
const has = (c: Chunk): boolean =>
	({ free: true, tree: !!ext.place.tree, force: !!ext.place.force, lines: !!ext.lines, shapes: !!SHAPES.hexagon, er: !!ext.record, groups: !!ext.compound, interact: !!ext.path, search: !!ext.search, repair: !!ext.repair, large: !!ext.large })[c];

/**
 * A layout `prepareGraph` made, kept for the draw that follows it, so a seed is not laid out twice. Taken once:
 * a later draw lays out afresh, as it always did.
 */
const prepared = new WeakMap<Graph, GraphLayout>();

/**
 * Every chunk this graph needs that is not here yet, fetched: what a host awaits before painting a seed.
 *
 * ⚠️ `needs()` is not the whole list. The crossing search and the repair are asked for by the layout itself,
 * once it sees what the base placement left, so the only way to know is to lay out. Fetching `needs()` alone
 * let the bipartite graph reach a closed card's synchronous paint without the search, and the card showed
 * "could not be loaded" in place of the graph (#201). A large graph's picture is the large-graph chunk's.
 */
export async function prepareGraph(graph: Graph): Promise<void> {
	await Promise.all(needs(graph).filter((c) => !has(c)).map(loadChunk));
	if (graphProblem(graph, { colors: false })) return;
	if (graph.nodes.length > LARGE) {
		if (!has("large")) await import("./graph-large.ts");
		return;
	}
	prepared.set(graph, await layoutLoading(() => layout(graph, { collapsed: collapsedOf(graph) })));
}

/** What draws one layout into the figure: the base's, handed to the large-graph chunk. */
export type Show = (L: GraphLayout, collapsed: Set<string>, relayout: (next: Set<string>) => void) => void;
/** The large-graph chunk's entry: draws the table now, the picture when a layout off the main thread arrives. */
export type Large = (graph: Graph, figure: HTMLElement, collapsed: Set<string>, worker: RenderOptions["graphWorker"], show: Show) => void;

export function renderGraph(graph: Graph, options: RenderOptions = {}): HTMLElement {
	const figure = el("figure", { class: "tb-out-graph tb-graph", "aria-label": summary(graph) });
	// Structure, not colours: an unknown colour is drawn as the default, not refused (see graphProblem).
	const problem = graphProblem(graph, { colors: false });
	if (problem) {
		figure.append(el("p", { class: "tb-graph-message" }, `${graph.label}: ${problem}, so it is listed below instead of drawn.`), edgeTable(graph));
		adoptGraphStyles(figure);
		return figure;
	}
	const missing = needs(graph).find((c) => !has(c));
	if (missing) throw new ChartRendererMissing("graph", () => loadChunk(missing));

	// Fit or full size, one state for the figure, so opening a group does not undo the reader's choice.
	const wide: Wide = { fit: options.wide !== "scroll", toggle: options.wideToggle !== false };
	/** Draw `L`, keeping focus in the picture if it was there: replaced under it, focus fell to the page. */
	const show: Show = (L, collapsed, relayout) => {
		const root = figure.getRootNode() as Document | ShadowRoot;
		const focused = figure.contains(root.activeElement ?? null);
		figure.replaceChildren(...drawLayout(graph, effective(graph, collapsed), L, collapsed, relayout, wide));
		// Again, because the chunks this layout fetched may have brought sheets of their own.
		adoptGraphStyles(figure);
		if (focused) (figure.querySelector(".tb-graph-plot") as HTMLElement | null)?.focus();
	};
	if (graph.nodes.length > LARGE) {
		const large = ext.large as Large | undefined;
		if (!large) throw new ChartRendererMissing("graph", () => import("./graph-large.ts").then(() => undefined));
		large(graph, figure, collapsedOf(graph), options.graphWorker, show);
	} else {
		/*
		 * A reader opening or closing a group. A chunk this needs that is not here yet (the search, say) is
		 * fetched first rather than thrown, since no host is drawing at this moment to catch it.
		 */
		const relayout = (next: Set<string>): void => void layoutLoading(() => layout(graph, { collapsed: next })).then((L) => show(L, next, relayout));
		const collapsed = collapsedOf(graph);
		try {
			const ready = prepared.get(graph);
			prepared.delete(graph);
			show(ready ?? layout(graph, { collapsed }), collapsed, relayout);
		} catch (error) {
			// The search or the repair, asked for by the layout itself once it knows what it left.
			if (error instanceof GraphChunkMissing) throw new ChartRendererMissing("graph", () => loadChunk(error.chunk));
			throw error;
		}
	}
	adoptGraphStyles(figure);
	return figure;
}
