import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inputProblem } from "./inputs.ts";
import { ManifestError, validateManifest } from "./validate.ts";
import { SDK_VERSION } from "./version.ts";

/** A manifest that passes, so each test can break exactly one thing. */
const good = () => ({
	sdk: SDK_VERSION,
	id: "example",
	name: "Example",
	blurb: "Does a thing.",
	version: "1.0.0",
	capabilities: ["pure"],
	runtime: { entry: "index.ts" },
	inputs: [{ id: "value", type: "number", label: "Value", default: 1, min: 0, max: 10 }],
	kinds: ["fields", "error"],
});

const failsWith = (mutate: (m: Record<string, unknown>) => void, field: string, contains: string) => {
	const m = good();
	mutate(m as unknown as Record<string, unknown>);
	assert.throws(
		() => validateManifest(m),
		(error: unknown) => {
			assert.ok(error instanceof ManifestError, `expected a ManifestError, got ${error}`);
			assert.equal(error.field, field);
			assert.match(error.message, new RegExp(contains, "i"));
			return true;
		},
	);
};

describe("validateManifest", () => {
	it("accepts a minimal valid manifest and fills defaults", () => {
		const m = validateManifest(good());
		assert.equal(m.runtime.thread, "main", "thread defaults to main");
		assert.equal(m.card, "info", "card defaults to info, not live");
		assert.equal(m.status, "live");
	});

	it("rejects a contract version newer than this runtime, and says what to do", () => {
		failsWith((m) => { m.sdk = SDK_VERSION + 1; }, "sdk", "upgrade @toolbench/runtime");
	});

	it("rejects an id that is not a usable directory or URL segment", () => {
		failsWith((m) => { m.id = "Not Valid"; }, "id", "lowercase");
	});

	it("requires the error kind, because every tool can be given bad input", () => {
		failsWith((m) => { m.kinds = ["fields"]; }, "kinds", "error");
	});

	it("rejects duplicate input ids, naming the second colliding field", () => {
		failsWith((m) => {
			m.inputs = [
				{ id: "a", type: "text", label: "A", default: "" },
				{ id: "a", type: "text", label: "B", default: "" },
			];
		}, "inputs[1].id", String.raw`already used by inputs\[0\]`);
	});

	it("allows several primary inputs, because some questions need more than one number", () => {
		/*
		 * This asserted the opposite until a real tool wanted both: a capacity planner offering a rate
		 * without a duration is not a smaller version of itself. The rule encoded a runtime decision as a
		 * contract rule, and the runtime now shows every primary input.
		 */
		const manifest = validateManifest({
			...good(),
			inputs: [
				{ id: "a", type: "text", label: "A", default: "", primary: true },
				{ id: "b", type: "text", label: "B", default: "", primary: true },
			],
		});
		assert.equal(manifest.inputs.filter((input) => input.primary === true).length, 2);
	});

	it("refuses a known key in the wrong object, saying where it belongs (#87)", () => {
		// The case that was reported: a timeout beside the thread it pairs with, silently ignored.
		failsWith((m) => { m.runtime = { entry: "index.ts", thread: "worker", timeoutMs: 2000 }; }, "runtime.timeoutMs", "top level");
		failsWith((m) => { m.thread = "worker"; }, "thread", "`runtime`");
		failsWith((m) => { m.inputs = [{ id: "n", type: "number", label: "N", default: 1, min: 0, max: 9, autoRun: true }]; }, "inputs[0].autoRun", "top level");
		failsWith((m) => { m.step = 1; }, "step", "an entry of `inputs`");
	});

	it("still ignores a key it does not know, which loaded before and must keep loading", () => {
		const m = { ...good(), $comment: "for a reader of the file", runtime: { entry: "index.ts", note: "x" } };
		assert.doesNotThrow(() => validateManifest(m));
	});

	it("requires min and max on a number input", () => {
		failsWith((m) => { m.inputs = [{ id: "n", type: "number", label: "N", default: 1 }]; }, "inputs[0].min/max", "runaway");
	});

	it("rejects a default outside min..max", () => {
		failsWith((m) => { m.inputs = [{ id: "n", type: "number", label: "N", default: 99, min: 0, max: 10 }]; }, "inputs[0].default", "outside");
	});

	it("accepts control: slider on a number input, and nothing else there (contract 4)", () => {
		const m = { ...good(), inputs: [{ id: "n", type: "number", label: "N", default: 1, min: 0, max: 10, control: "slider" }] };
		const input = validateManifest(m).inputs[0];
		assert.ok(input?.type === "number" && input.control === "slider");
		failsWith((m) => { m.inputs = [{ id: "n", type: "number", label: "N", default: 1, min: 0, max: 10, control: "dial" }]; }, "inputs[0].control", "slider");
	});

	it("requires two options on a select", () => {
		failsWith((m) => {
			m.inputs = [{ id: "s", type: "select", label: "S", default: "a", options: [{ value: "a", label: "A" }] }];
		}, "inputs[0].options", "at least two");
	});

	it("requires a select default to be one of its options", () => {
		failsWith((m) => {
			m.inputs = [{
				id: "s", type: "select", label: "S", default: "z",
				options: [{ value: "a", label: "A" }, { value: "b", label: "B" }],
			}];
		}, "inputs[0].default", "must be one of");
	});

	// --- the invariants: the rules the rest of the system leans on ------------------------------
	it("rejects timeoutMs on the main thread, where nothing can be terminated", () => {
		failsWith((m) => { m.timeoutMs = 2000; }, "timeoutMs", "nothing to terminate");
	});

	it("accepts timeoutMs in worker mode", () => {
		const m = good() as Record<string, unknown>;
		m.runtime = { entry: "index.ts", thread: "worker" };
		m.timeoutMs = 2000;
		assert.equal(validateManifest(m).timeoutMs, 2000);
	});

	it("accepts a live card for a pure tool", () => {
		const m = good() as Record<string, unknown>;
		m.card = "live";
		assert.equal(validateManifest(m).card, "live");
	});

	it("accepts deprecated and retired, which default card stays info", () => {
		assert.equal(validateManifest({ ...good(), status: "deprecated" }).status, "deprecated");
		assert.equal(validateManifest({ ...good(), status: "retired" }).status, "retired");
	});

	it("rejects a live card when the tool is deprecated", () => {
		failsWith((m) => {
			m.card = "live";
			m.status = "deprecated";
		}, "card", "only a live tool");
	});

	it("rejects a live card when the tool is retired", () => {
		failsWith((m) => {
			m.card = "live";
			m.status = "retired";
		}, "card", "only a live tool");
	});

	// --- samples: checked against the inputs they claim to fill ----------------------------------
	it("accepts samples that name real inputs", () => {
		const m = validateManifest({ ...good(), samples: [{ label: "Middle", input: { value: 5 } }] });
		assert.equal(m.samples?.length, 1);
		assert.equal(m.samples?.[0]?.label, "Middle");
	});

	it("rejects a sample naming an input that does not exist, and lists the ones that do", () => {
		failsWith((m) => { m.samples = [{ label: "Typo", input: { valeu: 5 } }]; }, "samples[0].input.valeu", "names no input");
	});

	it("rejects a sample whose value is the wrong type for the input it fills", () => {
		failsWith((m) => { m.samples = [{ label: "Words", input: { value: "five" } }]; }, "samples[0].input.value", "finite number");
	});

	/*
	 * Deliberately not the clamp the typed path applies. A reader's out-of-range number is clamped
	 * because refusing it would leave them stuck; an author's is static data CI reads, so it can be a
	 * build error. Clamping it would ship a button labelled "High" whose value is the maximum.
	 */
	it("rejects a sample number outside the input's range rather than clamping an author's typo", () => {
		failsWith((m) => { m.samples = [{ label: "High", input: { value: 99 } }]; }, "samples[0].input.value", "outside");
	});

	it("rejects a sample that fills nothing", () => {
		failsWith((m) => { m.samples = [{ label: "Empty", input: {} }]; }, "samples[0].input", "sets no values");
	});

	it("rejects an empty samples array rather than accepting a key that says nothing", () => {
		failsWith((m) => { m.samples = []; }, "samples", "omit the key");
	});

	it("rejects duplicate sample labels, which would render as two identical buttons", () => {
		failsWith((m) => {
			m.samples = [
				{ label: "Same", input: { value: 1 } },
				{ label: "Same", input: { value: 2 } },
			];
		}, "samples[1]", String.raw`already used by samples\[0\]`);
	});

	it("points a later duplicate label at the colliding occurrence, not at the samples key", () => {
		failsWith((m) => {
			m.samples = [
				{ label: "Keep", input: { value: 1 } },
				{ label: "Other", input: { value: 2 } },
				{ label: "Keep", input: { value: 3 } },
			];
		}, "samples[2]", String.raw`already used by samples\[0\]`);
	});

	it("rejects two samples with different labels and the same input", () => {
		failsWith((m) => {
			m.samples = [
				{ label: "Low", input: { value: 3 } },
				{ label: "Also low", input: { value: 3 } },
			];
		}, "samples[1].input", String.raw`matches samples\[0\]`);
	});

	it("treats sample inputs as equal when only their key order differs", () => {
		failsWith((m) => {
			m.inputs = [
				{ id: "value", type: "number", label: "Value", default: 1, min: 0, max: 10 },
				{ id: "note", type: "text", label: "Note", default: "" },
			];
			m.samples = [
				{ label: "First", input: { value: 4, note: "x" } },
				{ label: "Second", input: { note: "x", value: 4 } },
			];
		}, "samples[1].input", String.raw`matches samples\[0\]`);
	});

	it("accepts two samples that share a value on one input and differ on another", () => {
		const m = good() as Record<string, unknown>;
		m.inputs = [
			{ id: "value", type: "number", label: "Value", default: 1, min: 0, max: 10 },
			{ id: "note", type: "text", label: "Note", default: "" },
		];
		m.samples = [
			{ label: "Just the number", input: { value: 7 } },
			{ label: "Number and a note", input: { value: 7, note: "x" } },
		];
		assert.equal(validateManifest(m).samples?.length, 2);
	});

	it("rejects a sample select value that is not one of the options", () => {
		failsWith((m) => {
			m.inputs = [
				{ id: "mode", type: "select", label: "Mode", default: "fast", options: [{ value: "fast", label: "Fast" }, { value: "exact", label: "Exact" }] },
			];
			m.samples = [{ label: "Sloppy", input: { mode: "quick" } }];
		}, "samples[0].input.mode", "option values");
	});

	/*
	 * The text and toggle arms of that switch were implemented and checked by hand, and nothing held
	 * them in place: the tests above only reach the number and select arms, so a refactor could have
	 * dropped either one and stayed green. Every arm now has a test.
	 */
	it("rejects a sample value that is not a string for a text input", () => {
		failsWith((m) => {
			m.inputs = [{ id: "pattern", type: "text", label: "Pattern", default: "" }];
			m.samples = [{ label: "A number", input: { pattern: 42 } }];
		}, "samples[0].input.pattern", "must be a string");
	});

	/*
	 * The DOM's maxlength attribute constrains typing only, and filling a control from a sample assigns
	 * its value directly, so nothing downstream would catch this.
	 */
	it("rejects a sample string longer than its input's maxLength", () => {
		failsWith((m) => {
			m.inputs = [{ id: "pattern", type: "text", label: "Pattern", default: "", maxLength: 8 }];
			m.samples = [{ label: "Too long", input: { pattern: "123456789" } }];
		}, "samples[0].input.pattern", "maxLength");
	});

	/*
	 * Deliberate: the same over-long string as a `default` still loads. Closing that gap would
	 * reject manifests contract v3 still accepts. maxLength bounds typing and samples, not default.
	 * See docs/authoring-a-tool.md and issue #41.
	 */
	it("accepts a default longer than maxLength; that bound is for typing and samples, not default", () => {
		const manifest = validateManifest({
			...good(),
			inputs: [{ id: "pattern", type: "text", label: "Pattern", default: "123456789", maxLength: 8 }],
		});
		assert.equal(manifest.inputs[0]?.default, "123456789");
	});

	it("rejects a sample value that is not a boolean for a toggle", () => {
		failsWith((m) => {
			m.inputs = [{ id: "trace", type: "toggle", label: "Show trace", default: false }];
			m.samples = [{ label: "Truthy", input: { trace: "yes" } }];
		}, "samples[0].input.trace", "true or false");
	});

	it("rejects samples that are not an array", () => {
		failsWith((m) => { m.samples = { label: "One", input: { value: 1 } }; }, "samples", "must be an array");
	});

	it("rejects a sample with no label, which would render as an unnamed button", () => {
		failsWith((m) => { m.samples = [{ input: { value: 5 } }]; }, "samples[0].label", "non-empty string");
	});

	it("accepts a partial sample, which is the usual case: change the one thing the example is about", () => {
		const m = good() as Record<string, unknown>;
		m.inputs = [
			{ id: "value", type: "number", label: "Value", default: 1, min: 0, max: 10 },
			{ id: "note", type: "text", label: "Note", default: "" },
		];
		m.samples = [{ label: "Just the number", input: { value: 7 } }];
		assert.deepEqual(validateManifest(m).samples?.[0]?.input, { value: 7 }, "an input the sample does not name is left alone");
	});
});

