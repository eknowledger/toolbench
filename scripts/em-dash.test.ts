/**
 * No em dash reaches a reader from the packages or a tool's manifest (#42).
 *
 * The working agreement's rule was read as covering prose only, so the runtime's status line joined
 * "inputs changed" to "press Run" with one, the bytes legend joined a label to its size with one, and two
 * tools' blurbs, which are also their card line and page description, had one each. The maintainer ruled the
 * rule absolute. A sweep fixes today's strings and nothing stops tomorrow's, so this test does.
 *
 * Comments are stripped first: they are not shipped copy, and the minifier removes them. What is left is
 * code, and in code an em dash can only be inside a string a reader or a tool author sees.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..");

function files(dir: string, keep: (name: string) => boolean): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === "node_modules" || name === "dist" ? [] : files(path, keep);
		return keep(name) ? [path] : [];
	});
}

/** Block comments, then line comments that start a line or follow code after whitespace. Not a parser, and it does not need to be. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

/** Every line holding an em dash, as "file:line: text". */
function offenders(paths: string[], strip: (source: string) => string): string[] {
	return paths.flatMap((path) =>
		strip(readFileSync(path, "utf8"))
			.split("\n")
			.flatMap((line, i) => (line.includes("\u2014") ? [`${relative(ROOT, path)}:${i + 1}: ${line.trim()}`] : [])),
	);
}

describe("no em dash in shipped copy (#42)", () => {
	it("is in no string in packages/*/src", () => {
		const sources = ["sdk", "runtime"].flatMap((pkg) => files(join(ROOT, "packages", pkg, "src"), (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")));
		assert.ok(sources.length > 10, `expected the packages' sources, found ${sources.length}`);
		assert.deepEqual(offenders(sources, code), []);
	});

	it("is in no string a tool returns, which is its output and its error messages", () => {
		const sources = files(join(ROOT, "tools"), (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
		assert.ok(sources.length >= 5, `expected every tool's code, found ${sources.length}`);
		assert.deepEqual(offenders(sources, code), []);
	});

	it("is in no tool's manifest, whose blurb is its card line and its page description", () => {
		const manifests = readdirSync(join(ROOT, "tools"))
			.map((id) => join(ROOT, "tools", id, "tool.json"))
			.filter((path) => {
				try {
					return statSync(path).isFile();
				} catch {
					return false;
				}
			});
		assert.ok(manifests.length >= 5, `expected every tool's manifest, found ${manifests.length}`);
		assert.deepEqual(offenders(manifests, (s) => s), []);
	});
});
