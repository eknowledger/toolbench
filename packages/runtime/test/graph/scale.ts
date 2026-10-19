/**
 * No overlaps at any size (#152): seeded graphs of every kind the runtime lays out, through the same geometric
 * checks as the families. Shared by the two files that run it: `src/graph-scale.test.ts`, the sizes fast enough
 * for every `pnpm test`, and `graph-large.scale.ts`, the 250 and 500 node graphs, which `pnpm test:graph-scale`
 * runs and CI runs as a step of its own. The graphs are seeded, so a failure reproduces exactly.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Graph } from "@toolbench/sdk";
import { audit, overlaps } from "./audit.ts";
import { effective, layout } from "./all.ts";
import { dag, net } from "./synth.ts";

export const KINDS: [string, (n: number) => Graph][] = [
	["layered, orthogonal", (n) => dag(n)],
	["layered, spline", (n) => dag(n, "spline")],
	["force, straight", (n) => net(n)],
	["force, orthogonal", (n) => net(n, "orthogonal")],
];

export function noOverlapsAt(sizes: number[]): void {
	describe("graph layout at scale", () => {
		for (const [kind, make] of KINDS)
			for (const n of sizes)
				it(`${kind}, ${n} nodes: no overlaps`, () => {
					const g = make(n);
					const a = audit(effective(g), layout(g));
					const found = Object.entries(a).filter(([k, v]) => v && k !== "crossings" && k !== "mergedRuns");
					assert.equal(overlaps(a), 0, found.map(([k, v]) => `${k} ${v}`).join(", "));
				});
	});
}