/*
 * Presets (#151): `sets` on a select option. Every manifest here is written by hand from the rules in
 * validatePresets' comment, so each test breaks exactly one of them.
 */
describe("validateManifest: presets on a select", () => {
	const presets = () => ({
		...good(),
		inputs: [
			{
				id: "stack",
				type: "select",
				label: "Library",
				default: "a",
				options: [
					{ value: "a", label: "Library A", sets: { read: 30, retries: 2 } },
					{ value: "b", label: "Library B", sets: { read: 60, retries: 3 } },
					{ value: "custom", label: "Custom" },
				],
			},
			{ id: "read", type: "number", label: "Read timeout", default: 30, min: 0, max: 600 },
			{ id: "retries", type: "number", label: "Retries", default: 2, min: 0, max: 10 },
			{ id: "mode", type: "select", label: "Mode", default: "fast", options: [{ value: "fast", label: "Fast" }, { value: "exact", label: "Exact" }] },
			{ id: "note", type: "text", label: "Note", default: "", maxLength: 4 },
		],
	});
	const presetFails = (mutate: (inputs: Record<string, any>[]) => void, field: string, contains: string) => {
		const m = presets();
		mutate(m.inputs as Record<string, any>[]);
		assert.throws(
			() => validateManifest(m),
			(error: unknown) => {
				assert.ok(error instanceof ManifestError, `expected a ManifestError, got ${error}`);
				assert.equal(error.field, field);
				assert.match(error.message, new RegExp(contains, "i"));
				return true;
			},
		);
	};

	it("accepts presets that name later inputs, plus an option without one", () => {
		const m = validateManifest(presets());
		const stack = m.inputs[0];
		assert.equal(stack?.type, "select");
		if (stack?.type === "select") assert.deepEqual(stack.options[1]?.sets, { read: 60, retries: 3 });
	});

	it("accepts a select whose options all carry presets, with no Custom", () => {
		const m = presets();
		(m.inputs[0] as { options: unknown[] }).options.pop();
		assert.equal(validateManifest(m).inputs.length, 5);
	});

	it("accepts a preset that sets an ordinary select, a text and a number together", () => {
		const m = presets();
		(m.inputs[0] as { options: Record<string, unknown>[] }).options[1]!.sets = { read: 60, mode: "exact", note: "slow" };
		assert.equal(validateManifest(m).inputs.length, 5);
	});

	// The sample rules, reached through the shared checker, one arm each.
	it("rejects a preset naming an input that does not exist, and lists the real ones", () => {
		presetFails((i) => { i[0]!.options[1].sets = { raed: 60 }; }, "inputs[0].options[1].sets.raed", "names no input.*stack, read, retries, mode, note");
	});
	it("rejects a preset number outside its input's range, rather than clamping it", () => {
		presetFails((i) => { i[0]!.options[1].sets = { read: 900 }; }, "inputs[0].options[1].sets.read", "outside.*A preset is not a keystroke");
	});
	it("rejects a preset value of the wrong type", () => {
		presetFails((i) => { i[0]!.options[1].sets = { retries: "3" }; }, "inputs[0].options[1].sets.retries", "finite number");
	});
	it("rejects a preset select value that is not one of that select's options", () => {
		presetFails((i) => { i[0]!.options[1].sets = { mode: "quick" }; }, "inputs[0].options[1].sets.mode", "option values: fast, exact");
	});
	it("rejects a preset string over its input's maxLength", () => {
		presetFails((i) => { i[0]!.options[1].sets = { note: "too long" }; }, "inputs[0].options[1].sets.note", "maxLength of 4");
	});
	it("rejects a preset that sets nothing", () => {
		presetFails((i) => { i[0]!.options[1].sets = {}; }, "inputs[0].options[1].sets", "sets no values");
	});
	it("rejects `sets` that is not an object", () => {
		presetFails((i) => { i[0]!.options[1].sets = [60]; }, "inputs[0].options[1].sets", "must be an object");
	});

	// What a preset adds.
	it("rejects a preset naming its own select", () => {
		presetFails((i) => { i[0]!.options[1].sets = { stack: "a", read: 60 }; }, "inputs[0].options[1].sets.stack", "own select");
	});
	it("rejects a preset naming another select that has presets", () => {
		presetFails((i) => {
			i[3]!.options[1].sets = { retries: 5 };
			i[0]!.options[1].sets = { read: 60, mode: "exact" };
		}, "inputs[0].options[1].sets.mode", "presets of its own");
	});
	it("rejects two options of one select with identical presets, whatever the key order", () => {
		presetFails((i) => { i[0]!.options[1].sets = { retries: 2, read: 30 }; }, "inputs[0].options[1].sets", String.raw`matches inputs\[0\]\.options\[0\]\.sets`);
	});
	it("rejects a default option whose preset disagrees with the inputs' defaults", () => {
		presetFails((i) => { i[0]!.options[0].sets = { read: 45, retries: 2 }; }, "inputs[0].options[0].sets.read", "defaults to 30");
	});
	it("accepts a non-default option whose preset differs from the defaults, which is the point of one", () => {
		const m = presets();
		m.inputs[0] = { ...(m.inputs[0] as object), default: "custom" } as (typeof m.inputs)[0];
		(m.inputs[0] as { options: Record<string, unknown>[] }).options[0]!.sets = { read: 45, retries: 2 };
		assert.equal(validateManifest(m).inputs.length, 5);
	});
	it("refuses `sets` written on the input instead of an option, and says where it belongs", () => {
		presetFails((i) => { i[1]!.sets = { retries: 1 }; }, "inputs[1].sets", "belongs in an entry of a select's `options`");
	});
});

