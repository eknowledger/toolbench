/**
 * The graph kind (#152), the entry of its base chunk: validates, lays out and draws, synchronously, as every
 * renderer does.
 *
 * A chunk the graph needs and the page has not fetched (a tree placement, records, the repair) keeps `render`
 * synchronous too: this throws `ChartRendererMissing` carrying the load, and the element fetches it and draws
 * again, one frame later.
 */
import { graphProblem, type Graph } from "@toolbench/sdk";
import { el } from "../dom.ts";
import { ChartRendererMissing, type RenderOptions } from "../render/index.ts";
import { ext, GraphChunkMissing, layoutLoading, loadChunk, needs, type Chunk } from "./chunks.ts";
import { adoptGraphStyles, drawLayout, edgeTable, summary } from "./draw.ts";
import { SHAPES } from "./geometry.ts";
import { collapsedOf, effective, layout } from "./layout.ts";
import type { GraphLayout } from "./model.ts";

/** Whether a chunk has registered itself, by what it registers. */
const has = (c: Chunk): boolean =>
	({ free: true, tree: !!ext.place.tree, force: !!ext.place.force, lines: !!ext.lines, shapes: !!SHAPES.hexagon, er: !!ext.record, groups: !!ext.compound, interact: !!ext.path, repair: !!ext.repair })[c];

/** Every chunk this graph needs that is not here yet, fetched: what a host awaits before painting a seed. */
export async function prepareGraph(graph: Graph): Promise<void> {
	await Promise.all(needs(graph).filter((c) => !has(c)).map(loadChunk));
}

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

	/** Draw `L`, keeping focus in the picture if it was there: replaced under it, focus fell to the page. */
	const show = (L: GraphLayout, collapsed: Set<string>, relayout: (next: Set<string>) => void) => {
		const root = figure.getRootNode() as Document | ShadowRoot;
		const focused = figure.contains(root.activeElement ?? null);
		figure.replaceChildren(...drawLayout(graph, effective(graph, collapsed), L, collapsed, relayout));
		// Again, because the chunks this layout fetched may have brought sheets of their own.
		adoptGraphStyles(figure);
		if (focused) (figure.querySelector(".tb-graph-plot") as HTMLElement | null)?.focus();
	};
	/*
	 * A reader opening or closing a group. A chunk this needs that is not here yet (the repair, say) is
	 * fetched first rather than thrown, since no host is drawing at this moment to catch it.
	 */
	const relayout = (next: Set<string>): void => void layoutLoading(() => layout(graph, { collapsed: next })).then((L) => show(L, next, relayout));
	const collapsed = collapsedOf(graph);
	try {
		show(layout(graph, { collapsed }), collapsed, relayout);
	} catch (error) {
		// The repair, asked for by the layout itself once it knows what it left.
		if (error instanceof GraphChunkMissing) throw new ChartRendererMissing("graph", () => loadChunk(error.chunk));
		throw error;
	}
	adoptGraphStyles(figure);
	return figure;
}
