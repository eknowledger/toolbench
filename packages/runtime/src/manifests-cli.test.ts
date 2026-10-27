import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { RegistrySource } from "./sources.ts";

/*
 * `toolbench-manifests`, run as a host without a Vite plugin would run it, and its output imported by plain Node
 * ES modules, the bundler-free case: if Node can import it with nothing else, any bundler can. The command is
 * the built bin, which the `tsc -b` in `pnpm check` emits before the tests run.
 */
const BIN = resolve(import.meta.dirname, "..", "..", "sdk", "dist", "bin.js");
const root = mkdtempSync(join(tmpdir(), "toolbench-manifests-"));
after(() => rmSync(root, { recursive: true, force: true }));

const manifest = (id: string, extra: Record<string, unknown> = {}) => ({
	sdk: 9,
	id,
	name: "Notes",
	blurb: "Takes some text.",
	version: "1.0.0",
	capabilities: ["pure"],
	runtime: { entry: "index.js" },
	inputs: [{ id: "body", type: "textarea", label: "Body", default: "" }],
	kinds: ["fields", "error"],
	...extra,
});

function tool(dir: string, body: object): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "tool.json"), JSON.stringify(body, null, 2));
	writeFileSync(join(dir, "index.js"), 'export default { run: ({ body }) => ({ kind: "fields", fields: [{ label: "length", value: String(body.length) }] }) };\n');
}

const cli = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8" });

describe("toolbench-manifests (#259)", () => {
	it("writes a frozen, marked module per manifest and a registry that RegistrySource uses without validating", async () => {
		const site = join(root, "good");
		tool(join(site, "tools", "notes"), manifest("notes"));
		tool(join(site, "tools", "more", "counter"), manifest("counter"));
		const result = cli(site, "tools", "--out", "generated");
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout.trim(), "2 manifests checked, written to generated.");

		const { registry } = await import(pathToFileURL(join(site, "generated", "index.js")).href);
		assert.deepEqual(Object.keys(registry).sort(), ["counter", "notes"]);
		const source = new RegistrySource(registry);
		// Answered from the constructor: only a source whose every manifest is marked and frozen is ready there.
		assert.equal(source.manifest("notes")?.card, "info");
		assert.ok(Object.isFrozen(source.manifest("notes")?.inputs[0]));
		const loaded = await source.load("counter");
		assert.deepEqual(await loaded.tool.run({ body: "abc" }, {} as never), { kind: "fields", fields: [{ label: "length", value: "3" }] });
	});

	it("exits 1 naming the file, with the validator's whole message, and writes nothing", () => {
		const site = join(root, "bad");
		tool(join(site, "tools", "notes"), manifest("notes", { links: [{ label: "Run", href: "javascript:alert(1)" }] }));
		const result = cli(site, "tools", "--out", "generated");
		assert.equal(result.status, 1);
		assert.equal(
			result.stderr.trim(),
			`${join("tools", "notes", "tool.json")}: not a valid tool manifest. links[0].href: must be an http, https or mailto URL, or a relative path, with no spaces or control characters`,
		);
		assert.equal(existsSync(join(site, "generated")), false, "no output directory");
	});

	it("refuses two files declaring one id, naming both", () => {
		const site = join(root, "twice");
		tool(join(site, "a"), manifest("notes"));
		tool(join(site, "b"), manifest("notes"));
		const result = cli(site, "a", "b", "--out", "generated");
		assert.equal(result.status, 1);
		assert.equal(result.stderr.trim(), `${join("b", "tool.json")}: declares the id "notes", as ${join("a", "tool.json")} does. Ids must be unique within a source.`);
	});

	it("exits 2 with its usage when --out is missing", () => {
		const result = cli(root, "tools");
		assert.equal(result.status, 2);
		assert.equal(result.stderr.trim(), "Usage: toolbench-manifests <dir|tool.json>... --out <dir>");
	});
});
