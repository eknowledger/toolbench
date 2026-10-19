/**
 * The graph layout's gates on the eleven bench families (#152), in Node, where the layout runs as it does in a
 * page or a worker: no DOM, the same numbers.
 *
 *  - No overlaps, ever: no two edges sharing a stretch or running closer than 6px, no edge through a node, a
 *    label, a title or a badge, no label on a node, no lost label, no group holding a stranger.
 *  - Crossings no worse than the table below, family by family. The numbers are what the reviewed mockup drew,
 *    recorded by hand from its report, so a change that adds a crossing anywhere fails here even when the total
 *    hides it.
 *  - Ports where a reader expects them: one end alone on a side at its midpoint, several packed symmetrically,
 *    none at a corner, every record row's edge at that row.
 *  - Each family laid out in under 50 ms on the machine that budget was set on, scaled to this one by a
 *    reference workload (test/graph/pace.ts), and the same layout twice.
 *
 * The overlap and attachment checks measure the drawn geometry, not the router's bookkeeping, so a bug in the
 * router cannot hide behind its own accounting. See test/graph/audit.ts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Graph } from "@toolbench/sdk";
import { attach } from "../test/graph/attach.ts";
import { audit, overlaps } from "../test/graph/audit.ts";
import { families } from "../test/graph/families.ts";
import { effective, layout } from "../test/graph/all.ts";
import { instrumented, paced, REFERENCE_MS } from "../test/graph/pace.ts";

/** Every family and variant, plus the nested family with a group closed: 21 layouts. */
const cases: [string, Graph][] = [];
for (const f of families) for (const v of f.variants ?? [{ label: "", graph: f.graph }]) cases.push([v.label ? `${f.id} (${v.label})` : f.id, v.graph]);
const nested = families.find((f) => f.id === "nested")!.graph;
cases.push(["nested, vpc collapsed", { ...nested, groups: nested.groups!.map((x) => (x.id === "vpc" ? { ...x, collapsed: true } : x)) }]);

/** Drawn crossings per family in the reviewed mockup, F1c. A family may do better, never worse. */
const CROSSINGS: Record<string, number> = {
	flowchart: 1,
	"state (orthogonal)": 0,
	"state (spline)": 0,
	"deps (orthogonal)": 2,
	"deps (spline)": 2,
	org: 0,
	"network (straight)": 0,
	"network (orthogonal)": 0,
	er: 2,
	mind: 0,
	lanes: 2,
	nested: 2,
	"calls (orthogonal)": 15,
	"calls (spline)": 15,
	"directions (LR)": 0,
	"directions (RL)": 0,
	"directions (TB)": 0,
	"directions (BT)": 0,
	// The base alone leaves 14. The crossing search, a chunk of its own that follows this change, takes it to 4.
	bipartite: 14,
	"nested, vpc collapsed": 0,
};

describe("graph layout, the eleven families", () => {
	it("covers every family the table names, and the table names every family", () => {
		assert.deepEqual(cases.map(([name]) => name).sort(), Object.keys(CROSSINGS).sort());
	});

	for (const [name, g] of cases) {
		describe(name, () => {
			const L = layout(g);
			const drawn = effective(g, new Set((g.groups ?? []).filter((x) => x.collapsed).map((x) => x.id)));
			const a = audit(drawn, L);

			it("has no overlaps", () => {
				const found = Object.entries(a).filter(([k, v]) => v && k !== "crossings" && k !== "mergedRuns");
				assert.equal(overlaps(a), 0, `overlaps: ${found.map(([k, v]) => `${k} ${v}`).join(", ")}`);
			});

			it(`crosses no more than the reviewed ${CROSSINGS[name]}`, () => {
				assert.ok(a.crossings <= CROSSINGS[name]!, `${a.crossings} crossings`);
			});

			it("attaches every edge at a centred port, and none at a corner", () => {
				const t = attach(drawn, L);
				assert.equal(t.corner, 0, "ends at a corner");
				assert.equal(t.singleOk, t.single, `single ends at the midpoint: ${t.singleOk} of ${t.single}`);
				assert.equal(t.multiOk, t.multi, `sides packed symmetrically: ${t.multiOk} of ${t.multi}`);
				assert.equal(t.rowsOk, t.rows, `row ends at their row: ${t.rowsOk} of ${t.rows}`);
			});

			it("lays out the same twice, from a copy", () => {
				assert.deepEqual(layout(structuredClone(g)), L);
			});
		});
	}

	it("lays out every family in under 50 ms, scaled to this machine", (t) => {
		// 50 ms on the machine REFERENCE_MS was measured on. Without the scaling the budget was that laptop's:
		// the call graph took 22.8 ms there and 82.4 ms on a GitHub runner, and failed with nothing wrong.
		if (instrumented) return t.skip("V8 coverage is on, so a time here measures the instrumentation");
		// The fastest of five, after the run above warmed the code, so a collection pause does not decide it.
		const { measured, factor, times, medians } = paced(cases.map(([name, g]) => [name, () => layout(g)] as const));
		const budget = 50 * factor;
		const [slowest, slowestMs] = times.reduce((a, b) => (b[1] > a[1] ? b : a));
		const slowestMedian = medians.tasks.find(([name]) => name === slowest)![1];
		t.diagnostic(
			`reference ${measured.toFixed(1)} ms against ${REFERENCE_MS}, budget ${budget.toFixed(1)} ms, slowest ${slowest} ${slowestMs.toFixed(1)} ms` +
				` (medians: reference ${medians.reference.toFixed(1)}, ${slowest} ${slowestMedian.toFixed(1)})`,
		);
		const slow = times.filter(([, ms]) => ms >= budget).map(([name, ms]) => `${name} ${ms.toFixed(1)} ms, budget ${budget.toFixed(1)}`);
		assert.deepEqual(slow, []);
	});
});
