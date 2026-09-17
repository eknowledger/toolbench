/**
 * The harness has to fail correctly, or it is worse than nothing: a suite that always passes gives
 * false confidence to every host that adopts it. So these tests are almost entirely about breakage.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { ToolDirectoryError, checkToolDirectory, readToolDirectory, scanToolDirectory } from "./fixtures.ts";
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

/**
 * A tool module, for the checks that have to actually run one. Written to disk and imported, because
 * there is no other way to reach the code path that imports a tool's entry module.
 *
 * Its guarded branches exist so a sample can steer it: "bad" is the input-rejection path a working tool
 * takes, "boom" is a defect, and "slow" never finishes but honours the abort signal the way a tool is
 * asked to. No case in GOOD_CASES sets any of them, so only a sample reaches them.
 */
const IMPL = `export default {
	run(input, ctx) {
		if (input.a === "boom") throw new Error("the boom branch");
		if (input.a === "bad") return { kind: "error", message: "a is not usable", input: "a" };
		if (input.a === "slow") {
			return new Promise((_resolve, reject) => {
				ctx.signal.addEventListener("abort", () => reject(new Error("aborted")));
			});
		}
		return { kind: "fields", fields: [] };
	},
};
`;

let counter = 0;
/** Build a throwaway tool directory. Returns the *parent*, which is what the harness is pointed at. */
function fixture(dirName: string, manifest: unknown, cases?: unknown, impl?: string): string {
	const parent = join(base, `t${counter++}`);
	const root = join(parent, dirName);
	mkdirSync(root, { recursive: true });
	writeFileSync(join(root, "tool.json"), JSON.stringify(manifest));
	if (cases !== undefined) writeFileSync(join(root, "cases.json"), JSON.stringify(cases));
	if (impl !== undefined) writeFileSync(join(root, "index.ts"), impl);
	return parent;
}

/**
 * Run one of the tests `checkToolDirectory` registers, by name.
 *
 * The per-tool checks exist only as registered tests, so reaching one means standing in for the test
 * runner. That the runner is injected is what makes this possible at all.
 */
async function registeredTest(parent: string, name: string, timeoutMs?: number): Promise<void> {
	const registered = new Map<string, () => void | Promise<void>>();
	checkToolDirectory(parent, {
		describe: (_name, body) => body(),
		it: (testName, fn) => registered.set(testName, fn),
		...(timeoutMs !== undefined ? { timeoutMs } : {}),
	});
	const fn = registered.get(name);
	assert.ok(fn, `no test named "${name}" is registered. Registered: ${[...registered.keys()].join(", ")}`);
	await fn();
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

describe("checkToolDirectory runs the samples a tool declares", () => {
	it("accepts a sample the tool answers with an error output", async () => {
		/*
		 * An error output is a pass. The malformed example is the most useful one a tool can ship, so
		 * failing here would push authors into shipping only examples that work, which is the opposite of
		 * what a reader needs to see.
		 */
		const manifest = { ...GOOD_MANIFEST, samples: [{ label: "Malformed input", input: { a: "bad" } }] };
		await registeredTest(fixture("ok", manifest, GOOD_CASES, IMPL), "ships samples that run");
	});

	it("rejects a sample that makes the tool throw, naming the label", async () => {
		// The throw is what is under test: a sample is the first thing a reader clicks, and until this
		// check existed a crashing example was invisible until someone clicked it.
		const manifest = { ...GOOD_MANIFEST, samples: [{ label: "Boom", input: { a: "boom" } }] };
		const parent = fixture("ok", manifest, GOOD_CASES, IMPL);
		await assert.rejects(registeredTest(parent, "ships samples that run"), (error: unknown) => {
			assert.ok(error instanceof ToolDirectoryError, `expected ToolDirectoryError, got ${String(error)}`);
			// The label, or an author with six sample buttons has to guess which one is broken.
			assert.match(error.message, /sample "Boom" threw/);
			assert.ok(error.toolId, "every per-tool failure must carry its tool id");
			return true;
		});
	});

	it("reports a sample that overruns the timeout as slow, not as a crash", async () => {
		// A tool that stops when it is told to has not crashed, and saying it threw would send its author
		// looking for a bug in code that behaved correctly.
		const manifest = { ...GOOD_MANIFEST, samples: [{ label: "Slow", input: { a: "slow" } }] };
		const parent = fixture("ok", manifest, GOOD_CASES, IMPL);
		await assert.rejects(registeredTest(parent, "ships samples that run", 20), (error: unknown) => {
			assert.ok(error instanceof ToolDirectoryError, `expected ToolDirectoryError, got ${String(error)}`);
			assert.match(error.message, /sample "Slow" did not finish within 20ms/);
			return true;
		});
	});
});
