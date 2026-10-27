/**
 * Structural checks on a `graph` output (contract version 7), shared by the fixture runner and the runtime.
 *
 * Structure only: ids that are unique, edges and ports that name something, groups whose parents do not form a
 * cycle, a group inside one lane, the tool's own `limits`, and a `tone` or `color` that is one of the closed list.
 * Nothing about size, depth or density is refused here, because those are the tool's decision, and a tool that
 * wants a ceiling says so with `limits`.
 *
 * ⚠️ The colours are checked because the union is closed only to TypeScript: a plain-JavaScript tool, or one
 * passing a reader's input through, can send any string. The runtime draws an unknown one as the default colour
 * rather than refusing the graph, since a newer contract may add colours an older page does not know; the
 * fixture runner refuses it, so the author finds out.
 *
 * Here rather than in the runtime so that a tool's fixtures fail on a graph the runtime would refuse: a case
 * whose expected output is a graph with a dangling edge would otherwise pass in Node and draw a message on
 * every page.
 */
import type { Graph, GraphColor } from "./types.ts";

/**
 * Every `GraphColor`, as data: the union is closed only to TypeScript, so the runtime and the fixture runner
 * check a value against this list. The first four are the tones.
 *
 * ⚠️ Here and not in types.ts, whose other lists only the validator reads. A bundler splits by module, so a
 * list in types.ts read by the graph chunk and the validation chunk became a third chunk of its own, 242
 * bytes, that every page fetched to validate its manifests.
 */
export const GRAPH_COLORS: readonly GraphColor[] = ["normal", "warn", "bad", "good", "accent", "muted", "series-1", "series-2", "series-3", "series-4", "series-5", "series-6", "series-7", "series-8"];

const TONES = GRAPH_COLORS.slice(0, 4);

/**
 * Why this graph cannot be drawn, in words that finish "so it is listed instead of drawn", or undefined.
 * `colors: false` leaves out the colour check, which is how the runtime calls it: see above.
 */
export function graphProblem(graph: Graph, { colors = true }: { colors?: boolean } = {}): string | undefined {
	const { nodes, edges, limits = {} } = graph;
	const nodeIds = new Set<string>();
	const lanes = new Set<string>();
	const groups = new Map<string, string | undefined>();
	/** The first id in `ids` met twice, or "" for an empty one. */
	const twice = (ids: string[], seen = new Set<string>()) => ids.find((id) => !id || seen.size === seen.add(id).size);
	if (!nodes.length) return "it has no nodes";
	if (nodes.length > (limits.nodes ?? Infinity)) return `it has ${nodes.length} nodes, more than the ${limits.nodes} this tool draws`;
	if (edges.length > (limits.edges ?? Infinity)) return `it has ${edges.length} edges, more than the ${limits.edges} this tool draws`;
	let id = twice(nodes.map((n) => n.id), nodeIds);
	if (id !== undefined) return id ? `two nodes share the id "${id}"` : "a node has an empty id";
	for (const n of nodes) if ((id = twice((n.rows ?? []).map((r) => r.id))) !== undefined) return `two rows of "${n.id}" share the id "${id}"`;
	if ((id = twice((graph.lanes ?? []).map((l) => l.id), lanes)) !== undefined) return `two lanes share the id "${id}"`;
	// A closed group is drawn as a node with the group's id, so a group's id must not be a node's either.
	if ((id = twice((graph.groups ?? []).map((g) => g.id), new Set(nodeIds))) !== undefined) return `the group id "${id}" is used twice`;
	for (const g of graph.groups ?? []) groups.set(g.id, g.parent);
	for (const [group, parent] of groups) {
		if (parent !== undefined && !groups.has(parent)) return `the group "${group}" names a parent "${parent}" that does not exist`;
		// Walking up can visit each group once; a longer walk has gone round a cycle.
		for (let at = parent, steps = 0; at !== undefined; at = groups.get(at)) if (at === group || ++steps > groups.size) return `the group "${group}" is its own ancestor`;
	}
	const laneOf = new Map<string, string | undefined>();
	for (const n of nodes) {
		if (n.group !== undefined && !groups.has(n.group)) return `"${n.id}" names a group "${n.group}" that does not exist`;
		if (n.lane !== undefined && !lanes.has(n.lane)) return `"${n.id}" names a lane "${n.lane}" that does not exist`;
		// A group is drawn as one rectangle and a lane as one band, so a group cannot be in two lanes.
		for (let at = n.group; at !== undefined; at = groups.get(at)) {
			if (laneOf.has(at) && laneOf.get(at) !== n.lane) return `the group "${at}" has members in more than one lane`;
			laneOf.set(at, n.lane);
		}
	}
	const rowsOf = new Map(nodes.map((n) => [n.id, n.rows]));
	for (const e of edges)
		for (const [end, port] of [
			[e.from, e.fromPort],
			[e.to, e.toPort],
		] as const) {
			if (!nodeIds.has(end)) return `an edge names "${end}", which is not a node`;
			if (port !== undefined && !rowsOf.get(end)?.some((r) => r.id === port)) return `an edge names the row "${end}.${port}", which does not exist`;
		}
	for (const n of graph.highlight ?? []) if (!nodeIds.has(n)) return `the highlighted path names "${n}", which is not a node`;
	if (colors) {
		const wrong = (value: unknown, allowed: readonly string[], what: string) =>
			value !== undefined && !allowed.includes(value as string) ? `${what} is ${JSON.stringify(value)}, which is not one of ${allowed.join(", ")}` : undefined;
		for (const n of nodes) {
			const p = wrong(n.tone, TONES, `the tone of "${n.id}"`) ?? wrong(n.color, GRAPH_COLORS, `the color of "${n.id}"`);
			if (p) return p;
		}
		for (const e of edges) {
			const p = wrong(e.tone, TONES, `the tone of the edge ${e.from} to ${e.to}`) ?? wrong(e.color, GRAPH_COLORS, `the color of the edge ${e.from} to ${e.to}`);
			if (p) return p;
		}
		for (const g of graph.groups ?? []) {
			const p = wrong(g.color, GRAPH_COLORS, `the color of the group "${g.id}"`);
			if (p) return p;
		}
	}
	return undefined;
}
