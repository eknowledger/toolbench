/**
 * The figures the landing page shows off, each read from the file that owns it at build time. None is
 * typed into the page, so none can be right on the day it is written and wrong a release later.
 *
 * Imported by the build and by site.test.ts, which checks every tile on the built page against these.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

export type Stat = { id: string; value: string; label: string; source: string };

/** A number exported as a literal from the SDK's source, read as text so the build needs no compiled SDK. */
function arrayLength(file: string, name: string): number {
	const m = new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`).exec(read(file));
	if (!m?.[1]) throw new Error(`${file} has no array ${name}`);
	return [...m[1].matchAll(/"[^"]+"/g)].length;
}

export function stats(): Stat[] {
	const runtimeKb = /\| Runtime[^|]*\| ([\d.]+) KB/.exec(read("README.md"))?.[1];
	if (!runtimeKb) throw new Error("README.md has no runtime size row");

	const external = ["sdk", "runtime"].flatMap((p) => {
		const pkg = JSON.parse(read(`packages/${p}/package.json`)) as Record<string, Record<string, string> | undefined>;
		return Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).filter((d) => !d.startsWith("@toolbench/"));
	});

	const contract = /export const SDK_VERSION = (\d+)/.exec(read("packages/sdk/src/version.ts"))?.[1];
	if (!contract) throw new Error("packages/sdk/src/version.ts has no SDK_VERSION");

	const engines = /browser:\s*\[([^\]]+)\]/.exec(read(".github/workflows/build.yml"))?.[1]?.split(",").map((s) => s.trim()).filter(Boolean);
	if (!engines?.length) throw new Error(".github/workflows/build.yml has no browser matrix");

	// The Count column of the testing table in docs/architecture.md §12, which `pnpm test:counts --update` owns.
	const arch = read("docs/architecture.md");
	const table = /\| Layer \| Where it runs \| What it covers \| Count \|\n\|[-|]+\|\n((?:\|.*\|\n)+)/.exec(arch)?.[1];
	if (!table) throw new Error("docs/architecture.md has no testing table with a Count column");
	const tests = table
		.trim()
		.split("\n")
		.map((row) => Number(/\|\s*(\d+)\s*\|\s*$/.exec(row)?.[1] ?? Number.NaN));
	if (tests.some(Number.isNaN)) throw new Error("a row of the testing table has no count");

	const tools = readdirSync(join(ROOT, "tools"), { withFileTypes: true }).filter((d) => d.isDirectory()).length;

	return [
		{ id: "runtime", value: `${runtimeKb} KB`, label: "runtime, gzipped", source: "README.md, written by scripts/size-check.mjs" },
		{ id: "dependencies", value: String(external.length), label: external.length === 1 ? "dependency" : "dependencies", source: "packages/*/package.json" },
		{ id: "contract", value: `v${contract}`, label: "contract, every older version still runs", source: "packages/sdk/src/version.ts" },
		{ id: "kinds", value: String(arrayLength("packages/sdk/src/types.ts", "OUTPUT_KINDS")), label: "result kinds", source: "OUTPUT_KINDS" },
		{ id: "inputs", value: String(arrayLength("packages/sdk/src/types.ts", "INPUT_TYPES")), label: "input types", source: "INPUT_TYPES" },
		{ id: "engines", value: String(engines.length), label: "browser engines tested", source: ".github/workflows/build.yml" },
		{ id: "tests", value: String(tests.reduce((a, b) => a + b, 0)), label: "tests", source: "docs/architecture.md, written by scripts/test-counts.mjs" },
		{ id: "tools", value: String(tools), label: "example tools", source: "tools/" },
	];
}
