/**
 * The measurement script has to keep constructing a real RegistrySource from a clean
 * checkout. These tests pin that, not a wall-clock budget: a millisecond gate would
 * fail on a busy runner for reasons that have nothing to do with the constructor.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { upgradeManifest } from "../packages/sdk/src/upgrade.ts";
import { validateManifest } from "../packages/sdk/src/validate.ts";
import { SDK_VERSION } from "../packages/sdk/src/version.ts";
import {
	COUNT,
	loadRegistrySource,
	syntheticEntries,
	syntheticManifest,
	timeValidation,
} from "./measure-registry-source.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));

describe("syntheticManifest", () => {
	it("is a current-contract manifest the constructor would accept", () => {
		const raw = syntheticManifest(7);
		assert.equal(raw.sdk, SDK_VERSION);
		assert.equal(raw.id, "synth-0007");
		const manifest = validateManifest(upgradeManifest(raw));
		assert.equal(manifest.id, "synth-0007");
		assert.equal(manifest.inputs.length, 2);
	});
});

describe("syntheticEntries", () => {
	it(`builds ${COUNT} unique ids, the count issue #17 asked for`, () => {
		const entries = syntheticEntries(COUNT);
		assert.equal(entries.length, COUNT);
		const ids = entries.map((entry) => (entry.manifest as { id: string }).id);
		assert.equal(new Set(ids).size, COUNT);
		assert.equal(ids[0], "synth-0000");
		assert.equal(ids[COUNT - 1], "synth-0499");
	});
});

describe("RegistrySource construction and first list()", () => {
	it(`accepts ${COUNT} synthetic tools and keeps every id`, async () => {
		const RegistrySource = await loadRegistrySource();
		const entries = syntheticEntries(COUNT);
		const source = new RegistrySource(entries);
		const listed = await source.list();
		assert.equal(listed.length, COUNT);
		assert.equal(source.manifest("synth-0000")?.id, "synth-0000");
		assert.equal(source.manifest("synth-0499")?.id, "synth-0499");
	});

	it("refuses two tools that claim the same id, so this is the real source", async () => {
		const RegistrySource = await loadRegistrySource();
		const [entry] = syntheticEntries(1);
		await assert.rejects(new RegistrySource([entry, entry]).list(), /unique/);
	});

	it("returns a finite median without treating the validation as dead code", async () => {
		const RegistrySource = await loadRegistrySource();
		const result = await timeValidation(RegistrySource, syntheticEntries(COUNT), {
			warmup: 1,
			iterations: 3,
		});
		assert.equal(result.count, COUNT);
		assert.ok(Number.isFinite(result.median), `median should be finite, got ${result.median}`);
		assert.ok(result.min > 0, `min should be above 0, got ${result.min}`);
		assert.ok(result.max >= result.median && result.median >= result.min);
	});
});

describe("the script as a process", () => {
	it("prints usage to stdout and exits 0 when help is asked for", () => {
		const script = join(here, "measure-registry-source.mjs");
		const result = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /pnpm measure:registry/);
		assert.equal(result.stderr, "", "asking for help is not an error");
	});

	it(`prints a measured median for ${COUNT} tools`, () => {
		const script = join(here, "measure-registry-source.mjs");
		const result = spawnSync(process.execPath, [script, "--warmup", "1", "--iterations", "3"], {
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, new RegExp(`${COUNT} synthetic manifests`));
		assert.match(result.stdout, /median\s+\d+\.\d{2} ms/);
		assert.match(result.stdout, /Node v\d+/);
	});
});