// Textarea highlighting (#153): `lang` names the language passed to the host's highlight hook.
describe("validateManifest: lang on a textarea", () => {
	const area = { id: "machine", type: "textarea", label: "Your state machine", default: "" };

	it("accepts a lang on a textarea", () => {
		const m = validateManifest({ ...good(), inputs: [{ ...area, lang: "json" }] });
		const input = m.inputs[0];
		assert.equal(input?.type === "textarea" ? input.lang : undefined, "json");
	});
	it("refuses lang on any other input, which nothing would paint", () => {
		failsWith((m) => { m.inputs = [{ id: "name", type: "text", label: "Name", default: "", lang: "json" }]; }, "inputs[0].lang", "only a textarea");
	});
	it("refuses a lang that is not a single word", () => {
		failsWith((m) => { m.inputs = [{ ...area, lang: "state machine" }]; }, "inputs[0].lang", "no spaces");
		failsWith((m) => { m.inputs = [{ ...area, lang: "" }]; }, "inputs[0].lang", "no spaces");
		failsWith((m) => { m.inputs = [{ ...area, lang: 7 }]; }, "inputs[0].lang", "no spaces");
	});
	it("refuses lang at the top level of the manifest, and says where it belongs", () => {
		failsWith((m) => { m.lang = "json"; }, "lang", "belongs in an entry of `inputs`");
	});
});

