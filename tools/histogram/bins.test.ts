/**
 * Binning properties: the fixtures pin exact charts on small inputs; these check the invariants
 * that have to hold for any input, including ones a fixture would be a poor place to write down.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { binValues, parseValues } from "./index.ts";

describe("histogram bins", () => {
	it("counts sum to the number of values, and the last cumulative is 100", () => {
		const parsed = parseValues("2 3 3 4 4 4 5 5 5 5 6 6 6 7 7 8 9 11 14 18");
		assert.ok("values" in parsed);
		const bins = binValues(parsed.values, 8);
		assert.equal(bins.counts.reduce((sum, n) => sum + n, 0), parsed.values.length);
		assert.equal(bins.cumulative.at(-1), 100);
		assert.equal(bins.x.length, 8);
	});

	it("collapses an identical set to one bar, whatever bin count was asked for", () => {
		const bins = binValues([7, 7, 7, 7], 30);
		assert.deepEqual(bins, { x: [7], counts: [4], cumulative: [100] });
	});

	it("puts the maximum in the last bin, not past it", () => {
		const bins = binValues([0, 10], 2);
		assert.deepEqual(bins.counts, [1, 1]);
		assert.deepEqual(bins.x, [2.5, 7.5]);
	});
});
