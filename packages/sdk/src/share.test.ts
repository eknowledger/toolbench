import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shareableInputs } from "./share.ts";

/*
 * Written from #211 by hand: an input is shareable unless it says share: false, whatever its type, and the
 * ids come back in the manifest's order so a host's link is stable.
 */
describe("shareableInputs (#211)", () => {
	it("keeps every input that does not say share: false, in manifest order", () => {
		const manifest = {
			inputs: [
				{ id: "user", type: "text" },
				{ id: "password", type: "text", share: false },
				{ id: "notes", type: "textarea", share: true },
				{ id: "key", type: "textarea", share: false },
				{ id: "n", type: "number" },
			],
		};
		assert.deepEqual(shareableInputs(manifest), ["user", "notes", "n"]);
	});

	it("reads a raw tool.json as a registry holds it, before validation", () => {
		const raw: unknown = JSON.parse('{"inputs":[{"id":"a","share":false},{"id":"b"}]}');
		assert.deepEqual(shareableInputs(raw as { inputs: { id: string }[] }), ["b"]);
	});

	// A secret (#203) is the one type that starts private: it shares only when its manifest says share: true.
	it("leaves a secret out unless it says share: true", () => {
		const manifest = { inputs: [{ id: "a", type: "secret" }, { id: "b", type: "secret", share: true }, { id: "c", type: "secret", share: false }, { id: "d", type: "text" }] };
		assert.deepEqual(shareableInputs(manifest), ["b", "d"]);
	});

	it("shares nothing when every input says share: false", () => {
		assert.deepEqual(shareableInputs({ inputs: [{ id: "secret", share: false }] }), []);
	});
});