// The opt-out from the runtime's Reset control (#208).
describe("validateManifest: reset", () => {
	it("accepts reset: false and reset: true, and leaves it absent when absent", () => {
		assert.equal(validateManifest({ ...good(), reset: false }).reset, false);
		assert.equal(validateManifest({ ...good(), reset: true }).reset, true);
		assert.equal(validateManifest(good()).reset, undefined, "no default is written in");
	});
	it("refuses a reset that is not a boolean, which a host would read as true", () => {
		failsWith((m) => { m.reset = "no"; }, "reset", "must be a boolean");
	});
	it("refuses reset on an input, and says where it belongs", () => {
		failsWith((m) => { m.inputs = [{ id: "n", type: "number", label: "N", default: 1, min: 0, max: 2, reset: false }]; }, "inputs[0].reset", "the top level of the manifest");
	});
});

// The rest of an input's help, behind a disclosure (#215).
describe("validateManifest: details on an input", () => {
	const name = { id: "name", type: "text", label: "Name", default: "" };

	it("accepts details on any input, with or without a description", () => {
		const m = validateManifest({ ...good(), inputs: [{ ...name, description: "Short.", details: "- Long\n- Longer" }, { id: "on", type: "toggle", label: "On", default: false, details: "Why." }] });
		assert.deepEqual(m.inputs.map((i) => i.details), ["- Long\n- Longer", "Why."]);
	});
	it("refuses details that are not a non-empty string, which would draw a disclosure with nothing in it", () => {
		failsWith((m) => { m.inputs = [{ ...name, details: "" }]; }, "inputs[0].details", "non-empty string");
		failsWith((m) => { m.inputs = [{ ...name, details: ["a"] }]; }, "inputs[0].details", "non-empty string");
	});
});

// A name for one input, for host stylesheets (#224), as a result part has.
describe("validateManifest: role on an input", () => {
	const name = { id: "name", type: "text", label: "Name", default: "" };

	it("accepts a role on any input, and leaves it as written", () => {
		const m = validateManifest({ ...good(), inputs: [{ ...name, role: "credential" }, { id: "on", type: "toggle", label: "On", default: false, role: "advanced" }] });
		assert.deepEqual(m.inputs.map((i) => i.role), ["credential", "advanced"]);
	});
	it("refuses a role that is not a non-empty string, which no selector could match", () => {
		failsWith((m) => { m.inputs = [{ ...name, role: "" }]; }, "inputs[0].role", "non-empty string");
		failsWith((m) => { m.inputs = [{ ...name, role: 3 }]; }, "inputs[0].role", "non-empty string");
	});
});

