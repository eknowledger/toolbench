import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LATER, OUTPUT_SINCE, checkManifestFeatures, outputFeatureProblem } from "./features.ts";
import { upgradeManifest } from "./migrate.ts";
import { CAPABILITIES, INPUT_TYPES, OUTPUT_KINDS, type Output } from "./types.ts";
import { INPUT_KEYS, ManifestError, RUNTIME_KEYS, TOP_LEVEL_KEYS, validateManifest } from "./validate.ts";
import { SDK_VERSION } from "./version.ts";

type Since = Readonly<Record<string, number>>;

/*
 * ⚠️ The full table: every key, input type, capability and kind, with the version that introduced it. Kept
 * here, not in features.ts, because the runtime only needs the rows after version 1 and pays for every byte
 * of the table in its boot chunk. The tests below hold the two together: this one against the validator's
 * own lists, and `LATER` against this one. A contract bump adds its rows here and in `LATER`.
 */
const TOP_LEVEL_SINCE: Since = {
	sdk: 1, id: 1, name: 1, blurb: 1, version: 1, capabilities: 1, inputs: 1, kinds: 1, runtime: 1, status: 1, card: 1,
	cardFields: 1, autoRun: 1, timeoutMs: 1, help: 1, tags: 1, links: 1,
	samples: 3,
};
const RUNTIME_SINCE: Since = { entry: 1, thread: 1 };
const INPUT_SINCE: Since = {
	id: 1, type: 1, label: 1, description: 1, unit: 1, primary: 1, dir: 1, default: 1, min: 1, max: 1, step: 1, options: 1,
	rows: 1, maxLength: 1,
	control: 4,
	lang: 6,
	grammar: 7,
	share: 8,
	role: 8,
};
const OPTION_SINCE: Since = { value: 1, label: 1, sets: 6 };
const INPUT_TYPE_SINCE: Since = { text: 1, textarea: 1, number: 1, select: 1, toggle: 1 };
const CAPABILITY_SINCE: Since = { pure: 1 };
const KIND_SINCE: Since = {
	fields: 1, text: 1, code: 1, table: 1, series: 1, group: 1, error: 1,
	bytes: 2,
	heatmap: 4, pie: 4, radar: 4, treemap: 4, venn: 4,
	graph: 7,
};
const SCOPES: [string, Since][] = [
	["", TOP_LEVEL_SINCE],
	["runtime.", RUNTIME_SINCE],
	["inputs.", INPUT_SINCE],
	["options.", OPTION_SINCE],
	["type.", INPUT_TYPE_SINCE],
	["capabilities.", CAPABILITY_SINCE],
	["kinds.", KIND_SINCE],
];

/** A v1 manifest using nothing later, so each test adds exactly one newer thing. */
const v1 = (sdk = 1): Record<string, unknown> => ({
	sdk,
	id: "example",
	name: "Example",
	blurb: "Does a thing.",
	version: "1.0.0",
	capabilities: ["pure"],
	runtime: { entry: "index.ts" },
	inputs: [{ id: "body", type: "textarea", label: "Body", default: "" }],
	kinds: ["fields", "error"],
});

const refuses = (manifest: unknown, field: string, contains: RegExp[]) =>
	assert.throws(
		() => checkManifestFeatures(manifest),
		(error: unknown) => {
			assert.ok(error instanceof ManifestError, `expected ManifestError, got ${String(error)}`);
			assert.equal(error.field, field);
			for (const pattern of contains) assert.match(error.message, pattern);
			return true;
		},
	);

describe("the version each feature arrived in (#170)", () => {
	/*
	 * ⚠️ The guard that makes the table survive a contract bump. A key the validator learns without a row
	 * here would be accepted under any declared `sdk`, which is the bug this table exists to stop. Both
	 * directions, so a misspelt row is caught as well as a missing one.
	 */
	it("has a row for every key, input type, capability and kind the validator knows, and no others", () => {
		assert.deepEqual(Object.keys(TOP_LEVEL_SINCE).sort(), [...TOP_LEVEL_KEYS].sort());
		assert.deepEqual(Object.keys(RUNTIME_SINCE).sort(), [...RUNTIME_KEYS].sort());
		// `id` is an input's key too; the validator lists it with the top-level keys.
		assert.deepEqual(Object.keys(INPUT_SINCE).sort(), [...INPUT_KEYS, "id"].sort());
		assert.deepEqual(Object.keys(INPUT_TYPE_SINCE).sort(), [...INPUT_TYPES].sort());
		assert.deepEqual(Object.keys(CAPABILITY_SINCE).sort(), [...CAPABILITIES].sort());
		assert.deepEqual(Object.keys(KIND_SINCE).sort(), [...OUTPUT_KINDS].sort());
		assert.ok("sets" in OPTION_SINCE, "the preset key on a select option");
	});

	it("ships exactly the rows after version 1, and nothing else, in the runtime's table", () => {
		const later = Object.fromEntries(SCOPES.flatMap(([scope, table]) => Object.entries(table).filter(([, v]) => v > 1).map(([k, v]) => [scope + k, v])));
		assert.deepEqual({ ...LATER }, later);
	});

	it("does not mistake a key named like an Object property for a feature", () => {
		assert.doesNotThrow(() => checkManifestFeatures({ ...v1(1), constructor: 1, toString: "x" }));
	});

	it("names only versions that exist", () => {
		for (const table of [...SCOPES.map(([, t]) => t), LATER, OUTPUT_SINCE]) {
			for (const [key, since] of Object.entries(table)) {
				assert.ok(Number.isInteger(since) && since >= 1 && since <= SDK_VERSION, `${key}: ${since}`);
			}
		}
	});

	/*
	 * Read off docs/versioning.md §9 and the history of types.ts by hand, not from the table: samples in 3,
	 * the slider in 4, presets and `lang` in 6, bytes in 2, the five later chart kinds in 4.
	 */
	it("dates each manifest feature where the version history puts it", () => {
		assert.deepEqual(
			{ samples: TOP_LEVEL_SINCE.samples, control: INPUT_SINCE.control, lang: INPUT_SINCE.lang, sets: OPTION_SINCE.sets, grammar: INPUT_SINCE.grammar, share: INPUT_SINCE.share, role: INPUT_SINCE.role },
			{ samples: 3, control: 4, lang: 6, sets: 6, grammar: 7, share: 8, role: 8 },
		);
		assert.deepEqual(
			Object.fromEntries(Object.entries(KIND_SINCE).filter(([, v]) => v > 1)),
			{ bytes: 2, heatmap: 4, pie: 4, radar: 4, treemap: 4, venn: 4, graph: 7 },
		);
	});
});

