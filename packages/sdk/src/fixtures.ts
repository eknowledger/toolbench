/**
 * Read and check a directory of tools.
 *
 * ⚠️ **This module is Node-only and is deliberately NOT in the package's main entry point.** It imports
 * `node:fs`, and the main entry touches no I/O at all: `@toolbench/runtime` depends on this package and
 * runs in a browser, so pulling `node:fs` into the main entry would break any bundler that follows it.
 * Hence the `@toolbench/sdk/fixtures` subpath.
 *
 * What lives here is the mechanism behind the compatibility promise in `docs/versioning.md`. It walks a
 * directory so a new tool is covered the moment it exists, with nobody having to remember to add a test,
 * and it enforces three things a tool cannot enforce about itself:
 *
 *  - the manifest is valid and its declared `sdk` is one this SDK can read;
 *  - `cases.json` exists and is not empty, because a tool with no fixtures is a tool nobody can refactor;
 *  - every case's `expect.kind` is declared in `kinds`, so `kinds` cannot drift into fiction.
 *
 * It was extracted because a host authoring its own tools would otherwise copy forty lines to get
 * guarantees this package already knows how to provide, and those copies then drift apart.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCases } from "./testing.ts";
import type { Case, Manifest, Tool } from "./types.ts";
import { upgradeManifest } from "./migrate.ts";
import { validateManifest } from "./validate.ts";

/** One tool as it exists on disk, validated. */
export interface ToolOnDisk {
	/** The directory name, which must equal `manifest.id`. */
	id: string;
	/** Absolute path to the tool's directory. */
	root: string;
	/** Absolute path to the entry module, ready to `import()`. */
	entry: string;
	manifest: Manifest;
	cases: Case[];
}

export class ToolDirectoryError extends Error {
	readonly toolId: string | undefined;
	constructor(message: string, toolId?: string) {
		super(toolId ? `${toolId}: ${message}` : message);
		this.name = "ToolDirectoryError";
		this.toolId = toolId;
	}
}

function toPath(dir: string | URL): string {
	return typeof dir === "string" ? dir : fileURLToPath(dir);
}

/**
 * Read every tool in a directory, validating each one. Throws `ToolDirectoryError` on the first problem.
 *
 * Useful beyond tests: a host generating a registry, or precomputing seeds, needs exactly this list, and
 * gets the same validation the test suite applies rather than a second, weaker version of it.
 *
 * A subdirectory without a `tool.json` is skipped rather than failing, so a directory can hold shared
 * helpers or fixtures alongside its tools.
 */
export function scanToolDirectory(dir: string | URL): { id: string; root: string }[] {
	const base = toPath(dir);
	if (!existsSync(base)) throw new ToolDirectoryError(`no such directory: ${base}`);
	return readdirSync(base, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(base, entry.name, "tool.json")))
		.map((entry) => ({ id: entry.name, root: join(base, entry.name) }))
		.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Validate one tool on disk. Throws `ToolDirectoryError` naming the tool and the rule it broke.
 *
 * Separate from the walk so a test runner can call it per tool and report a named failure, rather than
 * one broken tool taking down the whole suite before any test has run.
 */
export function readTool(id: string, root: string): ToolOnDisk {
	{
		let manifest: Manifest;
		try {
			manifest = validateManifest(upgradeManifest(JSON.parse(readFileSync(join(root, "tool.json"), "utf8"))));
		} catch (error) {
			throw new ToolDirectoryError(error instanceof Error ? error.message : String(error), id);
		}
		/*
		 * The id is a directory name, a URL segment and a registry key. If it disagrees with the folder,
		 * every link derived from it points somewhere else, and nothing else would notice.
		 */
		if (manifest.id !== id) {
			throw new ToolDirectoryError(`manifest id is "${manifest.id}" but the directory is "${id}"`, id);
		}

		const casesPath = join(root, "cases.json");
		if (!existsSync(casesPath)) throw new ToolDirectoryError("cases.json is missing", id);
		let cases: Case[];
		try {
			cases = JSON.parse(readFileSync(casesPath, "utf8")) as Case[];
		} catch (error) {
			throw new ToolDirectoryError(`cases.json is not valid JSON: ${String(error)}`, id);
		}
		if (!Array.isArray(cases) || cases.length === 0) {
			throw new ToolDirectoryError("cases.json is empty; a tool with no fixtures is a tool nobody can refactor", id);
		}
		for (const testCase of cases) {
			if (!manifest.kinds.includes(testCase.expect.kind)) {
				throw new ToolDirectoryError(
					`case "${testCase.name}" expects a "${testCase.expect.kind}" output, which the manifest does not declare in kinds`,
					id,
				);
			}
		}

		return { id, root, entry: join(root, manifest.runtime.entry), manifest, cases };
	}
}

