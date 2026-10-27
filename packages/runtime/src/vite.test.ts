import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RegistrySource, VALIDATED } from "./sources.ts";
import { toolbench } from "./vite.ts";

/*
 * The build plugin, driven the way Vite drives it: the pre plugin sees the raw text, the plugin after Vite's
 * JSON plugin sees Vite's module and replaces it. The expected messages are the validator's, written out from
 * validate.ts by hand, not captured from a run.
 */
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
const BAD_LINK = "links[0].href: must be an http, https or mailto URL, or a relative path, with no spaces or control characters";
const load = async () => ({ default: { run: () => ({ kind: "fields" as const, fields: [] }) } });
const ctx = { error: (message: string): never => { throw new Error(message); } };

function build(text: string, id = "/site/tools/notes/tool.json"): string | undefined {
	const [check, mark] = toolbench();
	assert.ok(check?.transform && mark?.transform);
	assert.equal(check.transform.call(ctx, text, id), null);
	return mark.transform.call(ctx, "export default {}", id)?.code;
}

/** The module the plugin emitted, evaluated, as the bundle would. */
async function evaluate(code: string): Promise<Record<PropertyKey, unknown>> {
	return (await import(`data:text/javascript,${encodeURIComponent(code)}`)).default;
}
const marked = async () => evaluate(build(JSON.stringify(raw)) ?? "");

describe("the build plugin validates every tool.json (#259)", () => {
	it("replaces the module with the upgraded, validated manifest, marked", async () => {
		const manifest = await marked();
		// Filled in by validation, so the browser gets what validateManifest would have returned.
		assert.equal(manifest.card, "info");
		assert.equal(manifest.status, "live");
		assert.deepEqual(manifest.runtime, { entry: "index.ts", thread: "main" });
		assert.equal(manifest[VALIDATED], true);
	});

	it("marks non-enumerably, so a spread copy with a field changed is unmarked", async () => {
		assert.equal(Object.getOwnPropertySymbols({ ...(await marked()) }).length, 0);
	});

	// Page code could otherwise change a marked manifest after the build, and the mark would vouch for the change.
	it("freezes the manifest all the way down, so a marked one cannot be changed", async () => {
		const manifest = (await marked()) as unknown as { blurb: string; inputs: { label: string }[]; runtime: { entry: string } };
		assert.throws(() => { manifest.blurb = "changed"; }, TypeError);
		assert.throws(() => { (manifest.inputs[0] as { label: string }).label = "changed"; }, TypeError);
		assert.throws(() => { manifest.inputs.push({ label: "more" }); }, TypeError);
		assert.throws(() => { manifest.runtime.entry = "elsewhere.ts"; }, TypeError);
		assert.throws(() => { delete (manifest as Partial<typeof manifest>).blurb; }, TypeError);
		assert.throws(() => Object.defineProperty(manifest, VALIDATED, { value: false }), TypeError);
	});

	// The file is named by Vite beside the message, in the terminal and the overlay, so not in it as well.
	it("fails the build with the validator's whole message", () => {
		const bad = JSON.stringify({ ...raw, links: [{ label: "Run", href: "javascript:alert(1)" }] });
		assert.throws(() => build(bad, "/site/tools/bad/tool.json"), { message: `Not a valid tool manifest. ${BAD_LINK}` });
	});

	it("leaves every other module alone", () => {
		assert.equal(build(JSON.stringify(raw), "/site/package.json"), undefined);
	});

	it("gives another plugin the same check through its api, done once per text", () => {
		const [check] = toolbench();
		const text = JSON.stringify(raw);
		const first = check?.api?.check("/site/tools/notes/tool.json", text);
		assert.equal(first?.id, "notes");
		assert.equal(check?.api?.check("/site/tools/notes/tool.json", text), first);
		assert.throws(() => check?.api?.check("/site/tools/notes/tool.json", "{}"), { name: "ManifestFileError", message: /^\/site\/tools\/notes\/tool\.json: not a valid tool manifest\. / });
	});

	// And what it imports: a modulepreload fetches one module, so the checks chunk would otherwise cost the round trip.
	it("adds a modulepreload for the validation chunk and the chunks it imports, only when asked", () => {
		const bundle = {
			"assets/boot-a.js": { type: "chunk", fileName: "assets/boot-a.js", moduleIds: ["/x/packages/runtime/dist/sources.js"], imports: [] },
			"assets/checks-c.js": { type: "chunk", fileName: "assets/checks-c.js", moduleIds: ["/x/packages/sdk/dist/inputs.js"], imports: [] },
			"assets/validation-b.js": {
				type: "chunk",
				fileName: "assets/validation-b.js",
				moduleIds: ["/x/node_modules/@toolbench/runtime/dist/validation.js"],
				imports: ["assets/boot-a.js", "assets/checks-c.js"],
			},
		};
		assert.equal(toolbench().length, 2);
		const preload = toolbench({ preloadValidation: true })[2];
		preload?.configResolved?.({ base: "/docs/" });
		const link = (file: string) => ({ tag: "link", attrs: { rel: "modulepreload", crossorigin: "", href: `/docs/${file}` }, injectTo: "head" });
		// The page's own script is the runtime chunk, so that one is not named twice.
		const html = '<script type="module" src="/docs/assets/boot-a.js"></script>';
		assert.deepEqual(preload?.transformIndexHtml?.handler(html, { bundle }), [link("assets/validation-b.js"), link("assets/checks-c.js")]);
		assert.equal(preload?.transformIndexHtml?.handler("", {}), undefined, "nothing in development, which has no chunks");
	});
});

describe("a registry of marked manifests", () => {
	it("is ready in the constructor, so manifest(id) answers before list()", async () => {
		const source = new RegistrySource({ notes: { manifest: await marked(), load } });
		assert.equal(source.manifest("notes")?.id, "notes");
		assert.equal((await source.list()).length, 1);
	});

	it("still refuses two tools with one id, which no single file can show", async () => {
		const manifest = await marked();
		const source = new RegistrySource([{ manifest, load }, { manifest, load }]);
		await assert.rejects(source.list(), { message: 'Two tools declare the id "notes". Ids must be unique within a source.' });
	});

	it("validates an unmarked manifest beside them, as data fetched at run time is", async () => {
		// What a server can send: JSON, which cannot carry the mark, and here it claims it in a string key.
		const fetched = JSON.parse(JSON.stringify({ ...raw, id: "fetched", "Symbol(toolbench.validated)": true, links: [{ label: "x", href: "javascript:alert(1)" }] }));
		const source = new RegistrySource({ notes: { manifest: await marked(), load }, fetched: { manifest: fetched, load } });
		assert.equal(source.manifest("notes"), undefined);
		await assert.rejects(source.list(), { name: "ManifestError", message: BAD_LINK });
	});

	it("treats an object carrying the mark but not frozen as unmarked, and validates it", async () => {
		const forged = { ...raw, links: [{ label: "x", href: "javascript:alert(1)" }] };
		Object.defineProperty(forged, VALIDATED, { value: true });
		const source = new RegistrySource({ notes: { manifest: forged, load } });
		assert.equal(source.manifest("notes"), undefined, "not ready in the constructor, so not taken as marked");
		await assert.rejects(source.list(), { name: "ManifestError", message: BAD_LINK });
	});
});
