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
	it("names the field, the version that added it and the sdk to declare", async () => {
		const source = new RegistrySource({ notes: { manifest: manifest(4, { lang: "json" }), load } });
		await assert.rejects(source.list(), {
			name: "ManifestError",
			message: 'inputs[0].lang: is from contract version 6, but the tool declares "sdk": 4. Declare "sdk": 6.',
		});
	});

	it("accepts the same manifest declaring the version it needs", async () => {
		const source = new RegistrySource({ notes: { manifest: manifest(6, { lang: "json" }), load } });
		assert.equal((await source.list())[0]?.id, "notes");
	});
});

/*
 * Validation is a chunk of its own, fetched by the first `list()` or `load()`, so the constructor cannot
 * throw: a bad manifest rejects those calls instead, with the message the constructor used to throw.
 */
describe("a registry validates on first use, not on construction", () => {
	it("constructs from a malformed manifest, and list() rejects naming the field", async () => {
		const source = new RegistrySource({ notes: { manifest: { ...manifest(9, {}), blurb: "" }, load } });
		await assert.rejects(source.list(), { name: "ManifestError", message: "blurb: must be a non-empty string" });
	});

	it("rejects load() with the same error, so no path hands out an unvalidated manifest", async () => {
		const source = new RegistrySource({ notes: { manifest: { ...manifest(9, {}), links: [{ label: "x", href: "javascript:alert(1)" }] }, load } });
		await assert.rejects(source.load("notes"), { name: "ManifestError", message: /^links\[0\]\.href: / });
	});

	it("refuses two tools with one id when listed", async () => {
		const entry = { manifest: manifest(9, {}), load };
		const source = new RegistrySource([entry, entry]);
		await assert.rejects(source.list(), { message: 'Two tools declare the id "notes". Ids must be unique within a source.' });
	});

	it("answers manifest(id) once list() has resolved, and not before", async () => {
		const source = new RegistrySource({ notes: { manifest: manifest(9, {}), load } });
		assert.equal(source.manifest("notes"), undefined);
		await source.list();
		assert.equal(source.manifest("notes")?.name, "Notes");
	});

	it("validates once however many calls follow", async () => {
		let reads = 0;
		const counted = new Proxy(manifest(9, {}), {
			ownKeys(target) {
				reads++;
				return Reflect.ownKeys(target);
			},
		});
		const source = new RegistrySource({ notes: { manifest: counted, load } });
		await Promise.all([source.list(), source.list()]);
		const once = reads;
		assert.ok(once > 0, "the first list() read the manifest");
		await source.list();
		await source.load("notes");
		assert.equal(reads, once);
	});
});
