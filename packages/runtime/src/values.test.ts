import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InputSpec, InputValues } from "@toolbench/sdk";
import { shareableInputs } from "@toolbench/sdk";
import { applyPartialValues, cells, coerce, fromQuery, written } from "./values.ts";

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

const typesSpec = {
	id: "types",
	type: "multiselect",
	label: "Record types",
	default: ["A", "AAAA"],
	options: ["A", "AAAA", "MX", "TXT"].map((value) => ({ value, label: value })),
	min: 1,
	max: 3,
} as const satisfies InputSpec;

describe("coerce: a multiselect (#204)", () => {
	it("keeps the chosen values in the options' order, whatever order they arrive in", () => {
		assert.deepEqual(coerce(typesSpec, ["TXT", "A"]), ["A", "TXT"]);
	});

	it("falls back to the whole default for an unknown option, a repeat, too many, or no list at all", () => {
		for (const bad of [["A", "SOA"], ["A", "A"], ["A", "AAAA", "MX", "TXT"], "A", 3]) {
			assert.deepEqual(coerce(typesSpec, bad as never), ["A", "AAAA"], JSON.stringify(bad));
		}
	});

	it("keeps fewer than min, which the form can hold too: Run refuses it, the value is not rewritten", () => {
		assert.deepEqual(coerce(typesSpec, []), []);
	});

	it("never hands out the manifest's own array, so editing the form cannot change the default", () => {
		const value = coerce(typesSpec, "bad" as never) as string[];
		assert.notEqual(value, typesSpec.default);
	});
});

describe("fromQuery: a link's values for one tool (#227, #204)", () => {
	const specs: readonly InputSpec[] = [numberSpec, toggleSpec, typesSpec, unboundedText];
	const read = (query: string) => fromQuery("dns", specs, new URLSearchParams(query));

	it("reads each input under the tool's id, and nothing of another tool's", () => {
		assert.deepEqual(read("dns.arrivals=12&other.arrivals=4&dns.note=hi"), { arrivals: "12", note: "hi" });
	});

	it("reads a toggle as true only from the word true", () => {
		assert.deepEqual(read("dns.wide=true"), { wide: true });
		assert.deepEqual(read("dns.wide=yes"), { wide: false });
	});

	it("reads every repeat of a multiselect's key, and the bare key as none chosen", () => {
		assert.deepEqual(read("dns.types=MX&dns.types=TXT"), { types: ["MX", "TXT"] });
		assert.deepEqual(read("dns.types="), { types: [] });
	});

	it("keeps the last of a repeated single value, as the link reader always has", () => {
		assert.deepEqual(read("dns.note=a&dns.note=b"), { note: "b" });
	});
});

const limitsSpec = {
	id: "limits",
	type: "rows",
	label: "Limits",
	maxRows: 2,
	columns: [
		{ id: "path", type: "text", label: "Path", maxLength: 6 },
		{ id: "limit", type: "number", label: "Limit", min: 1, max: 100 },
		{ id: "scheme", type: "select", label: "Scheme", options: [{ value: "https", label: "HTTPS" }, { value: "http", label: "HTTP" }] },
		{ id: "on", type: "toggle", label: "On" },
	],
	default: [{ path: "/", limit: 10, scheme: "https", on: true }],
} as const satisfies InputSpec;
const DEFAULT_ROWS = [{ path: "/", limit: 10, scheme: "https", on: true }];

describe("coerce: rows (#204)", () => {
	it("clamps a number cell and cuts a text cell, as typing does, and drops a key that is no column", () => {
		assert.deepEqual(coerce(limitsSpec, [{ path: "/api/v1", limit: 500, scheme: "http", on: false, burst: 3 }] as never), [{ path: "/api/v", limit: 100, scheme: "http", on: false }]);
	});

	it("reads a cell written as text, as a link writes it", () => {
		assert.deepEqual(coerce(limitsSpec, [{ path: "/a", limit: "20", scheme: "http", on: "false" }] as never), [{ path: "/a", limit: 20, scheme: "http", on: false }]);
	});

	it("falls back to the whole default for a missing cell, an unknown option, a number that is none, or too many rows", () => {
		const row = { path: "/a", limit: 5, scheme: "https", on: true };
		for (const bad of [[{ path: "/a", limit: 5, scheme: "https" }], [{ ...row, scheme: "ftp" }], [{ ...row, limit: "lots" }], [{ ...row, on: "yes" }], [row, row, row], "nope", [3]]) {
			assert.deepEqual(coerce(limitsSpec, bad as never), DEFAULT_ROWS, JSON.stringify(bad));
		}
	});

	it("keeps no rows, which the form can hold too", () => {
		assert.deepEqual(coerce(limitsSpec, []), []);
	});
});

describe("fromQuery: rows, one key per column zipped by position (#204)", () => {
	const read = (query: string) => fromQuery("rl", [limitsSpec], new URLSearchParams(query));

	it("zips each column's repeats into rows", () => {
		assert.deepEqual(read("rl.limits.path=%2Fa&rl.limits.limit=5&rl.limits.scheme=https&rl.limits.on=true&rl.limits.path=%2Fb&rl.limits.limit=6&rl.limits.scheme=http&rl.limits.on=false"), {
			limits: [{ path: "/a", limit: "5", scheme: "https", on: "true" }, { path: "/b", limit: "6", scheme: "http", on: "false" }],
		});
	});

	it("reads the bare key as no rows, and columns of different lengths as a list it cannot use", () => {
		assert.deepEqual(read("rl.limits="), { limits: [] });
		const uneven = read("rl.limits.path=%2Fa&rl.limits.path=%2Fb&rl.limits.limit=5&rl.limits.scheme=https&rl.limits.on=true");
		assert.deepEqual(coerce(limitsSpec, uneven.limits as never), DEFAULT_ROWS);
	});
});

describe("written: a value as typed, or as a link carried it (#262)", () => {
	it("keeps a number as written, in range or not, for the check before run to refuse", () => {
		assert.equal(written(numberSpec, "99999"), 99999);
		assert.equal(written(numberSpec, "0"), 0);
		assert.equal(written(numberSpec, 12.5), 12.5);
	});
	it("keeps an empty or unreadable box as its text, not the min that Number(\"\") clamped to", () => {
		assert.equal(written(numberSpec, ""), "");
		assert.equal(written(numberSpec, "abc"), "abc");
	});
	it("keeps a rows input's number cells as written too, where coerce clamps them", () => {
		const limit = { id: "limit", type: "number", label: "Limit", min: 1, max: 10000 } as const;
		assert.deepEqual(cells([limit], { limit: "9999999" }, true), { limit: 9999999 });
		assert.deepEqual(cells([limit], { limit: "" }, true), { limit: "" });
		assert.deepEqual(cells([limit], { limit: "9999999" }), { limit: 10000 });
		assert.equal(cells([limit], { limit: "" }), undefined);
	});
	it("is coerce for every other type", () => {
		assert.equal(written(selectSpec, "bogus"), "nearest");
		assert.equal(written(textSpec, "x".repeat(20)), "xxxxxxxx");
	});
	it("is what applyPartialValues uses when asked, and a host's write is still clamped", () => {
		assert.equal(applyPartialValues([numberSpec], { arrivals: 800 }, { arrivals: "99999" }, written).arrivals, 99999);
		assert.equal(applyPartialValues([numberSpec], { arrivals: 800 }, { arrivals: 99999 }).arrivals, 5000);
	});
});
