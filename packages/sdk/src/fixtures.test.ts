/**
 * The harness has to fail correctly, or it is worse than nothing: a suite that always passes gives
 * false confidence to every host that adopts it. So these tests are almost entirely about breakage.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { ToolDirectoryError, readToolDirectory, scanToolDirectory } from "./fixtures.ts";
import { SDK_VERSION } from "./version.ts";

const base = mkdtempSync(join(tmpdir(), "toolbench-fixtures-"));
after(() => rmSync(base, { recursive: true, force: true }));

const GOOD_MANIFEST = {
	sdk: 1,
	id: "ok",
	name: "Ok",
	blurb: "A tool that exists so the harness has something valid to compare against.",
	version: "1.0.0",
	capabilities: ["pure"],
	runtime: { entry: "index.ts" },
	inputs: [{ id: "a", type: "text", label: "A", default: "x" }],
	kinds: ["fields", "error"],
};
const GOOD_CASES = [{ name: "a case", input: {}, expect: { kind: "fields", fields: [] } }];

let counter = 0;
/** Build a throwaway tool directory. Returns the *parent*, which is what the harness is pointed at. */
function fixture(dirName: string, manifest: unknown, cases?: unknown): string {
	const parent = join(base, `t${counter++}`);
	const root = join(parent, dirName);
	mkdirSync(root, { recursive: true });
	writeFileSync(join(root, "tool.json"), JSON.stringify(manifest));
	if (cases !== undefined) writeFileSync(join(root, "cases.json"), JSON.stringify(cases));
	return parent;
}

describe("scanToolDirectory", () => {
	it("finds directories holding a tool.json, sorted", () => {
		const parent = fixture("beta", { ...GOOD_MANIFEST, id: "beta" }, GOOD_CASES);
		mkdirSync(join(parent, "alpha"));
		writeFileSync(join(parent, "alpha", "tool.json"), JSON.stringify({ ...GOOD_MANIFEST, id: "alpha" }));
		writeFileSync(join(parent, "alpha", "cases.json"), JSON.stringify(GOOD_CASES));
		assert.deepEqual(
			scanToolDirectory(parent).map((t) => t.id),
			["alpha", "beta"],
		);
	});

	it("ignores a subdirectory with no tool.json, so shared helpers can live alongside tools", () => {
		const parent = fixture("ok", GOOD_MANIFEST, GOOD_CASES);
		mkdirSync(join(parent, "shared"));
		writeFileSync(join(parent, "shared", "helpers.ts"), "export const x = 1;");
		assert.deepEqual(
			scanToolDirectory(parent).map((t) => t.id),
			["ok"],
		);
	});

	it("refuses a directory that is not there, rather than reporting no tools", () => {
		assert.throws(() => scanToolDirectory(join(base, "nope")), ToolDirectoryError);
	});
});

describe("readToolDirectory rejects", () => {
	const cases: [string, () => string, RegExp][] = [
		[
			"an id that disagrees with the directory name",
			() => fixture("wrong-name", GOOD_MANIFEST, GOOD_CASES),
			/manifest id is "ok" but the directory is "wrong-name"/,
		],
		["a missing cases.json", () => fixture("ok", GOOD_MANIFEST), /cases\.json is missing/],
		["an empty cases.json", () => fixture("ok", GOOD_MANIFEST, []), /cases\.json is empty/],
		[
			"a case expecting a kind the manifest does not declare",
			() => fixture("ok", GOOD_MANIFEST, [{ name: "c", input: {}, expect: { kind: "table", columns: [], rows: [] } }]),
			/does not declare in kinds/,
		],
		[
			"an invalid manifest, with the validator's own message",
			() => fixture("ok", { ...GOOD_MANIFEST, kinds: ["fields"] }, GOOD_CASES),
			/must include "error"/,
		],
		[
			"a contract version newer than this SDK",
			() => fixture("ok", { ...GOOD_MANIFEST, sdk: SDK_VERSION + 1 }, GOOD_CASES),
			/needs contract version/,
		],
		["cases.json that is not JSON at all", () => {
			const parent = fixture("ok", GOOD_MANIFEST);
			writeFileSync(join(parent, "ok", "cases.json"), "{ not json");
			return parent;
		}, /not valid JSON/],
	];

	for (const [what, make, expected] of cases) {
		it(what, () => {
			const parent = make();
			assert.throws(() => readToolDirectory(parent), (error: unknown) => {
				assert.ok(error instanceof ToolDirectoryError, `expected ToolDirectoryError, got ${String(error)}`);
				assert.match(error.message, expected);
				// The message must name the tool, or a directory of thirty tools reports a mystery.
				assert.ok(error.toolId, "every per-tool failure must carry its tool id");
				return true;
			});
		});
	}
});

describe("readToolDirectory accepts", () => {
	it("a valid tool, and reports where its entry module is", () => {
		const parent = fixture("ok", GOOD_MANIFEST, GOOD_CASES);
		const [tool] = readToolDirectory(parent);
		assert.ok(tool);
		assert.equal(tool.id, "ok");
		assert.equal(tool.manifest.sdk, SDK_VERSION, "an older manifest is upgraded on the way through");
		assert.equal(tool.manifest.runtime.thread, "main", "and defaults are filled in by validation");
		assert.ok(tool.entry.endsWith(join("ok", "index.ts")), `entry should be an absolute path: ${tool.entry}`);
		assert.equal(tool.cases.length, 1);
	});
});
