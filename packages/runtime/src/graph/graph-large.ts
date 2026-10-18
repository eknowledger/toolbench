/**
 * The large-graph chunk: a graph past a hundred nodes, laid out off the main thread.
 *
 * Measured, a layout of 120 to 500 nodes takes 0.1 to 13 seconds, and a page that stops for that long is a
 * broken page. So the figure comes back at once with its edge table open and a line saying the picture is
 * being laid out, the layout runs in the host's worker when it gave the runtime one (or after a frame on the
 * main thread when not), and the picture replaces the line when it arrives. The edges can be read the whole
 * time, which is the point of showing the table first.
 */
import { el } from "../dom.ts";
import { ext } from "./chunks.ts";
import { edgeTable } from "./draw.ts";
import type { Large } from "./graph.ts";
import { layoutHere } from "./graph-worker.ts";
import type { GraphLayout } from "./model.ts";
import type { Request, Response } from "../protocol.ts";

type Graph = Parameters<Large>[0];

/** Lay out on this thread, a frame from now so the figure and its table paint first. */
const here = (graph: Graph, collapsed: readonly string[]): Promise<GraphLayout> => new Promise((ok) => setTimeout(ok, 0)).then(() => layoutHere(graph, collapsed));

/*
 * One worker for the page, made with the host's factory the first time a large graph needs it, and kept: graphs
 * keep arriving, and a worker per graph would pay its start each time.
 */
let worker: Worker | undefined;
let seq = 0;
const waiting = new Map<number, { ok: (layout: GraphLayout) => void; no: (error: Error) => void }>();
const there = (factory: () => Worker) => (graph: Graph, collapsed: readonly string[]): Promise<GraphLayout> =>
	new Promise((ok, no) => {
		if (!worker) {
			worker = factory();
			worker.addEventListener("message", (event: MessageEvent<Response>) => {
				const m = event.data;
				if (m.type !== "laid" && m.type !== "crash") return;
				const waiter = waiting.get(m.seq);
				waiting.delete(m.seq);
				if (m.type === "laid") waiter?.ok(m.layout);
				else waiter?.no(new Error(m.message));
			});
		}
		waiting.set(++seq, { ok, no });
		worker.postMessage({ type: "layout", seq, graph, collapsed: [...collapsed] } satisfies Request);
	});

const large: Large = (graph, figure, collapsed, factory, show) => {
	const laid = factory ? there(factory) : here;
	let run = 0;
	const table = edgeTable(graph);
	table.open = true;
	figure.replaceChildren(el("p", { class: "tb-graph-message", role: "status" }, `Laying out ${graph.nodes.length} nodes and ${graph.edges.length} edges. Until the picture is ready, they are listed below.`), table);
	const away = (closed: Set<string>) => {
		// Only the latest layout is drawn: a reader who opens two groups quickly sees the second.
		const mine = ++run;
		laid(graph, [...closed]).then(
			(L) => mine === run && show(L, closed, away),
			(error: unknown) => mine === run && figure.replaceChildren(el("p", { class: "tb-graph-message", role: "alert" }, `${graph.label} could not be laid out (${error instanceof Error ? error.message : String(error)}), so it is listed below.`), edgeTable(graph)),
		);
	};
	away(collapsed);
};
ext.large = large;
