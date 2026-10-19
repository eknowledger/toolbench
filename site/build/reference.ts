/**
 * The reference pages, written at build time from the source rather than by hand, so a row cannot say
 * something the code does not.
 *
 *  - The attributes, their types, whether they are required, and their notes come from the SDK's own type
 *    declarations in `packages/sdk/src/types.ts`, the JSDoc a developer's editor shows.
 *  - The contract version an attribute arrived in comes from the SDK's version table, `LATER`.
 *  - Every validation message is produced by running `validateManifest` on a manifest broken in that one way.
 *  - Every example is an input a real tool in the repository declares.
 *
 * Each page is markdown, rendered by the same renderer as every other docs page.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

type Attr = { name: string; type: string; required: boolean; notes: string; fallback?: string };

/** `/** ... *\/` to one line of prose, with its `@default` taken out. */
function jsdoc(raw: string | undefined): { text: string; fallback?: string } {
	if (!raw) return { text: "" };
	const lines = raw.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim());
	const tag = lines.find((l) => l.startsWith("@default"));
	const text = lines
		.filter((l) => !l.startsWith("@"))
		.join(" ")
		.replace(/\s+/g, " ")
		// The Since column says this; in the notes it would be said twice.
		.replace(/\s*Contract version \d+\.?/g, "")
		.replace(/\s*\(#\d+\)/g, "")
		.trim();
	return { text, ...(tag ? { fallback: tag.replace("@default", "").trim() } : {}) };
}

/** The members of one `{ ... }` body in types.ts: each `name?: Type;` with the JSDoc above it. */
function members(body: string): Attr[] {
	const out: Attr[] = [];
	for (const m of body.matchAll(/(?:\/\*\*([\s\S]*?)\*\/\s*)?(\w+)(\?)?:\s*([^;]+);/g)) {
		const doc = jsdoc(m[1]);
		out.push({ name: m[2] ?? "", type: (m[4] ?? "").trim().replace(/\s+/g, " "), required: !m[3], notes: doc.text, ...(doc.fallback ? { fallback: doc.fallback } : {}) });
	}
	return out;
}

function block(source: string, start: string): string {
	const at = source.indexOf(start);
	if (at < 0) throw new Error(`reference: types.ts no longer has "${start}"`);
	let depth = 0;
	for (let i = source.indexOf("{", at); i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}" && --depth === 0) return source.slice(source.indexOf("{", at) + 1, i);
	}
	throw new Error(`reference: unbalanced braces after "${start}"`);
}

/** What the version table says about a key, with 1 for everything that was there from the start. */
async function since(): Promise<(key: string) => number> {
	const { LATER } = (await import(join(ROOT, "packages/sdk/src/features.ts"))) as { LATER: Record<string, number> };
	// A grammar's own keys arrived with `grammar` itself.
	return (key) => (key.startsWith("grammar.") ? (LATER["inputs.grammar"] ?? 1) : (LATER[key] ?? 1));
}

// The renderer keeps a pipe inside a code span as content, and the notes only ever have one there.
const cell = (text: string) => text.replace(/\n/g, " ");
const typeCell = (type: string) => `\`${type}\``;
const sinceCell = (v: number) => (v > 1 ? `**v${v}**` : "v1");

/** One manifest broken one way, and what the validator says about it. */
async function message(change: (m: Record<string, unknown>) => void): Promise<string> {
	const sdk = (await import(join(ROOT, "packages/sdk/src/index.ts"))) as { validateManifest(m: unknown): unknown };
	const m: Record<string, unknown> = {
		sdk: 7,
		id: "example",
		name: "Example",
		blurb: "An example.",
		version: "1.0.0",
		capabilities: ["pure"],
		runtime: { entry: "index.ts" },
		kinds: ["fields", "error"],
		inputs: [
			{ id: "n", type: "number", label: "Count", default: 5, min: 1, max: 10 },
			{ id: "mode", type: "select", label: "Mode", default: "fast", options: [{ value: "fast", label: "Fast" }, { value: "exact", label: "Exact" }] },
			{ id: "name", type: "text", label: "Name", default: "" },
		],
	};
	change(m);
	try {
		sdk.validateManifest(m);
	} catch (error) {
		return (error as Error).message;
	}
	throw new Error("reference: the validator accepted a manifest this page shows it refusing");
}

const input = (m: Record<string, unknown>, i: number) => (m.inputs as Record<string, unknown>[])[i] as Record<string, unknown>;

/** The rules a manifest's inputs are held to, each with the message an author gets. */
const RULES: { rule: string; change: (m: Record<string, unknown>) => void }[] = [
	{ rule: "A tool has at least one input", change: (m) => (m.inputs = []) },
	{ rule: "Input ids are unique", change: (m) => (input(m, 2).id = "n") },
	{ rule: "A number declares `min` and `max`", change: (m) => delete input(m, 0).max },
	{ rule: "`min` is below `max`", change: (m) => Object.assign(input(m, 0), { min: 10, max: 5, default: 7 }) },
	{ rule: "A number's default is within `min..max`", change: (m) => (input(m, 0).default = 90) },
	{ rule: "`control` is `\"slider\"` when present", change: (m) => (input(m, 0).control = "knob") },
	{ rule: "A select has two or more options", change: (m) => (input(m, 1).options = [{ value: "fast", label: "Fast" }]) },
	{ rule: "Option values are unique", change: (m) => (input(m, 1).options = [{ value: "fast", label: "Fast" }, { value: "fast", label: "Also fast" }]) },
	{ rule: "A select's default is one of its options", change: (m) => (input(m, 1).default = "slow") },
	{ rule: "`lang` only on a textarea", change: (m) => (input(m, 2).lang = "json") },
	{ rule: "`grammar` needs `lang` beside it", change: (m) => Object.assign(input(m, 2), { type: "textarea", grammar: { keywords: ["on"] } }) },
];

/** For each type: a real input from the repository to show, and the gallery card that runs one. */
const EXAMPLES: Record<string, { from: string; id: string; gallery?: string }> = {
	text: { from: "tools/regex-explainer", id: "pattern" },
	textarea: { from: "bench/fixtures/grammar-input", id: "machine", gallery: "grammar-input" },
	number: { from: "bench/fixtures/slider", id: "rtt", gallery: "slider" },
	select: { from: "bench/fixtures/presets", id: "stack", gallery: "presets" },
	toggle: { from: "bench/fixtures/styled-output", id: "" },
};

const SUMMARY: Record<string, string> = {
	text: "One line: a name, a pattern, an id",
	textarea: "Pasted data, a document, source in a notation",
	number: "A bounded quantity: a rate, a count, a size",
	select: "A choice from a short fixed list, or a preset that fills other inputs",
	toggle: "On or off",
};
const RECEIVES: Record<string, string> = {
	text: "string",
	textarea: "string",
	number: "number, clamped to `min..max`",
	select: "string, one of the option values",
	toggle: "boolean",
};

/** Two-space JSON with short arrays of plain values on one line, so a list reads as a list, not a column. */
function compact(value: unknown): string {
	return JSON.stringify(value, null, 2).replace(/\[\n\s*((?:"[^"\n]*"|[\d.-]+|true|false)(?:,\n\s*(?:"[^"\n]*"|[\d.-]+|true|false))*)\n\s*\]/g, (_, items: string) => `[${items.split(/,\n\s*/).join(", ")}]`);
}