// Keeping an input out of a host's links (#211): a hint on any input type, and only a boolean.
describe("validateManifest: share on an input", () => {
	const inputs = [
		{ id: "user", type: "text", label: "User", default: "" },
		{ id: "body", type: "textarea", label: "Body", default: "" },
		{ id: "n", type: "number", label: "Count", default: 1, min: 0, max: 10 },
		{ id: "mode", type: "select", label: "Mode", default: "a", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
		{ id: "on", type: "toggle", label: "On", default: false },
	];

	it("accepts share: false and share: true on every input type, and leaves it absent when absent", () => {
		for (const share of [false, true]) {
			const m = validateManifest({ ...good(), inputs: inputs.map((i) => ({ ...i, share })) });
			assert.deepEqual(m.inputs.map((i) => i.share), [share, share, share, share, share]);
		}
		const plain = validateManifest({ ...good(), inputs });
		assert.deepEqual(plain.inputs.map((i) => i.share), [undefined, undefined, undefined, undefined, undefined], "no default is written in");
	});
	it("refuses a share that is not a boolean, which a host would read as true", () => {
		failsWith((m) => { m.inputs = [{ ...inputs[0], share: "no" }]; }, "inputs[0].share", "must be true or false");
		failsWith((m) => { m.inputs = [{ ...inputs[0], share: 0 }]; }, "inputs[0].share", "must be true or false");
	});
	it("refuses share at the top level of the manifest, and says where it belongs", () => {
		failsWith((m) => { m.share = false; }, "share", "belongs in an entry of `inputs`");
	});
});

describe("validateManifest: link targets", () => {
	const withHref = (href: string) => (m: Record<string, unknown>) => {
		m.links = [{ label: "More", href }];
	};

	it("accepts http, https, mailto and relative links", () => {
		for (const href of ["https://example.com/a?b=c#d", "http://example.com", "mailto:someone@example.com", "/tools/other", "other", "#section", "?q=1", "//example.com/x"]) {
			const m = good() as unknown as Record<string, unknown>;
			withHref(href)(m);
			assert.doesNotThrow(() => validateManifest(m), href);
		}
	});

	/*
	 * Each of these resolves to `javascript:` in a browser. The last four were written by hand from the WHATWG URL
	 * parser's rules, which strip tab and newline anywhere and leading C0 controls and space, and each was
	 * measured getting past a check that matched the scheme as text.
	 */
	for (const href of ["javascript:alert(1)", "JavaScript:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)", " javascript:alert(1)", "\u0000javascript:alert(1)"]) {
		it(`refuses ${JSON.stringify(href)}`, () => failsWith(withHref(href), "links[0].href", "http, https or mailto"));
	}

	it("refuses the other schemes that run or embed content", () => {
		for (const href of ["data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "blob:https://example.com/x", "file:///etc/passwd"]) {
			failsWith(withHref(href), "links[0].href", "http, https or mailto");
		}
	});

	it("refuses a link with a space in it, which a browser would quietly reinterpret", () => {
		failsWith(withHref("https://example.com/a b"), "links[0].href", "no spaces");
	});
});

// A tool's own grammar for a textarea language (#163): data only, capped, and never a pattern.
describe("validateManifest: grammar on a textarea", () => {
	const area = { id: "machine", type: "textarea", label: "Machine", default: "", lang: "doors" };
	const full = { keywords: ["state", "on"], comment: "#", operators: ["->", ":"], strings: "\"'" };
	const withGrammar = (grammar: unknown, extra: Record<string, unknown> = {}) => (m: Record<string, unknown>) => {
		m.inputs = [{ ...area, ...extra, grammar }];
	};

	it("accepts every part of a grammar, and any one of them alone", () => {
		const m = validateManifest({ ...good(), inputs: [{ ...area, grammar: full }] });
		const input = m.inputs[0];
		assert.deepEqual(input?.type === "textarea" ? input.grammar : undefined, full);
		for (const key of Object.keys(full)) {
			assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [{ ...area, grammar: { [key]: full[key as keyof typeof full] } }] }), key);
		}
	});
	it("refuses a grammar off a textarea, or without the lang it is the notation for", () => {
		failsWith((m) => { m.inputs = [{ id: "name", type: "text", label: "Name", default: "", lang: "doors", grammar: full }]; }, "inputs[0].lang", "only a textarea");
		failsWith(withGrammar(full, { lang: undefined }), "inputs[0].grammar", "needs a lang");
	});
	it("refuses a pattern by name, and says why", () => {
		failsWith(withGrammar({ ...full, pattern: "(a+)+$" }), "inputs[0].grammar.pattern", "no patterns: a regular expression");
		failsWith(withGrammar({ regex: "\\w+" }), "inputs[0].grammar.regex", "could hang the page");
	});
	it("refuses an empty grammar", () => {
		failsWith(withGrammar({}), "inputs[0].grammar", "omit `grammar`");
	});
	it("caps the keyword list at 64 words of 32 characters, made of word characters", () => {
		const words = Array.from({ length: 65 }, (_, i) => `k${i}`);
		failsWith(withGrammar({ keywords: words }), "inputs[0].grammar.keywords", "1 to 64 entries, got 65");
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [{ ...area, grammar: { keywords: words.slice(0, 64) } }] }));
		failsWith(withGrammar({ keywords: ["x".repeat(33)] }), "inputs[0].grammar.keywords[0]", "1 to 32 characters");
		failsWith(withGrammar({ keywords: ["two words"] }), "inputs[0].grammar.keywords[0]", "letters, digits and _");
		failsWith(withGrammar({ keywords: ["on", "on"] }), "inputs[0].grammar.keywords[1]", "repeats");
		failsWith(withGrammar({ keywords: [] }), "inputs[0].grammar.keywords", "1 to 64");
	});
	it("takes operators, a comment prefix and string delimiters as short ASCII punctuation only", () => {
		failsWith(withGrammar({ operators: ["and"] }), "inputs[0].grammar.operators[0]", "ASCII punctuation");
		failsWith(withGrammar({ operators: ["=====" ] }), "inputs[0].grammar.operators[0]", "1 to 4 characters");
		failsWith(withGrammar({ operators: Array.from({ length: 33 }, () => "+") }), "inputs[0].grammar.operators", "1 to 32 entries");
		failsWith(withGrammar({ comment: "rem" }), "inputs[0].grammar.comment", "ASCII punctuation");
		failsWith(withGrammar({ comment: "# " }), "inputs[0].grammar.comment", "ASCII punctuation");
		failsWith(withGrammar({ strings: "\"\"" }), "inputs[0].grammar.strings", "different");
		failsWith(withGrammar({ strings: "q" }), "inputs[0].grammar.strings", "ASCII punctuation");
	});
});

describe("validateManifest: a segmented select (contract 9, #203)", () => {
	const order = (extra: Record<string, unknown> = {}) => ({
		id: "order",
		type: "select",
		label: "Byte order",
		default: "little",
		options: [{ value: "little", label: "Little-endian" }, { value: "big", label: "Big-endian" }],
		...extra,
	});
	it("accepts control: segmented on a select", () => {
		const m = validateManifest({ ...good(), inputs: [order({ control: "segmented" })] });
		const input = m.inputs[0];
		assert.ok(input?.type === "select" && input.control === "segmented");
	});
	it("refuses any other control on a select, and segmented on a number", () => {
		failsWith((m) => { m.inputs = [order({ control: "slider" })]; }, "inputs[0].control", 'must be "segmented" when present, got "slider"');
		failsWith((m) => { m.inputs = [order({ control: "tabs" })]; }, "inputs[0].control", 'got "tabs"');
		failsWith((m) => { m.inputs = [{ id: "n", type: "number", label: "N", default: 1, min: 0, max: 10, control: "segmented" }]; }, "inputs[0].control", "slider");
	});
});

describe("validateManifest: a date input (contract 9, #203)", () => {
	const captured = (extra: Record<string, unknown> = {}) => ({
		id: "captured",
		type: "date",
		label: "Captured at",
		mode: "datetime",
		default: "2026-10-25T14:30",
		min: "2020-01-01T00:00",
		max: "2026-10-25T23:59",
		...extra,
	});
	const withDate = (extra: Record<string, unknown>) => (m: Record<string, unknown>) => { m.inputs = [captured(extra)]; };

	it("accepts each mode with a default, and min and max, in its own format", () => {
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [captured()] }));
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [{ id: "day", type: "date", label: "Day", default: "2024-02-29" }] }), "mode defaults to date");
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [{ id: "at", type: "date", label: "At", mode: "time", default: "09:30", min: "09:00", max: "17:00" }] }));
	});
	it("refuses a value that does not parse in the mode, naming the field and the format", () => {
		failsWith(withDate({ default: "2026-10-25" }), "inputs[0].default", 'must be written YYYY-MM-DDTHH:MM in mode "datetime", got "2026-10-25"');
		failsWith(withDate({ mode: "date", default: "2026-02-30", min: undefined, max: undefined }), "inputs[0].default", "YYYY-MM-DD");
		failsWith(withDate({ mode: "time", default: "24:00", min: undefined, max: undefined }), "inputs[0].default", 'HH:MM in mode "time"');
		failsWith(withDate({ min: "2020-01-01" }), "inputs[0].min", "YYYY-MM-DDTHH:MM");
		failsWith(withDate({ max: 2026 }), "inputs[0].max", "got 2026");
		failsWith(withDate({ mode: "week" }), "inputs[0].mode", 'one of "date", "time", "datetime"');
	});
	it("holds min to default to max", () => {
		failsWith(withDate({ default: "2019-12-31T23:59" }), "inputs[0].default", "Captured at must be on or after 2020-01-01T00:00, got 2019-12-31T23:59");
		failsWith(withDate({ default: "2026-10-26T00:00" }), "inputs[0].default", "on or before 2026-10-25T23:59, got 2026-10-26T00:00");
		failsWith(withDate({ min: "2027-01-01T00:00", default: "2027-01-01T00:00" }), "inputs[0].default", "on or before 2026-10-25T23:59");
	});
	it("refuses mode on any other input", () => {
		failsWith((m) => { m.inputs = [{ id: "name", type: "text", label: "Name", default: "", mode: "date" }]; }, "inputs[0].mode", "only a date");
	});
	it("checks a sample and a preset like a reader's value, so neither ships a date the form refuses", () => {
		const m = { ...good(), inputs: [captured()], samples: [{ label: "Late", input: { captured: "2026-11-02T09:30" } }] };
		assert.throws(() => validateManifest(m), /samples\[0\]\.input\.captured: Captured at must be on or before 2026-10-25T23:59, got 2026-11-02T09:30\./);
		assert.throws(() => validateManifest({ ...m, samples: [{ label: "Bad", input: { captured: 5 } }] }), /must be a date and time as YYYY-MM-DDTHH:MM, got 5/);
		assert.doesNotThrow(() => validateManifest({ ...m, samples: [{ label: "Early", input: { captured: "2020-01-01T00:00" } }] }));
	});
});

