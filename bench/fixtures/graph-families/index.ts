/**
 * The eleven graph families the layout is held to (#152), each one case of this fixture, so the graphs page
 * and the browser tests draw them through a real tool, a real result and the element, exactly as a reader
 * would get them.
 *
 * It lives in the bench rather than in `tools/` because it is not an example of a good tool: the graphs are
 * the layout's test data, shared with the Node tests in packages/runtime/test/graph. Beyond the families it
 * has one graph the runtime refuses for a dangling edge, and one past the tool's own limits.
 */
import type { Graph, Output, Tool } from "@toolbench/sdk";
import { families } from "../../../packages/runtime/test/graph/families.ts";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { case: string };

/** Every family and variant, by case id: `flowchart`, `state-spline`, and so on. */
export const graphs: Record<string, Graph> = {};
for (const f of families) for (const v of f.variants ?? [{ label: "", graph: f.graph }]) graphs[v.label ? `${f.id}-${v.label.toLowerCase()}` : f.id] = v.graph;
const nested = families.find((f) => f.id === "nested")!.graph;
graphs["nested-collapsed"] = { ...nested, groups: nested.groups!.map((x) => (x.id === "vpc" ? { ...x, collapsed: true } : x)) };
graphs["dangling"] = { label: "A dangling edge", nodes: [{ id: "a" }, { id: "b" }], edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }] };
/*
 * A colour that is not a colour: what a plain-JavaScript tool, or one passing a reader's input through, could
 * send. The runtime must draw the default colour and never put the string into a style.
 */
const injected = "x);background:url(https://example.com/?leak)" as never;
graphs["injected"] = { label: "An unknown colour", nodes: [{ id: "a", color: injected }, { id: "b" }], edges: [{ from: "a", to: "b", color: injected, tone: injected }] };
graphs["limits"] = { ...families.find((f) => f.id === "calls")!.graph, limits: { nodes: 12 } };

export default {
	run({ case: id }): Output {
		const graph = graphs[id];
		if (!graph) return { kind: "error", message: `No graph case "${id}".`, input: "case" };
		return { kind: "graph", graph };
	},
} satisfies Tool<Input>;
