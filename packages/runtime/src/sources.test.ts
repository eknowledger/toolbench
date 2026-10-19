import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RegistrySource } from "./sources.ts";

/*
 * The runtime's half of #170. A registry is where a host's manifests are first read, and the one place
 * the declared `sdk` is still there to compare against: past `upgradeManifest` it says the current version.
 */
const manifest = (sdk: number, input: Record<string, unknown>) => ({
	sdk,
	id: "notes",
	name: "Notes",
	blurb: "Takes some text.",
	version: "1.0.0",
	capabilities: ["pure"],
	runtime: { entry: "index.ts" },
	inputs: [{ id: "body", type: "textarea", label: "Body", default: "", ...input }],
	kinds: ["fields", "error"],
});
const load = async () => ({ default: { run: () => ({ kind: "fields" as const, fields: [] }) } });

describe("a registry refuses a manifest that under-declares its sdk (#170)", () => {
	it("names the field, the version that added it and the sdk to declare", () => {
		assert.throws(() => new RegistrySource({ notes: { manifest: manifest(4, { lang: "json" }), load } }), {
			name: "ManifestError",
			message: 'inputs[0].lang: is from contract version 6, but the tool declares "sdk": 4. Declare "sdk": 6.',
		});
	});

	it("accepts the same manifest declaring the version it needs", async () => {
		const source = new RegistrySource({ notes: { manifest: manifest(6, { lang: "json" }), load } });
		assert.equal((await source.list())[0]?.id, "notes");
	});
});