describe("validateManifest: a colour input (contract 9, #203)", () => {
	const accent = (value: unknown) => (m: Record<string, unknown>) => { m.inputs = [{ id: "accent", type: "color", label: "Highlight colour", default: value }]; };
	it("accepts a lowercase #rrggbb default", () => {
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [{ id: "accent", type: "color", label: "Highlight colour", default: "#1f5aa8" }] }));
	});
	it("refuses any other default: uppercase, shorthand, alpha, a name", () => {
		failsWith(accent("#1F5AA8"), "inputs[0].default", 'Highlight colour must be a #rrggbb colour, got "#1F5AA8"');
		failsWith(accent("#15a"), "inputs[0].default", "#rrggbb");
		failsWith(accent("#1f5aa8ff"), "inputs[0].default", "#rrggbb");
		failsWith(accent("blue"), "inputs[0].default", '"blue"');
		failsWith(accent(undefined), "inputs[0].default", "got undefined");
	});
	it("holds a sample to the same form", () => {
		const m = { ...good(), inputs: [{ id: "accent", type: "color", label: "Highlight colour", default: "#1f5aa8" }], samples: [{ label: "Red", input: { accent: "#f00" } }] };
		assert.throws(() => validateManifest(m), /samples\[0\]\.input\.accent: Highlight colour must be a #rrggbb colour, got "#f00"\./);
	});
});

describe("validateManifest: a secret input (contract 9, #203)", () => {
	const token = (extra: Record<string, unknown> = {}) => ({ id: "token", type: "secret", label: "API token", minLength: 16, maxLength: 64, ...extra });
	const withToken = (extra: Record<string, unknown>) => (m: Record<string, unknown>) => { m.inputs = [token(extra)]; };
	it("accepts a secret with no default, and with no bounds at all", () => {
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [token()] }));
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [{ id: "token", type: "secret", label: "Token" }] }));
	});
	// Any value, an empty one too: a manifest is published, so whatever it holds every reader has.
	it("refuses a default, even an empty one", () => {
		failsWith(withToken({ default: "tb_live_9f2c7a41e08b5d36" }), "inputs[0].default", "a secret has no default");
		failsWith(withToken({ default: "" }), "inputs[0].default", "every reader");
	});
	it("refuses a sample or a preset that sets it", () => {
		const m = { ...good(), inputs: [token()], samples: [{ label: "Mine", input: { token: "tb_live_9f2c7a41e08b5d36" } }] };
		assert.throws(() => validateManifest(m), /samples\[0\]\.input\.token: is a secret, which a manifest may not set/);
		const preset = {
			...good(),
			inputs: [{ id: "env", type: "select", label: "Env", default: "dev", options: [{ value: "dev", label: "Dev" }, { value: "live", label: "Live", sets: { token: "tb_live_9f2c7a41e08b5d36" } }] }, token()],
		};
		assert.throws(() => validateManifest(preset), /inputs\[0\]\.options\[1\]\.sets\.token: is a secret/);
	});
	it("holds minLength and maxLength to positive whole numbers, the smaller first", () => {
		failsWith(withToken({ minLength: 0 }), "inputs[0].minLength", "a whole number above 0, got 0");
		failsWith(withToken({ maxLength: "64" }), "inputs[0].maxLength", 'got "64"');
		failsWith(withToken({ minLength: 65 }), "inputs[0].minLength", "65 is above maxLength 64");
	});
	it("refuses minLength on any other input", () => {
		failsWith((m) => { m.inputs = [{ id: "name", type: "text", label: "Name", default: "", minLength: 2 }]; }, "inputs[0].minLength", "only a secret");
	});
});

/*
 * The messages a reader sees when the runtime refuses a value before `run` (#203), written from the mockup by
 * hand: the label, what was wrong, and what arrived.
 */
