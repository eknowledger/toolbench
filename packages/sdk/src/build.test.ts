import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VALIDATED_KEY } from "./brand.ts";
import { checkManifestText, manifestModule } from "./build.ts";

const raw = {
	sdk: 9,
	id: "notes",
	name: "Notes",
	blurb: "Takes some text.",
	version: "1.0.0",
	capabilities: ["pure"],
	runtime: { entry: "index.ts" },
	inputs: [{ id: "body", type: "textarea", label: "Body", default: "" }],
	kinds: ["fields", "error"],
};
const evaluate = async (code: string) => (await import(`data:text/javascript,${encodeURIComponent(code)}`)).default as Record<PropertyKey, unknown>;

describe("a manifest checked at build time (#259)", () => {
	it("names the file and keeps the validator's whole message", () => {
		assert.throws(() => checkManifestText(JSON.stringify({ ...raw, blurb: "" }), "tools/notes/tool.json"), {
			name: "ManifestFileError",
			message: "tools/notes/tool.json: not a valid tool manifest. blurb: must be a non-empty string",
		});
		assert.throws(() => checkManifestText("{ not json", "tools/notes/tool.json"), { name: "ManifestFileError", message: /^tools\/notes\/tool\.json: not a valid tool manifest\. / });
	});

	it("reads a file that starts with a byte-order mark", () => {
		assert.equal(checkManifestText(`\uFEFF${JSON.stringify(raw)}`, "tool.json").id, "notes");
	});

	it("emits a module whose default export equals the validated manifest, frozen at every level and marked", async () => {
		const checked = checkManifestText(JSON.stringify(raw), "tool.json");
		const manifest = await evaluate(manifestModule(checked));
		assert.deepEqual({ ...manifest }, checked);
		assert.equal(manifest[Symbol.for(VALIDATED_KEY)], true);
		const walk = (v: unknown): void => {
			if (v === null || typeof v !== "object") return;
			assert.ok(Object.isFrozen(v), JSON.stringify(v));
			Object.values(v).forEach(walk);
		};
		walk(manifest);
	});

	// ⚠️ A quoted "__proto__" in an object literal sets the prototype; JSON.parse made it an own key.
	it("keeps a __proto__ key in a value as data, not as a prototype", async () => {
		// A sample's value is free-form JSON, so this is the shape that reaches the emitter.
		const value = JSON.parse('{"__proto__":{"polluted":true}}');
		const manifest = await evaluate(manifestModule({ ...checkManifestText(JSON.stringify(raw), "tool.json"), extra: value } as never));
		const data = manifest.extra as object;
		assert.equal(Object.getPrototypeOf(data), Object.prototype);
		assert.ok(Object.hasOwn(data, "__proto__"));
		assert.equal((data as { polluted?: unknown }).polluted, undefined);
	});
});
