import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SeedError, defaultInputs, seed, serialiseSeed } from "./seed.ts";
import type { InputSpec, LoadedTool, Manifest, Output, Tool } from "./types.ts";

function manifestWith(inputs: InputSpec[], sdk = 2): Manifest {
	return {
		sdk,
		id: "demo",
		name: "Demo",
		blurb: "A tool that exists to be seeded.",
		version: "1.0.0",
		capabilities: ["pure"],
		runtime: { entry: "index.ts", thread: "main" },
		inputs,
		kinds: ["fields", "error"],
		card: "live",
		status: "live",
	} as Manifest;
}

const TEXT: InputSpec = { id: "text", type: "text", label: "Text", default: "hi" };
const COUNT: InputSpec = { id: "count", type: "number", label: "Count", default: 3, min: 1, max: 10 };
const ON: InputSpec = { id: "on", type: "toggle", label: "On", default: true };

const loaded = (tool: Tool, inputs = [TEXT], sdk = 2): LoadedTool => ({ manifest: manifestWith(inputs, sdk), tool });

describe("defaultInputs", () => {
	it("reads every declared default, across types", () => {
		assert.deepEqual(defaultInputs({ manifest: manifestWith([TEXT, COUNT, ON]) }), {
			text: "hi",
			count: 3,
			on: true,
		});
	});
});

describe("seed", () => {
	it("runs the tool against its defaults and returns the result", async () => {
		const tool: Tool = { run: (input) => ({ kind: "fields", fields: [{ label: "got", value: String(input.text) }] }) };
		assert.deepEqual(await seed(loaded(tool)), { kind: "fields", fields: [{ label: "got", value: "hi" }] });
	});

	it("awaits an async tool", async () => {
		const tool: Tool = {
			run: async () => {
				await new Promise((r) => setTimeout(r, 5));
				return { kind: "text", text: "later" };
			},
		};
		assert.deepEqual(await seed(loaded(tool)), { kind: "text", text: "later" });
	});

	it("upgrades the output, so a stored seed is always current-shaped", async () => {
		// A v1 tool's result goes through the same migration the runtime applies.
		const output: Output = { kind: "fields", fields: [{ label: "a", value: "1" }] };
		const tool: Tool = { run: () => output };
		assert.deepEqual(await seed(loaded(tool, [TEXT], 1)), output);
	});

	it("throws when the tool throws, because its own fixtures should have caught that", async () => {
		const tool: Tool = {
			run: () => {
				throw new TypeError("cannot read properties of undefined");
			},
		};
		await assert.rejects(seed(loaded(tool)), (error: unknown) => {
			assert.ok(error instanceof SeedError);
			assert.equal(error.toolId, "demo");
			assert.match(error.message, /threw while running its own default inputs/);
			// The original is preserved, or the build log says nothing useful.
			assert.ok(error.cause instanceof TypeError);
			return true;
		});
	});

	it("throws when the tool rejects its own defaults, rather than seeding an error", async () => {
		/*
		 * A card seeded with an error message is worse than an unseeded card: it shows a failure to
		 * every reader before anyone has typed anything. And it means the author's own defaults are
		 * invalid, which is a bug in the tool.
		 */
		const tool: Tool = { run: () => ({ kind: "error", message: "empty input", input: "text" }) };
		await assert.rejects(seed(loaded(tool)), (error: unknown) => {
			assert.ok(error instanceof SeedError);
			assert.match(error.message, /rejected its own default inputs: empty input/);
			return true;
		});
	});

	it("times out a cooperative tool and says how long it waited", async () => {
		const tool: Tool = {
			run: async (_input, ctx) => {
				for (;;) {
					if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
					await new Promise((r) => setTimeout(r, 5));
				}
			},
		};
		await assert.rejects(seed(loaded(tool), { timeoutMs: 60 }), (error: unknown) => {
			assert.ok(error instanceof SeedError);
			assert.match(error.message, /did not finish within 60ms/);
			return true;
		});
	});

	it("passes a live signal, so a tool can honour it", async () => {
		let seen: AbortSignal | undefined;
		const tool: Tool = {
			run: (_input, ctx) => {
				seen = ctx.signal;
				return { kind: "text", text: "ok" };
			},
		};
		await seed(loaded(tool));
		assert.ok(seen instanceof AbortSignal);
		assert.equal(seen.aborted, false, "not aborted on a run that finished");
	});
});

describe("serialiseSeed", () => {
	it("cannot close the script element it will be embedded in", () => {
		/*
		 * ⚠️ The reason this function exists. An HTML parser ends a <script> at the first `</script` in
		 * its text no matter how the JSON is quoted, so a tool echoing reader-supplied text could
		 * truncate the document. Reachable by a reader, not just by an author.
		 */
		const json = serialiseSeed({ kind: "text", text: "</script><img onerror=alert(1)>" });
		assert.doesNotMatch(json, /<\/script/i, "must not contain a literal closing script tag");
		assert.doesNotMatch(json, /</, "escaping every < is the simplest thing that cannot be got wrong");
		assert.equal(JSON.parse(json).text, "</script><img onerror=alert(1)>", "and it round-trips exactly");
	});

	it("escapes the JavaScript line terminators that are legal in JSON", () => {
		// ⚠️ Escapes, not literals: these characters END A LINE in source. Written raw, they break
		// this very file, which is a neat demonstration of why they have to be escaped in output.
		const text = "a\u2028b\u2029c";
		const json = serialiseSeed({ kind: "text", text });
		assert.doesNotMatch(json, /[\u2028\u2029]/, "no raw separators in the output");
		assert.equal(JSON.parse(json).text, text);
	});

	it("round-trips a realistic composite result byte for byte", () => {
		const output: Output = {
			kind: "group",
			parts: [
				{ kind: "fields", fields: [{ label: "p99", value: "1200", tone: "warn" }] },
				{ kind: "bytes", bytes: [72, 195, 169], highlight: [{ at: 1, len: 2, label: "U+00E9 é" }] },
			],
		};
		assert.deepEqual(JSON.parse(serialiseSeed(output)), output);
	});
});