describe("inputProblem", () => {
	const at = { id: "captured", type: "date", label: "Captured at", mode: "datetime", default: "2026-10-25T14:30", min: "2020-01-01T00:00", max: "2026-10-25T23:59" } as const;
	it("says what is wrong with a date, time or both, naming the input", () => {
		assert.equal(inputProblem(at, "2026-11-02T09:30"), "Captured at must be on or before 2026-10-25T23:59, got 2026-11-02T09:30.");
		assert.equal(inputProblem(at, "2019-06-01T08:00"), "Captured at must be on or after 2020-01-01T00:00, got 2019-06-01T08:00.");
		assert.equal(inputProblem(at, ""), "Captured at needs a date and time, as YYYY-MM-DDTHH:MM.");
		assert.equal(inputProblem(at, "2026-10-25 14:30"), 'Captured at must be a date and time as YYYY-MM-DDTHH:MM, got "2026-10-25 14:30".');
		assert.equal(inputProblem({ id: "d", type: "date", label: "Day", default: "2024-02-29" }, "2025-02-29"), 'Day must be a date as YYYY-MM-DD, got "2025-02-29".');
		assert.equal(inputProblem({ id: "t", type: "date", label: "Start", mode: "time", default: "09:00" }, ""), "Start needs a time, as HH:MM.");
	});
	it("says a colour is not six hex digits, in the mockup's words", () => {
		const accent = { id: "accent", type: "color", label: "Highlight colour", default: "#1f5aa8" } as const;
		assert.equal(inputProblem(accent, "#1f5ag8"), 'Highlight colour must be a #rrggbb colour, got "#1f5ag8".');
		assert.equal(inputProblem(accent, "#1f5aa8"), undefined);
	});
	it("says a secret is too short, counting what arrived, and never quoting it", () => {
		const token = { id: "token", type: "secret", label: "API token", minLength: 16 } as const;
		assert.equal(inputProblem(token, "tb_live_9f2"), "API token must be at least 16 characters, got 11.");
		assert.equal(inputProblem(token, ""), "API token must be at least 16 characters, got 0.");
		assert.equal(inputProblem(token, "tb_live_9f2c7a41"), undefined);
		assert.equal(inputProblem({ id: "token", type: "secret", label: "Token" }, ""), undefined, "with no minLength, empty is a value");
	});
	it("says a number is outside its range, or is not one, rather than leaving it to a clamp (#262)", () => {
		const loss = { id: "loss", type: "number", label: "Packet loss", default: 1, min: 0, max: 99 } as const;
		assert.equal(inputProblem(loss, 999), "Packet loss must be between 0 and 99, got 999.");
		assert.equal(inputProblem(loss, -1), "Packet loss must be between 0 and 99, got -1.");
		assert.equal(inputProblem(loss, ""), "Packet loss needs a number between 0 and 99.");
		assert.equal(inputProblem(loss, "1e"), "Packet loss needs a number between 0 and 99.");
		assert.equal(inputProblem(loss, 0), undefined);
		assert.equal(inputProblem(loss, 99), undefined);
		assert.equal(inputProblem(loss, 12.5), undefined, "step is the arrow keys' increment, not a rule");
	});
	it("says which row of a rows input holds a number cell out of range, or an empty one", () => {
		const limits = {
			id: "limits",
			type: "rows",
			label: "Limits",
			maxRows: 8,
			columns: [
				{ id: "path", type: "text", label: "Path" },
				{ id: "limit", type: "number", label: "Limit", min: 1, max: 10000 },
			],
			default: [],
		} as const;
		assert.equal(inputProblem(limits, [{ path: "/a", limit: 5 }, { path: "/b", limit: 9999999 }]), "Limits, row 2: Limit must be between 1 and 10000, got 9999999.");
		assert.equal(inputProblem(limits, [{ path: "/a", limit: "" }]), "Limits, row 1: Limit needs a number between 1 and 10000.");
		assert.equal(inputProblem(limits, [{ path: "/a", limit: 10000 }]), undefined);
	});
	it("finds nothing in a good value, or in an input the form already holds to its rules", () => {
		assert.equal(inputProblem(at, "2026-10-25T23:59"), undefined);
		assert.equal(inputProblem(at, "2020-01-01T00:00"), undefined);
		assert.equal(inputProblem({ id: "t", type: "toggle", label: "T", default: false }, true), undefined);
	});
});

describe("validateManifest: a multiselect (contract 9, #204)", () => {
	const types = (extra: Record<string, unknown> = {}) => ({
		id: "types",
		type: "multiselect",
		label: "Record types",
		default: ["A", "AAAA"],
		options: ["A", "AAAA", "MX", "TXT"].map((value) => ({ value, label: value })),
		...extra,
	});
	const withTypes = (extra: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) => (m: Record<string, unknown>) => {
		m.inputs = [types(extra)];
		Object.assign(m, rest);
	};

	it("accepts options, a default list, min, max and either control", () => {
		const m = validateManifest({ ...good(), inputs: [types({ min: 1, max: 3, control: "chips" })] });
		const input = m.inputs[0];
		assert.ok(input?.type === "multiselect");
		assert.deepEqual(input.default, ["A", "AAAA"]);
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [types({ control: "checkboxes" })] }));
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [types({ default: [] })] }), "no min means none chosen is allowed");
	});

	it("holds the options to a select's rules, and refuses a preset on one", () => {
		failsWith(withTypes({ options: [{ value: "A", label: "A" }], default: [] }), "inputs[0].options", "at least two options");
		failsWith(withTypes({ options: [{ value: "A", label: "A" }, { value: "A", label: "Also A" }], default: [] }), "inputs[0].options", "unique");
		failsWith(withTypes({ options: [{ value: "A", label: "A", sets: { value: 2 } }, { value: "MX", label: "MX" }], default: [] }), "inputs[0].options[0].sets", "several at once");
	});

	it("needs a default that is a list of its option values, each once", () => {
		failsWith(withTypes({ default: "A" }), "inputs[0].default", "list of option values");
		failsWith(withTypes({ default: ["A", "SOA"] }), "inputs[0].default[1]", '"SOA" is not one of the options');
		failsWith(withTypes({ default: ["A", "MX", "A"] }), "inputs[0].default[2]", String.raw`already chosen at inputs\[0\].default\[0\]`);
	});

	it("bounds min and max by each other and by the options, and the default by both", () => {
		failsWith(withTypes({ min: 3, max: 2 }), "inputs[0].min", String.raw`min \(3\) is above max \(2\)`);
		failsWith(withTypes({ max: 5 }), "inputs[0].max", String.raw`max \(5\) is more than the 4 options`);
		failsWith(withTypes({ max: 0, default: [] }), "inputs[0].max", "at least 1");
		failsWith(withTypes({ min: -1 }), "inputs[0].min", "whole number");
		failsWith(withTypes({ min: 1.5 }), "inputs[0].min", "whole number");
		failsWith(withTypes({ min: 3 }), "inputs[0].default", String.raw`2 chosen, fewer than min \(3\)`);
		failsWith(withTypes({ max: 1 }), "inputs[0].default", String.raw`2 chosen, more than max \(1\)`);
	});

	// The one rule a reader can break, by unticking the last box, so the runtime asks before Run.
	it("is refused before Run below min, naming the input", () => {
		const spec = types({ min: 1 }) as unknown as Parameters<typeof inputProblem>[0];
		assert.equal(inputProblem(spec, []), "Record types: pick at least one.");
		assert.equal(inputProblem(types({ min: 2 }) as unknown as Parameters<typeof inputProblem>[0], ["A"]), "Record types: pick at least 2.");
		assert.equal(inputProblem(spec, ["A"]), undefined);
	});

	it("takes checkboxes or chips as its control, and nothing else", () => {
		failsWith(withTypes({ control: "segmented" }), "inputs[0].control", 'must be "checkboxes" or "chips" when present, got "segmented"');
		failsWith((m) => { m.inputs = [{ id: "n", type: "number", label: "N", default: 1, min: 0, max: 10, control: "chips" }]; }, "inputs[0].control", "slider");
	});

	it("checks a sample's list as it checks the default", () => {
		const sample = (input: unknown) => withTypes({ min: 1, max: 3 }, { samples: [{ label: "Mail", input: { types: input } }] });
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [types({ min: 1, max: 3 })], samples: [{ label: "Mail", input: { types: ["MX", "TXT"] } }] }));
		failsWith(sample("MX"), "samples[0].input.types", "list of option values");
		failsWith(sample(["MX", "SOA"]), "samples[0].input.types[1]", '"SOA" is not one of the options');
		failsWith(sample([]), "samples[0].input.types", String.raw`0 chosen, fewer than min \(1\)`);
		failsWith(sample(["A", "AAAA", "MX", "TXT"]), "samples[0].input.types", String.raw`4 chosen, more than max \(3\)`);
	});

	it("lets a preset write a list, and compares the default option's list by its values", () => {
		const preset = (sets: unknown) => ({
			id: "profile",
			type: "select",
			label: "Profile",
			default: "web",
			options: [{ value: "web", label: "Web", sets: { types: sets } }, { value: "mail", label: "Mail", sets: { types: ["MX", "TXT"] } }, { value: "custom", label: "Custom" }],
		});
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [preset(["A", "AAAA"]), types()] }), "an equal list written anew is the default");
		failsWith((m) => { m.inputs = [preset(["A"]), types()]; }, "inputs[0].options[0].sets.types", String.raw`defaults to \["A","AAAA"\]`);
	});
});

