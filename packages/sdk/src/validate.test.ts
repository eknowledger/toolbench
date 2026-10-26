import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
