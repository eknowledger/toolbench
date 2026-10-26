/**
 * The GitHub release notes scripts/release-notes.mjs writes, for two real releases.
 *
 * ⚠️ The expected files in scripts/fixtures/ were typed by hand from the What's new page as it renders
 * (each item's name, its line and its label, in the page's order) and the format in docs/releasing.md.
 * They were not printed from the generator, which would prove nothing. 0.13.0 is the release with a
 * second item inside one entry (Chart settings, inside the chart labels fix), and 0.10.0 the one whose
 * entries both packages carry, so each would show a merge gone wrong.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { allVersions, releaseNotes } from "./release-notes.mjs";

const fixture = (v: string) => readFileSync(join(import.meta.dirname, "fixtures", `release-notes-${v}.md`), "utf8");

describe("GitHub release notes", () => {
	for (const v of ["0.13.0", "0.10.0"]) {
		it(`${v} reads as the What's new page lists it`, () => {
			assert.equal(releaseNotes(v), fixture(v));
		});
	}

	it("has notes for every version either changelog has, newest first", () => {
		const versions = allVersions() as string[];
		assert.equal(versions[0], JSON.parse(readFileSync(join(import.meta.dirname, "../packages/runtime/package.json"), "utf8")).version);
		assert.equal(versions.at(-1), "0.1.1");
		for (const v of versions) assert.match(releaseNotes(v) as string, /^### (New|Changed|Fixed) \(\d+\)\n/);
	});

	it("refuses a version neither changelog has", () => {
		assert.throws(() => releaseNotes("9.9.9"), /has a section for 9\.9\.9/);
	});
});
