import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InputSpec } from "@toolbench/sdk";
import { fitLink, linkFor } from "./share.ts";

const long = (letter: string) => letter.repeat(250);
const types = {
	id: "types",
	type: "multiselect",
	label: "Record types",
	default: [],
	options: ["a", "b", "c", "d", "e", "f", "g", "h"].map((letter) => ({ value: long(letter), label: letter })),
} as const satisfies InputSpec;
const count = { id: "n", type: "number", label: "Count", default: 1, min: 0, max: 9 } as const satisfies InputSpec;
const note = { id: "note", type: "textarea", label: "Note", default: "" } as const satisfies InputSpec;
const specs: readonly InputSpec[] = [types, count, note];

// Expected links written out by hand from the scheme: `<tool>.<input>`, one parameter per chosen value.
describe("linkFor: the default link (#227, #204)", () => {
	it("repeats a multiselect's key once per chosen value, after the page's own parameters", () => {
		assert.equal(linkFor("dns", { types: ["MX", "TXT"], n: 5 }, specs, "https://x.test/p?id=dns&dns.old=1"), "https://x.test/p?id=dns&dns.types=MX&dns.types=TXT&dns.n=5");
	});

	it("writes none chosen as the bare key, so a reader's empty choice does not read back as the default", () => {
		assert.equal(linkFor("dns", { types: [] }, specs, "https://x.test/p"), "https://x.test/p?dns.types=");
	});
});

describe("fitLink: a link short enough to survive a chat preview (#204)", () => {
	const write = (values: Record<string, unknown>) => linkFor("dns", values as never, specs, "https://x.test/p");

	it("leaves a short link alone", () => {
		const values = { types: [long("a")], n: 5 };
		assert.deepEqual(fitLink(write, values, specs), { url: write(values), values, left: [] });
	});

	it("leaves out a list input that takes it past 2000 characters, and says which", () => {
		const values = { types: types.options.map((o) => o.value), n: 5 };
		assert.ok(write(values).length > 2000, "the full link is too long");
		assert.deepEqual(fitLink(write, values, specs), { url: "https://x.test/p?dns.n=5", values: { n: 5 }, left: ["Record types"] });
	});

	it("never drops a single value, however long: only a list can be left out", () => {
		const values = { note: "x".repeat(2100), n: 5 };
		assert.deepEqual(fitLink(write, values, specs).left, []);
	});
});
