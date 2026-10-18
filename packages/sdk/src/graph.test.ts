/**
 * The graph kind's structural rules (#152, contract version 7). Each case is written by hand from the rule it
 * tests, not from what the function returns: one valid graph, then one breakage per rule.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { graphProblem } from "./graph.ts";
import { compare } from "./testing.ts";
import type { Graph, Output } from "./types.ts";

const ok: Graph = {
	label: "Deploy",
	nodes: [
		{ id: "build", group: "ci", lane: "dev" },
		{ id: "test", group: "ci", lane: "dev" },
		{ id: "db", shape: "record", rows: [{ id: "pk", label: "id" }], lane: "ops" },
	],
	edges: [
		{ from: "build", to: "test" },
		{ from: "test", to: "db", toPort: "pk" },
	],
	groups: [{ id: "ci", label: "CI" }],
	lanes: [
		{ id: "dev", label: "Dev" },
		{ id: "ops", label: "Ops" },
	],
	highlight: ["build", "test"],
};

describe("graphProblem", () => {
	it("passes a graph whose every name resolves", () => {
		assert.equal(graphProblem(ok), undefined);
	});

	it("refuses a graph with no nodes, which has nothing to draw", () => {
		assert.match(graphProblem({ label: "x", nodes: [], edges: [] }) ?? "", /no nodes/);
	});

	it("refuses two nodes with one id, which an edge could not tell apart", () => {
		assert.match(graphProblem({ ...ok, nodes: [...ok.nodes, { id: "build" }] }) ?? "", /two nodes share the id "build"/);
	});

	it("refuses an edge to a node that does not exist", () => {
		assert.match(graphProblem({ ...ok, edges: [{ from: "build", to: "deploy" }] }) ?? "", /names "deploy"/);
	});

	it("refuses an edge to a row that does not exist", () => {
		assert.match(graphProblem({ ...ok, edges: [{ from: "build", to: "db", toPort: "fk" }] }) ?? "", /row "db.fk"/);
	});

	it("refuses a node in a group that does not exist", () => {
		assert.match(graphProblem({ ...ok, groups: [] }) ?? "", /group "ci" that does not exist/);
	});

	it("refuses groups whose parents go round in a circle", () => {
		const groups = [
			{ id: "a", label: "A", parent: "b" },
			{ id: "b", label: "B", parent: "a" },
		];
		assert.match(graphProblem({ ...ok, nodes: [{ id: "n", group: "a" }], edges: [], groups, lanes: [], highlight: [] }) ?? "", /its own ancestor/);
	});

	it("refuses a group id that is also a node id, since a closed group is drawn as a node", () => {
		assert.match(graphProblem({ ...ok, groups: [...ok.groups!, { id: "test", label: "T" }] }) ?? "", /group id "test" is used twice/);
	});

	it("refuses a group with members in two lanes, since it is drawn as one rectangle", () => {
		assert.match(graphProblem({ ...ok, nodes: ok.nodes.map((n) => (n.id === "test" ? { ...n, lane: "ops" } : n)) }) ?? "", /group "ci" has members in more than one lane/);
	});

	it("refuses a lane that does not exist", () => {
		assert.match(graphProblem({ ...ok, lanes: [{ id: "dev", label: "Dev" }] }) ?? "", /lane "ops" that does not exist/);
	});

	it("refuses a highlighted path through a node that does not exist", () => {
		assert.match(graphProblem({ ...ok, highlight: ["build", "ship"] }) ?? "", /names "ship"/);
	});

	it("refuses a colour or tone outside the closed list, naming the field and the allowed values", () => {
		// What a plain-JavaScript tool could send: a string meant to break out of a style attribute.
		const bad = "x);background:url(https://example.com/?leak)";
		const node = graphProblem({ ...ok, nodes: ok.nodes.map((n) => (n.id === "build" ? { ...n, color: bad as never } : n)) }) ?? "";
		assert.match(node, /the color of "build" is "x\);background:url\(https:\/\/example.com\/\?leak\)", which is not one of normal, warn, bad, good, accent, muted, series-1, series-2, series-3, series-4, series-5, series-6, series-7, series-8/);
		assert.match(graphProblem({ ...ok, edges: [{ from: "build", to: "test", tone: "accent" as never }] }) ?? "", /the tone of the edge build to test is "accent", which is not one of normal, warn, bad, good$/);
		assert.match(graphProblem({ ...ok, groups: [{ id: "ci", label: "CI", color: bad as never }] }) ?? "", /the color of the group "ci"/);
		assert.equal(graphProblem({ ...ok, nodes: ok.nodes.map((n) => ({ ...n, color: "series-8" as const })) }), undefined, "every listed colour passes");
		// The runtime asks without colours: it draws an unknown one as the default rather than refusing the graph.
		assert.equal(graphProblem({ ...ok, nodes: ok.nodes.map((n) => ({ ...n, color: bad as never })) }, { colors: false }), undefined);
	});

	it("holds a graph to the tool's own limits, and to nothing when it sets none", () => {
		assert.match(graphProblem({ ...ok, limits: { nodes: 2 } }) ?? "", /3 nodes, more than the 2/);
		assert.match(graphProblem({ ...ok, limits: { edges: 1 } }) ?? "", /2 edges, more than the 1/);
		assert.equal(graphProblem({ ...ok, limits: { nodes: 3, edges: 2 } }), undefined);
		const big: Graph = { label: "Big", nodes: Array.from({ length: 2000 }, (_, i) => ({ id: `n${i}` })), edges: [] };
		assert.equal(graphProblem(big), undefined, "no default limit");
	});
});

describe("compare, on a graph", () => {
	it("fails a case whose output is a graph the runtime would refuse, even when it matches what was expected", () => {
		const bad: Output = { kind: "graph", graph: { label: "Bad", nodes: [{ id: "a" }], edges: [{ from: "a", to: "b" }] } };
		assert.match(compare(bad, { name: "dangling", input: {}, expect: bad }) ?? "", /cannot be drawn: an edge names "b"/);
	});

	it("passes a drawable graph that matches", () => {
		const good: Output = { kind: "group", parts: [{ kind: "graph", graph: ok }] };
		assert.equal(compare(good, { name: "fine", input: {}, expect: good }), undefined);
	});
});
