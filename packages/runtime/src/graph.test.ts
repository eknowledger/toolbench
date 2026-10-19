/**
 * The graph layout's gates on the bench families the base chunk draws (#152), in Node, where the layout runs as it does in a
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
import { needs } from "./graph/chunks.ts";
import { effective, layout } from "../test/graph/all.ts";
import { pace, REFERENCE_MS } from "../test/graph/pace.ts";

/**
 * Every family and variant the base chunk draws on its own: layered, orthogonal, the basic shapes. The others
 * need a placement, lines, shapes, records or groups from chunks of their own.
 */
const cases: [string, Graph][] = [];
for (const f of families) for (const v of f.variants ?? [{ label: "", graph: f.graph }]) if (!needs(v.graph).length) cases.push([v.label ? `${f.id} (${v.label})` : f.id, v.graph]);

/** Drawn crossings per family in the reviewed mockup, F1c. A family may do better, never worse. */
const CROSSINGS: Record<string, number> = {
	"state (orthogonal)": 0,
	"deps (orthogonal)": 2,
	"calls (orthogonal)": 15,
	// The base alone leaves 14. The crossing search, a chunk of its own that follows this change, takes it to 4.
	bipartite: 14,
};

describe("graph layout, the families the base draws", () => {
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
		const { factor, measured } = pace();
		const budget = 50 * factor;
		t.diagnostic(`reference workload ${measured.toFixed(1)} ms against ${REFERENCE_MS} ms, budget ${budget.toFixed(1)} ms`);
		// The median of five, after the run above warmed the code, so a collection pause does not decide it.
		const slow: string[] = [];
		let slowest = "";
		let slowestMs = 0;
		for (const [name, g] of cases) {
			const ms: number[] = [];
			for (let r = 0; r < 5; r++) {
				const t0 = performance.now();
				layout(g);
				ms.push(performance.now() - t0);
			}
			const median = ms.sort((x, y) => x - y)[2]!;
			if (median > slowestMs) [slowest, slowestMs] = [name, median];
			if (median >= budget) slow.push(`${name} ${median.toFixed(1)} ms, budget ${budget.toFixed(1)}`);
		}
		t.diagnostic(`slowest ${slowest} ${slowestMs.toFixed(1)} ms`);
		assert.deepEqual(slow, []);
	});
});
