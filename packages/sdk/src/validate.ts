/**
 * Manifest validation, hand-written on purpose.
 *
 * A schema library would be shorter, but it would also be a runtime dependency of the one package
 * every tool author installs — and the error messages would be about JSON paths rather than about
 * tools. These messages name the field, say what was wrong, and say what to do instead, because the
 * person reading them is usually writing their first tool.
 *
 * ⚠️ The invariants at the bottom are the interesting part. They encode rules the rest of the system
 * relies on, so a bad combination fails here rather than three layers later:
 *
 *  - a compact card may only run a `pure` tool;
 *  - `timeoutMs` is meaningless on the main thread, so declaring it there is an error rather than a
 *    silently ignored field;
 *  - a tool may not declare an output kind this contract version cannot express.
 */
import {
	CAPABILITIES,
	type Capability,
	INPUT_TYPES,
	type InputSpec,
	type Manifest,
	OUTPUT_KINDS,
	type OutputKind,
} from "./types.ts";
import { SDK_CHANGELOG, SDK_VERSION, SUPPORTED_SDK_VERSIONS } from "./version.ts";

export class ManifestError extends Error {
	readonly field: string;
	constructor(field: string, message: string) {
		super(`${field}: ${message}`);
		this.name = "ManifestError";
		this.field = field;
	}
}

const ID = /^[a-z0-9][a-z0-9-]*$/;

function fail(field: string, message: string): never {
	throw new ManifestError(field, message);
}

function str(o: Record<string, unknown>, field: string, path: string): string {
	const v = o[field];
	if (typeof v !== "string" || v.length === 0) fail(`${path}${field}`, "must be a non-empty string");
	return v;
}

function optStr(o: Record<string, unknown>, field: string, path: string): string | undefined {
	if (o[field] === undefined) return undefined;
	return str(o, field, path);
}

function obj(v: unknown, path: string): Record<string, unknown> {
	if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "must be an object");
	return v as Record<string, unknown>;
}

function arr(v: unknown, path: string): unknown[] {
	if (!Array.isArray(v)) fail(path, "must be an array");
	return v;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
	if (typeof value !== "string" || !allowed.includes(value as T)) {
		fail(path, `must be one of ${allowed.map((a) => `"${a}"`).join(", ")}, got ${JSON.stringify(value)}`);
	}
	return value as T;
}

function validateInput(raw: unknown, path: string): InputSpec {
	const o = obj(raw, path);
	const id = str(o, "id", `${path}.`);
	if (!ID.test(id)) fail(`${path}.id`, `"${id}" must be lowercase letters, digits and hyphens`);
	str(o, "label", `${path}.`);
	optStr(o, "description", `${path}.`);
	optStr(o, "unit", `${path}.`);
	if (o.primary !== undefined && typeof o.primary !== "boolean") fail(`${path}.primary`, "must be a boolean");
	if (o.dir !== undefined) oneOf(o.dir, ["ltr", "auto"] as const, `${path}.dir`);
	const type = oneOf(o.type, INPUT_TYPES, `${path}.type`);

	switch (type) {
		case "text":
		case "textarea": {
			if (typeof o.default !== "string") fail(`${path}.default`, `a ${type} input needs a string default`);
			break;
		}
		case "number": {
			if (typeof o.default !== "number" || !Number.isFinite(o.default)) {
				fail(`${path}.default`, "a number input needs a finite number default");
			}
			if (typeof o.min !== "number" || typeof o.max !== "number") {
				fail(`${path}.min/max`, "a number input must declare min and max — they are the only guard against a runaway input");
			}
			if (o.min >= o.max) fail(`${path}.min`, `min (${o.min}) must be below max (${o.max})`);
			if (o.default < o.min || o.default > o.max) {
				fail(`${path}.default`, `default ${o.default} is outside min..max (${o.min}..${o.max})`);
			}
			break;
		}
		case "select": {
			const options = arr(o.options, `${path}.options`);
			if (options.length < 2) fail(`${path}.options`, "a select needs at least two options; with one, use a fixed value");
			const values = options.map((opt, i) => {
				const oo = obj(opt, `${path}.options[${i}]`);
				str(oo, "label", `${path}.options[${i}].`);
				return str(oo, "value", `${path}.options[${i}].`);
			});
			if (new Set(values).size !== values.length) fail(`${path}.options`, "option values must be unique");
			if (typeof o.default !== "string" || !values.includes(o.default)) {
				fail(`${path}.default`, `must be one of the option values: ${values.join(", ")}`);
			}
			break;
		}
		case "toggle": {
			if (typeof o.default !== "boolean") fail(`${path}.default`, "a toggle input needs a boolean default");
			break;
		}
	}
	return raw as InputSpec;
}