/**
 * Read and validate every tool in a directory. Throws on the first problem.
 *
 * For build-time use: generating a registry, or precomputing seeds, needs exactly this list, and gets the
 * same validation the test suite applies rather than a second, weaker version of it. Tests should prefer
 * `checkToolDirectory`, which reports per tool.
 */
export function readToolDirectory(dir: string | URL): ToolOnDisk[] {
	return scanToolDirectory(dir).map(({ id, root }) => readTool(id, root));
}

export interface CheckToolDirectoryOptions {
	/**
	 * The test runner's `describe` and `it`.
	 *
	 * ⚠️ Passed in rather than imported, so this package keeps its zero dependencies and works under
	 * `node:test`, Vitest or anything else with the same shape. Importing a runner here would put one in
	 * the dependency tree of every consumer.
	 */
	describe: (name: string, fn: () => void) => void;
	it: (name: string, fn: () => void | Promise<void>) => void;
	/**
	 * Per-case wall-clock bound for **main-thread** tools only. Default 50.
	 *
	 * A main-thread tool has nothing to interrupt it: if a fixture takes 200 ms, a reader's browser takes
	 * 200 ms too, and the tool belongs in a worker. Worker-mode tools are exempt because being slow is
	 * why they declared a worker.
	 */
	maxMs?: number;
	/** Overall per-case timeout. Default 5000. */
	timeoutMs?: number;
	/** Prefix for the suite names. Default "tools". */
	label?: string;
}

/**
 * Register a test suite per tool in a directory: manifest validity, fixture integrity, and every case.
 *
 *   import { describe, it } from "node:test";
 *   import { checkToolDirectory } from "@toolbench/sdk/fixtures";
 *
 *   checkToolDirectory(new URL("../src/tools/", import.meta.url), { describe, it });
 *
 * Every tool's cases run against the **current** SDK, which is what makes "old tools keep working" a
 * tested claim rather than an intention. Wire it into CI and a change that breaks a tool written against
 * an older contract version fails the build.
 */
export function checkToolDirectory(dir: string | URL, options: CheckToolDirectoryOptions): void {
	const { describe, it, label = "tools", maxMs = 50, timeoutMs = 5000 } = options;
	const found = scanToolDirectory(dir);

	describe(label, () => {
		it("finds at least one tool", () => {
			if (found.length === 0) {
				throw new ToolDirectoryError(
					`no tools found in ${toPath(dir)}. This suite only means something if it finds them, so an empty directory is a failure rather than a pass.`,
				);
			}
		});
	});

	for (const { id, root } of found) {
		describe(`${label}/${id}`, () => {
			/*
			 * ⚠️ Three named tests rather than one, and validation happens INSIDE them.
			 *
			 * Reading the whole directory eagerly was the first version. It failed fast, but a bad manifest
			 * then crashed the file before any test ran, so the report said nothing about which tool or
			 * which rule. A named failure per guarantee is what makes the output diagnostic.
			 */
			let tool: ToolOnDisk;

			it("has a manifest this contract version can read", () => {
				tool = readTool(id, root);
			});

			it("declares fixtures that match what it says it returns", () => {
				// readTool enforces this; calling it again is cheap and keeps the tests independent, so a
				// failure here is not a knock-on from the test above.
				tool ??= readTool(id, root);
				if (tool.cases.length === 0) throw new ToolDirectoryError("cases.json is empty", id);
			});

			it("passes its own fixtures", async () => {
				tool ??= readTool(id, root);
				const module = (await import(tool.entry)) as { default?: Tool };
				const impl = module.default;
				if (typeof impl?.run !== "function") {
					throw new ToolDirectoryError(
						"does not default-export a tool. A tool module looks like: export default { run(input, ctx) { … } }",
						id,
					);
				}
				await assertCases(impl, tool.cases, {
					timeoutMs,
					...(tool.manifest.runtime.thread === "main" ? { maxMs } : {}),
				});
			});
		});
	}
}