function exampleInput(type: string): string {
	const ex = EXAMPLES[type];
	if (!ex) return "";
	const manifest = JSON.parse(read(`${ex.from}/tool.json`)) as { inputs: { id: string; type: string }[] };
	const found = manifest.inputs.find((i) => (ex.id ? i.id === ex.id : i.type === type));
	if (!found || found.type !== type) throw new Error(`reference: ${ex.from} has no ${type} input "${ex.id}" to show`);
	return `\`\`\`json\n${compact(found)}\n\`\`\`\n\nFrom \`${ex.from}/tool.json\`.${ex.gallery ? `\n\n<!-- site: gallery ${ex.gallery} -->` : ""}`;
}

export async function inputsReference(): Promise<string> {
	const types = read("packages/sdk/src/types.ts");
	const at = await since();
	const common = members(block(types, "interface InputBase"));
	const union = types.slice(types.indexOf("export type InputSpec ="), types.indexOf("/** One choice in a `select`. */"));
	const specs = union
		.split("| (InputBase & ")
		.slice(1)
		.map((part) => {
			const attrs = members(block(part, "{"));
			const type = (attrs.find((a) => a.name === "type")?.type ?? "").replace(/"/g, "");
			return { type, attrs: attrs.filter((a) => a.name !== "type") };
		});
	const option = members(block(types, "export interface SelectOption"));
	const grammar = members(block(types, "export interface TextareaGrammar"));

	const attrRow = (a: Attr, key: string) =>
		`| \`${a.name}\` | ${typeCell(a.type)} | ${a.required ? "**yes**" : "no"} | ${a.fallback ? `\`${a.fallback}\`` : ""} | ${sinceCell(at(key))} | ${cell(a.notes)} |`;
	const attrTable = (attrs: Attr[], prefix: string) =>
		["| Attribute | Type | Required | Default | Since | Notes |", "|---|---|---|---|---|---|", ...attrs.map((a) => attrRow(a, `${prefix}.${a.name}`))].join("\n");

	const out: string[] = [];
	out.push(
		"Each input becomes a labelled control on the form, with its `description` as the control's accessible description. Its value reaches `run(values)` under its `id`.",
		"",
		"## Types",
		"",
		"| Type | `run` receives | Required | Optional | Use it for |",
		"|---|---|---|---|---|",
		...specs.map((s) => {
			const req = s.attrs.filter((a) => a.required).map((a) => `\`${a.name}\``);
			const opt = s.attrs.filter((a) => !a.required).map((a) => `\`${a.name}\`${at(`inputs.${a.name}`) > 1 ? ` (v${at(`inputs.${a.name}`)})` : ""}`);
			// A select's presets live on its options, so the summary would otherwise say it has nothing optional.
			if (s.type === "select") for (const a of option.filter((o) => !o.required)) opt.push(`\`options[].${a.name}\` (v${at(`options.${a.name}`)})`);
			return `| [\`${s.type}\`](#${s.type}) | ${RECEIVES[s.type] ?? ""} | ${req.join(" ")} | ${opt.join(" ") || "none"} | ${SUMMARY[s.type] ?? ""} |`;
		}),
		"",
		"## Common attributes",
		"",
		"Every input type takes these.",
		"",
		attrTable(common, "inputs"),
	);
	for (const s of specs) {
		out.push("", `## ${s.type}`, "", `\`run\` receives ${RECEIVES[s.type]}. Takes the common attributes, plus:`, "", attrTable(s.attrs, "inputs"));
		if (s.type === "select") out.push("", "### Option attributes", "", "Each entry of `options`.", "", attrTable(option, "options"));
		if (s.type === "textarea") out.push("", "### Grammar attributes", "", "The keys of `grammar`. Each is optional, and a grammar needs at least one. Patterns are not allowed: a regular expression from a tool could hang the page it is on.", "", attrTable(grammar, "grammar"));
		out.push("", "### Example", "", exampleInput(s.type));
	}
	out.push("", "## Validation rules", "", "`validateManifest` checks these before anything runs. The message is exactly what an author gets.", "", "| Rule | Message |", "|---|---|");
	for (const r of RULES) out.push(`| ${r.rule} | \`${cell(await message(r.change))}\` |`);
	return out.join("\n");
}