/**
 * Samples, checked against the inputs they claim to fill.
 *
 * ⚠️ Stricter than the runtime's typed-input path, on purpose. A reader's out-of-range number is
 * clamped, because refusing a keystroke leaves them with a form they cannot use. An author's
 * out-of-range sample is static data that CI reads before anyone sees it, so it can be an error naming
 * the field. Clamping it instead ships a button whose label says one thing and whose value says
 * another, and nobody would ever notice.
 *
 * The unknown-id check is the one that matters most: without it the button renders, does nothing, and
 * reports nothing.
 */
function validateSamples(raw: unknown, specs: InputSpec[]): void {
	const samples = arr(raw, "samples");
	if (samples.length === 0) fail("samples", "is empty; omit the key rather than declaring that there are no examples");
	const byId = new Map(specs.map((spec) => [spec.id, spec]));
	const labels: string[] = [];

	samples.forEach((sample, i) => {
		const at = `samples[${i}]`;
		const so = obj(sample, at);
		labels.push(str(so, "label", `${at}.`));
		const input = obj(so.input, `${at}.input`);
		const keys = Object.keys(input);
		if (keys.length === 0) fail(`${at}.input`, "sets no values; a sample that fills nothing is a button that does nothing");

		for (const key of keys) {
			const where = `${at}.input.${key}`;
			const spec = byId.get(key);
			if (!spec) fail(where, `names no input of this tool. Its inputs are: ${[...byId.keys()].join(", ")}`);
			const value = input[key];
			switch (spec.type) {
				case "text":
				case "textarea": {
					if (typeof value !== "string") fail(where, `must be a string, because "${key}" is a ${spec.type} input`);
					break;
				}
				case "number": {
					if (typeof value !== "number" || !Number.isFinite(value)) {
						fail(where, `must be a finite number, because "${key}" is a number input`);
					}
					if (value < spec.min || value > spec.max) {
						fail(where, `is ${value}, outside "${key}"'s min..max (${spec.min}..${spec.max}). A sample is not a keystroke: fix the example rather than relying on the clamp`);
					}
					break;
				}
				case "select": {
					const values = spec.options.map((option) => option.value);
					if (typeof value !== "string" || !values.includes(value)) {
						fail(where, `must be one of "${key}"'s option values: ${values.join(", ")}`);
					}
					break;
				}
				case "toggle": {
					if (typeof value !== "boolean") fail(where, `must be true or false, because "${key}" is a toggle`);
					break;
				}
			}
		}
	});

	if (new Set(labels).size !== labels.length) {
		fail("samples", `labels must be unique, got ${labels.join(", ")}. Two identical buttons in a row is a typo`);
	}
}

/**
 * Validate a manifest that has already been brought up to the current contract version.
 *
 * Call `upgradeManifest` first unless you know the manifest is current — this function deliberately
 * rejects an `sdk` it does not recognise rather than guessing.
 */
