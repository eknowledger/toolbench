import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InputSpec, InputValues } from "@toolbench/sdk";
import { shareableInputs } from "@toolbench/sdk";
import { applyPartialValues, coerce } from "./values.ts";

const numberSpec = {
	id: "arrivals",
	type: "number",
	label: "Arrival rate",
	default: 800,
	min: 1,
	max: 5000,
} as const satisfies InputSpec;

const selectSpec = {
	id: "method",
	type: "select",
	label: "Definition",
	default: "nearest",
	options: [
		{ value: "nearest", label: "Nearest rank" },
		{ value: "linear", label: "Linear interpolation" },
	],
} as const satisfies InputSpec;

const toggleSpec = {
	id: "wide",
	type: "toggle",
	label: "Wide",
	default: false,
} as const satisfies InputSpec;

const textSpec = {
	id: "text",
	type: "textarea",
	label: "Text",
	default: "hello",
	maxLength: 8,
} as const satisfies InputSpec;

const unboundedText = {
	id: "note",
	type: "text",
	label: "Note",
	default: "",
} as const satisfies InputSpec;

const inputs: readonly InputSpec[] = [numberSpec, selectSpec, toggleSpec, textSpec];

const current = (): InputValues => ({
	arrivals: 800,
	method: "nearest",
	wide: false,
	text: "hello",
});

describe("coerce", () => {
	it("clamps a number above max and below min", () => {
		assert.equal(coerce(numberSpec, 99999), 5000);
		assert.equal(coerce(numberSpec, -10), 1);
	});

	it("falls back to the default when the number is not finite", () => {
		assert.equal(coerce(numberSpec, "nope"), 800);
		assert.equal(coerce(numberSpec, Number.NaN), 800);
	});

	it("refuses a select value that is not an option", () => {
		assert.equal(coerce(selectSpec, "bogus"), "nearest");
		assert.equal(coerce(selectSpec, "linear"), "linear");
	});

	it("stores a toggle as a boolean", () => {
		assert.equal(coerce(toggleSpec, true), true);
		assert.equal(coerce(toggleSpec, 0), false);
	});

	// Kept as written, out of range or not, so the check before run can name what arrived (#203).
	it("keeps a date as the string it arrived as", () => {
		const day = { id: "day", type: "date", label: "Day", default: "2026-10-25", max: "2026-12-31" } as const satisfies InputSpec;
		assert.equal(coerce(day, "2027-01-01"), "2027-01-01");
		assert.equal(coerce(day, 20270101), "20270101");
	});

	// run gets lowercase #rrggbb whatever case was typed or linked; anything else is kept, to be named before run.
	it("lowercases and trims a colour, and keeps one that is not a colour as written", () => {
		const accent = { id: "accent", type: "color", label: "Accent", default: "#1f5aa8" } as const satisfies InputSpec;
		assert.equal(coerce(accent, " #AA0011 "), "#aa0011");
		assert.equal(coerce(accent, "teal"), "teal");
	});

	it("cuts a secret at maxLength, as typing would be", () => {
		const token = { id: "token", type: "secret", label: "Token", maxLength: 4 } as const satisfies InputSpec;
		assert.equal(coerce(token, "abcdefgh"), "abcd");
	});

	it("truncates text to maxLength, the same limit the maxlength attribute enforces on typing", () => {
		assert.equal(coerce(textSpec, "abcdefghij"), "abcdefgh");
		assert.equal(coerce(unboundedText, "abcdefghij"), "abcdefghij");
	});
});

describe("applyPartialValues", () => {
	it("writes only the keys the caller named, and leaves the rest alone", () => {
		const next = applyPartialValues(inputs, current(), { method: "linear" });
		assert.equal(next.method, "linear");
		assert.equal(next.arrivals, 800);
		assert.equal(next.text, "hello");
		assert.equal(next.wide, false);
	});

	it("ignores unknown ids rather than storing them", () => {
		const next = applyPartialValues(inputs, current(), { packet: "80 e0", arrivals: 100 });
		assert.equal(next.arrivals, 100);
		assert.equal("packet" in next, false, "an unknown key must not land in the map the tool will see");
	});

	it("clamps and refuses inside the merge, so a host cannot bypass the form", () => {
		const next = applyPartialValues(inputs, current(), {
			arrivals: 99999,
			method: "bogus",
			text: "abcdefghij",
		});
		assert.equal(next.arrivals, 5000);
		assert.equal(next.method, "nearest");
		assert.equal(next.text, "abcdefgh");
	});

	it("is a no-op for an empty partial", () => {
		const before = current();
		assert.deepEqual(applyPartialValues(inputs, before, {}), before);
	});
});

describe("shareableInputs: the one rule the share button writes and reads by (#227)", () => {
	it("keeps every input but one marked share: false, in the manifest's order", () => {
		const manifest = { inputs: [{ id: "user" }, { id: "password", share: false }, { id: "count", share: true }] };
		assert.deepEqual(shareableInputs(manifest), ["user", "count"]);
	});

	it("marks an input private only with the boolean false, the test the SDK's own helper makes", () => {
		assert.deepEqual(shareableInputs({ inputs: [{ id: "a", share: "false" }, { id: "b", share: 0 }] }), ["a", "b"]);
	});

	it("survives a manifest with no inputs", () => {
		assert.deepEqual(shareableInputs({}), []);
	});
});
