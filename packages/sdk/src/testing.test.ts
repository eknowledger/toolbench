import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compare } from "./testing.ts";
import type { Case, Output } from "./types.ts";

const fields = (...pairs: [string, string][]): Output => ({
	kind: "fields",
	fields: pairs.map(([label, value]) => ({ label, value })),
});

describe("compare — exact by default", () => {
	it("passes on an identical output", () => {
		const expect = fields(["a", "1"]);
		assert.equal(compare(expect, { name: "x", input: {}, expect }), undefined);
	});

	it("catches a changed value", () => {
		const diff = compare(fields(["a", "2"]), { name: "x", input: {}, expect: fields(["a", "1"]) });
		assert.match(String(diff), /output\.fields\[0\]\.value/);
	});

	it("catches an EXTRA field, which is the regression subset matching hides", () => {
		const diff = compare(fields(["a", "1"], ["b", "2"]), { name: "x", input: {}, expect: fields(["a", "1"]) });
		assert.match(String(diff), /expected 1 item\(s\), got 2/);
	});

	it("catches a reordered field, because order is meaningful in a decode", () => {
		const diff = compare(fields(["b", "2"], ["a", "1"]), { name: "x", input: {}, expect: fields(["a", "1"], ["b", "2"]) });
		assert.match(String(diff), /output\.fields\[0\]/);
	});
});

describe("compare — subset, and its guard rails", () => {
	const base = { name: "x", input: {} };

	it("refuses subset matching without a stated reason", () => {
		const testCase: Case = { ...base, match: "subset", fieldCount: 1, expect: fields(["a", "1"]) };
		assert.match(String(compare(fields(["a", "1"]), testCase)), /requires a `why`/);
	});

	it("refuses subset matching on fields without a fieldCount", () => {
		const testCase: Case = { ...base, match: "subset", why: "because", expect: fields(["a", "1"]) };
		assert.match(String(compare(fields(["a", "1"]), testCase)), /requires `fieldCount`/);
	});

	it("catches a dropped field even in subset mode, via fieldCount", () => {
		const testCase: Case = { ...base, match: "subset", why: "because", fieldCount: 2, expect: fields(["a", "1"]) };
		assert.match(String(compare(fields(["a", "1"]), testCase)), /expected exactly 2 field\(s\) \(from fieldCount\), got 1/);
	});

	it("catches a duplicated field", () => {
		const testCase: Case = { ...base, match: "subset", why: "because", fieldCount: 2, expect: fields(["a", "1"]) };
		assert.match(String(compare(fields(["a", "1"], ["a", "9"]), testCase)), /"a" appears 2 times/);
	});

	it("reaches inside a group to find the part it means", () => {
		const actual: Output = {
			kind: "group",
			parts: [{ kind: "text", text: "hello" }, fields(["a", "1"], ["b", "2"])],
		};
		const testCase: Case = { ...base, match: "subset", why: "composite output", fieldCount: 2, expect: fields(["b", "2"]) };
		assert.equal(compare(actual, testCase), undefined);
	});

	it("lets a tool name its parts and fields without breaking a subset fixture written before (contract 5)", () => {
		// The fixture predates `role`. Naming parts is for host CSS, so it must not count as a changed answer.
		const actual: Output = {
			kind: "group",
			parts: [{ kind: "fields", role: "stats", fields: [{ label: "b", value: "2", role: "verdict" }] }],
		};
		const testCase: Case = { ...base, match: "subset", why: "composite output", fieldCount: 1, expect: fields(["b", "2"]) };
		assert.equal(compare(actual, testCase), undefined);
	});

	it("says what it looked at when no part matches", () => {
		const actual: Output = { kind: "group", parts: [{ kind: "text", text: "hello" }] };
		const testCase: Case = { ...base, match: "subset", why: "composite output", fieldCount: 1, expect: fields(["a", "1"]) };
		assert.match(String(compare(actual, testCase)), /no "fields" part inside the group \(it has text\)/);
	});

	it("matches an error by substring, so a message can gain detail without breaking a case", () => {
		const actual: Output = { kind: "error", message: "needs at least 12 bytes, got 4", input: "hex", at: 4 };
		const testCase: Case = { ...base, match: "subset", why: "message wording may gain detail", expect: { kind: "error", message: "at least 12 bytes", input: "hex" } };
		assert.equal(compare(actual, testCase), undefined);
	});
});