export function validateManifest(raw: unknown): Manifest {
	const o = obj(raw, "manifest");

	// --- the contract version, first, because it decides how to read everything else -------------
	if (typeof o.sdk !== "number" || !Number.isInteger(o.sdk)) {
		fail("sdk", `must be an integer contract version; this SDK speaks ${SUPPORTED_SDK_VERSIONS.join(", ")}`);
	}
	if (o.sdk > SDK_VERSION) {
		fail(
			"sdk",
			`this tool needs contract version ${o.sdk}, but this runtime only speaks up to ${SDK_VERSION}. ` +
				"Upgrade @toolbench/runtime, or lower the tool's sdk if it does not use the newer features.",
		);
	}
	if (!SUPPORTED_SDK_VERSIONS.includes(o.sdk)) {
		fail("sdk", `contract version ${o.sdk} is not one this SDK can read (${SUPPORTED_SDK_VERSIONS.join(", ")})`);
	}

	// --- identity ---------------------------------------------------------------------------------
	const id = str(o, "id", "");
	if (!ID.test(id)) fail("id", `"${id}" must be lowercase letters, digits and hyphens — it is also a directory name and a URL segment`);
	str(o, "name", "");
	const blurb = str(o, "blurb", "");
	if (blurb.length > 200) fail("blurb", `is ${blurb.length} characters; keep it under 200 so it works as a card line and a page description`);
	str(o, "version", "");
	if (o.status !== undefined) oneOf(o.status, ["live", "deprecated", "retired"] as const, "status");
	if (o.help !== undefined) optStr(o, "help", "");
	if (o.tags !== undefined) arr(o.tags, "tags").forEach((t, i) => { if (typeof t !== "string") fail(`tags[${i}]`, "must be a string"); });
	if (o.links !== undefined) {
		arr(o.links, "links").forEach((l, i) => {
			const lo = obj(l, `links[${i}]`);
			str(lo, "label", `links[${i}].`);
			str(lo, "href", `links[${i}].`);
		});
	}

	// --- capabilities -----------------------------------------------------------------------------
	const caps = arr(o.capabilities, "capabilities");
	if (caps.length === 0) fail("capabilities", `must declare at least one of ${CAPABILITIES.join(", ")}`);
	const capabilities = caps.map((c, i) => oneOf(c, CAPABILITIES, `capabilities[${i}]`)) as Capability[];

	// --- runtime ----------------------------------------------------------------------------------
	const runtime = obj(o.runtime, "runtime");
	str(runtime, "entry", "runtime.");
	const thread = runtime.thread === undefined ? "main" : oneOf(runtime.thread, ["main", "worker"] as const, "runtime.thread");

	// --- inputs -----------------------------------------------------------------------------------
	const inputs = arr(o.inputs, "inputs");
	if (inputs.length === 0) fail("inputs", "a tool needs at least one input; a tool with none is a constant");
	const specs = inputs.map((input, i) => validateInput(input, `inputs[${i}]`));
	const ids = specs.map((s) => s.id);
	if (new Set(ids).size !== ids.length) fail("inputs", `input ids must be unique, got ${ids.join(", ")}`);
	const primaries = specs.filter((s) => s.primary === true);
	if (primaries.length > 1) {
		fail("inputs", `only one input may be primary (a compact card shows exactly one), got ${primaries.map((p) => p.id).join(", ")}`);
	}
	if (o.samples !== undefined) validateSamples(o.samples, specs);

	// --- output kinds -----------------------------------------------------------------------------
	const kinds = arr(o.kinds, "kinds");
	if (kinds.length === 0) fail("kinds", "declare every output kind `run` can return, so a host can refuse a tool it cannot draw");
	const outputKinds = kinds.map((k, i) => oneOf(k, OUTPUT_KINDS, `kinds[${i}]`)) as OutputKind[];
	if (!outputKinds.includes("error")) {
		fail("kinds", 'must include "error" — every tool can be given bad input, and saying so is part of working correctly');
	}

	// --- card -------------------------------------------------------------------------------------
	const card = o.card === undefined ? "info" : oneOf(o.card, ["live", "info", "none"] as const, "card");
	if (o.cardFields !== undefined && (typeof o.cardFields !== "number" || o.cardFields < 1)) {
		fail("cardFields", "must be a positive number of fields");
	}
	if (o.autoRun !== undefined && typeof o.autoRun !== "boolean") fail("autoRun", "must be a boolean");

	// --- timeout ----------------------------------------------------------------------------------
	if (o.timeoutMs !== undefined) {
		if (typeof o.timeoutMs !== "number" || o.timeoutMs < 100 || o.timeoutMs > 30_000) {
			fail("timeoutMs", "must be between 100 and 30000 ms");
		}
	}

	/*
	 * --- the invariants ---------------------------------------------------------------------------
	 * These are the rules the rest of the system leans on. Failing here is the whole point: a bad
	 * combination becomes a manifest error the author sees immediately, rather than a subtle problem
	 * a reader finds later.
	 */
	if (card === "live" && !(capabilities.length === 1 && capabilities[0] === "pure")) {
		fail("card", 'only a "pure" tool may be a live card — a compact slot must not read files or call networks');
	}
	if (o.autoRun === true && thread === "worker") {
		fail(
			"autoRun",
			'is for tools that are instant, and a worker-mode tool is by definition not — it declared thread: "worker" ' +
				"because its running time depends on its input. Leave autoRun off and let the reader press Run.",
		);
	}
	if (thread === "main" && o.timeoutMs !== undefined) {
		fail(
			"timeoutMs",
			"is only meaningful with runtime.thread = \"worker\". On the main thread there is nothing to terminate, " +
				"so a timeout here would be a field that lies. Either move the tool to a worker or bound its input.",
		);
	}

	return {
		...(raw as Manifest),
		capabilities,
		inputs: specs,
		kinds: outputKinds,
		runtime: { ...runtime, entry: runtime.entry as string, thread },
		card,
		status: (o.status as Manifest["status"]) ?? "live",
	};
}

/** Human-readable summary of what a contract version offers. Used in error messages and docs. */
export function describeSdkVersion(version: number): string {
	return SDK_CHANGELOG[version] ?? `unknown contract version ${version}`;
}