describe("a manifest using a feature newer than its sdk is refused (#170)", () => {
	it("names the field, the version that added it, and the sdk to declare", () => {
		const m = v1(4);
		(m.inputs as Record<string, unknown>[])[0]!.lang = "json";
		refuses(m, "inputs[0].lang", [/from contract version 6/, /declares "sdk": 4/, /Declare "sdk": 6\./]);
	});

	it("refuses the issue's own case through validateManifest, and through upgradeManifest before it stamps sdk", () => {
		const m = v1(4);
		(m.inputs as Record<string, unknown>[])[0]!.lang = "json";
		assert.throws(() => validateManifest(m), /inputs\[0\]\.lang: is from contract version 6/);
		// The usual path refuses it too: `upgradeManifest` checks before it stamps the current version.
		assert.throws(() => validateManifest(upgradeManifest(m)), /inputs\[0\]\.lang: is from contract version 6/);
	});

	it("refuses samples before 3, the slider before 4, and a preset before 6", () => {
		refuses({ ...v1(2), samples: [{ label: "One", input: { body: "x" } }] }, "samples", [/version 3/, /Declare "sdk": 3/]);
		refuses(
			{ ...v1(3), inputs: [{ id: "n", type: "number", label: "N", default: 1, min: 0, max: 9, control: "slider" }] },
			"inputs[0].control",
			[/version 4/],
		);
		refuses(
			{
				...v1(5),
				inputs: [{ id: "mode", type: "select", label: "Mode", default: "a", options: [{ value: "a", label: "A" }, { value: "b", label: "B", sets: { body: "x" } }] }, { id: "body", type: "textarea", label: "Body", default: "" }],
			},
			"inputs[0].options[1].sets",
			[/version 6/, /declares "sdk": 5/],
		);
	});

	// Either value: a v7 host has no rule for the key, so a tool declaring 7 cannot rely on it being honoured.
	it("refuses share on an input under sdk 7, whichever its value", () => {
		for (const share of [false, true]) {
			const m = { ...v1(7), inputs: [{ id: "password", type: "text", label: "Password", default: "", share }] };
			refuses(m, "inputs[0].share", [/from contract version 8/, /declares "sdk": 7/, /Declare "sdk": 8\./]);
		}
	});

	it("refuses role on an input under sdk 7, though role on a part is from 5", () => {
		refuses({ ...v1(7), inputs: [{ id: "body", type: "textarea", label: "Body", default: "", role: "data" }] }, "inputs[0].role", [/from contract version 8/, /Declare "sdk": 8\./]);
	});

	it("refuses a declared kind its sdk cannot express, quoting the kind", () => {
		refuses({ ...v1(3), kinds: ["fields", "heatmap", "error"] }, "kinds[1]", [/"heatmap" is from contract version 4/, /Declare "sdk": 4/]);
		refuses({ ...v1(1), kinds: ["bytes", "error"] }, "kinds[0]", [/"bytes" is from contract version 2/]);
	});

	it("asks for the version that covers every newer feature, so one edit fixes them all", () => {
		const m = { ...v1(3), samples: [{ label: "One", input: { body: "x" } }], inputs: [{ id: "body", type: "textarea", label: "Body", default: "", lang: "json" }, { id: "n", type: "number", label: "N", default: 1, min: 0, max: 9, control: "slider" }] };
		refuses(m, "inputs[0].lang", [/version 6/, /Declare "sdk": 6\./]);
	});

	it("accepts each feature at the version that added it, and leaves unknown keys to the validator", () => {
		const m = v1(6);
		(m.inputs as Record<string, unknown>[])[0]!.lang = "json";
		assert.doesNotThrow(() => checkManifestFeatures(m));
		assert.doesNotThrow(() => checkManifestFeatures({ ...v1(3), samples: [{ label: "One", input: { body: "x" } }] }));
		assert.doesNotThrow(() => checkManifestFeatures({ ...v1(1), "x-mine": true }), "an unknown key is still ignored");
		assert.doesNotThrow(() => checkManifestFeatures({ ...v1(1), sdk: "one" }), "a malformed sdk is validateManifest's to explain");
	});
});

