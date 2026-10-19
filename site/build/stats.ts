/**
 * The figures on the landing page, each read at build time from the file that owns it, so none can be
 * right on the day it is written and wrong a release later.
 *
 * Imported by the build and by site.test.ts, which checks every tile on the built page against these.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const TYPES = "packages/sdk/src/types.ts";

export type Stat = { id: string; value: string; label: string };

/** The string members of an array exported as a literal from the SDK, read as text so no build is needed. */
function members(name: string): string[] {
	const m = new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`).exec(read(TYPES));
	return m?.[1] ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1] ?? "") : [];
}

/** Result kinds that are not charts. Every other kind in OUTPUT_KINDS is a chart of its own. */
const NOT_CHARTS = new Set(["fields", "text", "code", "table", "series", "group", "error", "bytes", "graph"]);

export function chartTypes(): string[] {
	// A series chart draws in any of its shapes, and each of the other chart kinds is one more type.
	const shapes = /shape\?:\s*((?:"[a-z]+"\s*\|?\s*)+);/.exec(read(TYPES))?.[1]?.match(/"([a-z]+)"/g)?.map((s) => s.slice(1, -1));
	if (!shapes?.length) throw new Error(`${TYPES} has no series shape union`);
	return [...shapes, ...members("OUTPUT_KINDS").filter((k) => !NOT_CHARTS.has(k))];
}

/** The engines build.yml runs the browser suite in, as the browsers a reader knows them by. */
export function browsers(): string[] {
	const names: Record<string, string> = { chromium: "Chrome", firefox: "Firefox", webkit: "Safari" };
	const matrix = /browser:\s*\[([^\]]+)\]/.exec(read(".github/workflows/build.yml"))?.[1]?.split(",").map((s) => s.trim());
	if (!matrix?.length) throw new Error(".github/workflows/build.yml has no browser matrix");
	return matrix.map((e) => names[e] ?? e);
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

	const out: Stat[] = [
		{ id: "runtime", value: `${runtimeKb} KB`, label: "runtime, gzipped" },
		{ id: "dependencies", value: String(external.length), label: external.length === 1 ? "dependency" : "dependencies" },
		{ id: "contract", value: `v${contract}`, label: "contract, and every older one still runs" },
		{ id: "charts", value: String(chartTypes().length), label: "chart types" },
		{ id: "kinds", value: String(members("OUTPUT_KINDS").length), label: "result kinds" },
		{ id: "inputs", value: String(members("INPUT_TYPES").length), label: "input types" },
	];
	/*
	 * The graph layouts tile, waiting for the graph result kind. It appears once the SDK exports a
	 * GRAPH_LAYOUTS list, with no change here; until then there is nothing true to show.
	 */
	const layouts = members("GRAPH_LAYOUTS");
	if (layouts.length) out.push({ id: "layouts", value: String(layouts.length), label: "graph layouts" });
	return out;
}