describe("validateManifest: rows (contract 9, #204)", () => {
	const limits = (extra: Record<string, unknown> = {}) => ({
		id: "limits",
		type: "rows",
		label: "Limits",
		maxRows: 8,
		columns: [
			{ id: "path", type: "text", label: "Path", maxLength: 20 },
			{ id: "limit", type: "number", label: "Limit", min: 1, max: 10000, unit: "req/s" },
		],
		default: [{ path: "/api", limit: 500 }],
		...extra,
	});
	const withLimits = (extra: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) => (m: Record<string, unknown>) => {
		m.inputs = [limits(extra)];
		Object.assign(m, rest);
	};
	const column = (extra: Record<string, unknown>) => withLimits({ columns: [{ id: "c", type: "text", label: "C", ...extra }], default: [] });

	it("accepts columns of the four single-value types, maxRows, minRows and a default list of rows", () => {
		const columns = [
			{ id: "host", type: "text", label: "Host" },
			{ id: "port", type: "number", label: "Port", min: 1, max: 65535, step: 1 },
			{ id: "scheme", type: "select", label: "Scheme", options: [{ value: "https", label: "HTTPS" }, { value: "http", label: "HTTP" }] },
			{ id: "on", type: "toggle", label: "On" },
		];
		const m = validateManifest({ ...good(), inputs: [limits({ columns, minRows: 1, default: [{ host: "a", port: 443, scheme: "https", on: true }] })] });
		assert.ok(m.inputs[0]?.type === "rows");
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [limits({ default: [] })] }), "no rows is a default when minRows is 0");
	});

	it("needs maxRows, a whole number from 1 to 50, and minRows within it", () => {
		failsWith(withLimits({ maxRows: undefined }), "inputs[0].maxRows", "must declare maxRows");
		failsWith(withLimits({ maxRows: 51 }), "inputs[0].maxRows", "1 to 50");
		failsWith(withLimits({ maxRows: 2.5 }), "inputs[0].maxRows", "1 to 50");
		failsWith(withLimits({ minRows: 9 }), "inputs[0].minRows", String.raw`0 to maxRows \(8\)`);
	});

	it("takes one to four columns with unique ids", () => {
		failsWith(withLimits({ columns: [], default: [] }), "inputs[0].columns", "1 to 4 columns, got 0");
		const five = ["a", "b", "c", "d", "e"].map((id) => ({ id, type: "text", label: id }));
		failsWith(withLimits({ columns: five, default: [] }), "inputs[0].columns", "1 to 4 columns, got 5");
		failsWith(withLimits({ columns: [{ id: "a", type: "text", label: "A" }, { id: "a", type: "toggle", label: "B" }], default: [] }), "inputs[0].columns[1].id", String.raw`already used by inputs\[0\].columns\[0\]`);
	});

	it("holds a column to its type's rules, refuses a type that is not a single value, and keys an input has", () => {
		failsWith(column({ type: "textarea" }), "inputs[0].columns[0].type", 'must be one of "text", "number", "select", "toggle"');
		failsWith(column({ type: "number" }), "inputs[0].columns[0].min/max", "must declare min and max");
		failsWith(column({ type: "select", options: [{ value: "a", label: "A" }] }), "inputs[0].columns[0].options", "at least two options");
		failsWith(column({ type: "select", options: [{ value: "a", label: "A", sets: { value: 1 } }, { value: "b", label: "B" }] }), "inputs[0].columns[0].options[0].sets", "preset");
		failsWith(column({ default: "x" }), "inputs[0].columns[0].default", "the rows input's default");
		failsWith(column({ description: "x" }), "inputs[0].columns[0].description", "not part of a column");
	});

	it("checks every row of the default as the form would hold it", () => {
		failsWith(withLimits({ default: { path: "/api", limit: 5 } }), "inputs[0].default", "list of rows");
		failsWith(withLimits({ default: [{ path: "/api" }] }), "inputs[0].default[0]", 'has no "limit"');
		failsWith(withLimits({ default: [{ path: "/api", limit: 5, burst: 2 }] }), "inputs[0].default[0].burst", "names no column");
		failsWith(withLimits({ default: [{ path: "/api", limit: 20000 }] }), "inputs[0].default[0].limit", String.raw`outside "limit"'s min..max \(1..10000\)`);
		failsWith(withLimits({ default: [{ path: "/a-path-longer-than-twenty", limit: 5 }] }), "inputs[0].default[0].path", "maxLength of 20");
		failsWith(withLimits({ minRows: 2 }), "inputs[0].default", String.raw`1 row, fewer than minRows \(2\)`);
		failsWith(withLimits({ maxRows: 1, default: [{ path: "/a", limit: 1 }, { path: "/b", limit: 2 }] }), "inputs[0].default", String.raw`2 rows, more than maxRows \(1\)`);
	});

	it("checks a sample's rows as it checks the default", () => {
		assert.doesNotThrow(() => validateManifest({ ...good(), inputs: [limits()], samples: [{ label: "Two", input: { limits: [{ path: "/a", limit: 1 }, { path: "/b", limit: 2 }] } }] }));
		failsWith(withLimits({}, { samples: [{ label: "Bad", input: { limits: [{ path: "/a", limit: "many" }] } }] }), "samples[0].input.limits[0].limit", "finite number");
	});
});