describe("a result using a feature newer than its tool's sdk is reported (#170)", () => {
	const roleInGroup: Output = { kind: "group", parts: [{ kind: "text", text: "x" }, { kind: "fields", role: "verdict", fields: [] }] };

	it("names where the feature is, the version, and the sdk to declare", () => {
		assert.equal(
			outputFeatureProblem(roleInGroup, 3),
			'output.parts[1].role: part role is from contract version 5, but the tool declares "sdk": 3. Declare "sdk": 5.',
		);
		assert.equal(outputFeatureProblem(roleInGroup, 5), undefined);
	});

	it("sees the later kinds, the muted tone, and a chart's version-4 features", () => {
		assert.match(String(outputFeatureProblem({ kind: "bytes", bytes: [1] }, 1)), /^output\.kind: "bytes" is from contract version 2/);
		assert.match(String(outputFeatureProblem({ kind: "fields", fields: [{ label: "a", value: "1", tone: "muted" }] }, 4)), /fields\[0\]\.tone: field tone muted is from contract version 5/);
		assert.match(String(outputFeatureProblem({ kind: "table", columns: [{ label: "a" }], rows: [[{ text: "1", tone: "muted" }]] }, 4)), /rows\[0\]\[0\]\.tone/);
		const chart = (series: Record<string, unknown>, extra: Record<string, unknown> = {}): Output =>
			({ kind: "series", chart: { xLabel: "x", yLabel: "y", x: [1, 2], series: [{ label: "s", points: [1, 2], ...series }], ...extra } }) as Output;
		assert.match(String(outputFeatureProblem(chart({ shape: "points" }), 3)), /series\[0\]\.shape: series shape points is from contract version 4/);
		assert.match(String(outputFeatureProblem(chart({ markers: true }), 1)), /series\[0\]\.markers/);
		assert.match(String(outputFeatureProblem(chart({}, { thresholds: [{ y: 1, label: "SLO" }] }), 3)), /chart\.thresholds/);
		assert.match(String(outputFeatureProblem(chart({}, { x: ["a", "b"] }), 3)), /chart\.x: chart x text/);
		assert.equal(outputFeatureProblem(chart({ shape: "bar" }), 1), undefined, "the shapes of version 1 are fine at 1");
	});

	/*
	 * Either value, not only `false`. `true` draws the same on a v7 runtime, but the key is what a tool
	 * declares it needs, and a rule that let one value of a key through under an older sdk would be a
	 * second rule for an author to remember.
	 */
	it("sees wrap on a column and on a cell, at version 8", () => {
		const table: Output = { kind: "table", columns: [{ label: "Note", wrap: "prose" }, { label: "Date" }], rows: [["a", { text: "2025-02-27", wrap: "none" }]] };
		assert.equal(
			outputFeatureProblem(table, 7),
			'output.columns[0].wrap: column wrap is from contract version 8, but the tool declares "sdk": 7. Declare "sdk": 8.',
		);
		const cellOnly: Output = { kind: "table", columns: [{ label: "Date" }], rows: [[{ text: "2025-02-27", wrap: "none" }]] };
		assert.match(String(outputFeatureProblem(cellOnly, 7)), /^output\.rows\[0\]\[0\]\.wrap: cell wrap is from contract version 8/);
		assert.equal(outputFeatureProblem(table, 8), undefined);
	});

	it("sees rowHeader on a column, at version 8", () => {
		const table: Output = { kind: "table", columns: [{ label: "Instance", rowHeader: true }, { label: "p99" }], rows: [["host-4", "1450"]] };
		assert.match(String(outputFeatureProblem(table, 7)), /^output\.columns\[0\]\.rowHeader: column rowHeader is from contract version 8/);
		assert.equal(outputFeatureProblem(table, 8), undefined);
	});

	it("sees mono on a field, at version 8, inside a group", () => {
		const faces: Output = { kind: "group", parts: [{ kind: "fields", fields: [{ label: "Address", value: "192.0.2.10", mono: true }, { label: "Integrity", value: "none present", mono: false }] }] };
		assert.equal(
			outputFeatureProblem(faces, 7),
			'output.parts[0].fields[0].mono: field mono is from contract version 8, but the tool declares "sdk": 7. Declare "sdk": 8.',
		);
		assert.equal(outputFeatureProblem(faces, 8), undefined);
		assert.equal(outputFeatureProblem({ kind: "fields", fields: [{ label: "Address", value: "192.0.2.10" }] }, 7), undefined, "a field with no mono is a v1 field");
	});
});
