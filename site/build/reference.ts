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
function jsdoc(raw: string | undefined, firstParagraph = false): { text: string; fallback?: string } {
	if (!raw) return { text: "" };
	let lines = raw.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim());
	// A type's later paragraphs are the maintainer's reasons (⚠️ traps, history); the reader needs the first.
	if (firstParagraph) {
		while (lines[0] === "") lines.shift();
		const blank = lines.indexOf("");
		if (blank > 0) lines = lines.slice(0, blank);
	}
	const tag = lines.find((l) => l.startsWith("@default"));
	const text = lines
		.filter((l) => !l.startsWith("@"))
		.join(" ")
		.replace(/\s+/g, " ")
		// The Since column says this; in the notes it would be said twice.
		.replace(/\s*(?:Contract|Added in contract) version \d+\.?/g, "")
		// An inline object type's members arrive with their JSDoc already flattened to one line.
		.replace(/\s\*\s/g, " ")
		.replace(/\s*\(#\d+(?:, contract version \d+)?\)/g, "")
		.trim();
	return { text, ...(tag ? { fallback: tag.replace("@default", "").trim() } : {}) };
}

/**
 * The members of one `{ ... }` body in types.ts: each `name?: Type;` with the JSDoc above it. Depth-aware,
 * because a result's types nest: `link?: { chart: string; keys: ... };` is one member, not two.
 */
function members(body: string): Attr[] {
	const out: Attr[] = [];
	let i = 0;
	let doc: string | undefined;
	while (i < body.length) {
		if (body.startsWith("/**", i)) {
			const end = body.indexOf("*/", i);
			doc = body.slice(i + 3, end);
			i = end + 2;
			continue;
		}
		if (body.startsWith("//", i)) {
			i = body.indexOf("\n", i) + 1 || body.length;
			continue;
		}
		// A method, `progress(fraction: number, partial?: Output): void;`, is one member: its parameters are not.
		const method = /^(\w+)(\([^)]*\)):\s*([^;\n]+);?/.exec(body.slice(i));
		if (method) {
			const d = jsdoc(doc);
			out.push({ name: `${method[1]}${method[2]}`, type: (method[3] ?? "").trim(), required: true, notes: d.text });
			doc = undefined;
			i += method[0].length;
			continue;
		}
		// A name may be quoted, `"wide-toggle"?:`, when it is not an identifier.
		const head = /^"?([\w-]+)"?(\?)?:\s*/.exec(body.slice(i));
		if (!head) {
			i++;
			continue;
		}
		let j = i + head[0].length;
		let depth = 0;
		for (; j < body.length; j++) {
			const c = body[j];
			if (c === "{" || c === "(" || c === "[" || c === "<") depth++;
			// The `>` of an arrow, `() => Worker`, closes nothing.
			else if (c === "}" || c === ")" || c === "]" || (c === ">" && body[j - 1] !== "=")) depth--;
			else if ((c === ";" || c === "\n") && depth === 0) break;
		}
		const type = body.slice(i + head[0].length, j).trim().replace(/\s+/g, " ").replace(/;$/, "");
		const d = jsdoc(doc);
		out.push({ name: head[1] ?? "", type, required: !head[2], notes: d.text, ...(d.fallback ? { fallback: d.fallback } : {}) });
		doc = undefined;
		i = j + 1;
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

/**
 * An attribute table. The Default column appears only when some attribute has one: empty, it took a sixth of
 * the width and squeezed the Notes to a few words a line.
 */
function attributeTable(attrs: Attr[], sinceOf?: (a: Attr) => number): string {
	const withDefault = attrs.some((a) => a.fallback);
	// Since is a contract version, so a runtime API, which has none, leaves the column out.
	const columns = ["Attribute", "Type", "Required", ...(withDefault ? ["Default"] : []), ...(sinceOf ? ["Since"] : []), "Notes"];
	const row = (a: Attr) =>
		[`\`${a.name}\``, typeCell(a.type), a.required ? "**yes**" : "no", ...(withDefault ? [a.fallback ? `\`${a.fallback}\`` : ""] : []), ...(sinceOf ? [sinceCell(sinceOf(a))] : []), cell(a.notes)];
	return [columns, columns.map(() => "---"), ...attrs.map(row)].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

/** One manifest broken one way, and what the validator says about it. */
async function message(change: (m: Record<string, unknown>) => void): Promise<string> {
	const sdk = (await import(join(ROOT, "packages/sdk/src/index.ts"))) as { validateManifest(m: unknown): unknown };
	const m = baseManifest();
	change(m);
	try {
		sdk.validateManifest(m);
	} catch (error) {
		return (error as Error).message;
	}
	throw new Error("reference: the validator accepted a manifest this page shows it refusing");
}

/** A manifest that passes, so each rule can break exactly one thing. */
function baseManifest(): Record<string, unknown> {
	return {
		sdk: 9,
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
}

const input = (m: Record<string, unknown>, i: number) => (m.inputs as Record<string, unknown>[])[i] as Record<string, unknown>;

/** The rules a manifest's inputs are held to, each with the message an author gets. */
const RULES: { rule: string; change: (m: Record<string, unknown>) => void }[] = [
	{ rule: "A tool has at least one input", change: (m) => (m.inputs = []) },
	{ rule: "Input ids are unique", change: (m) => (input(m, 2).id = "n") },
	{ rule: "A number declares `min` and `max`", change: (m) => delete input(m, 0).max },
	{ rule: "`min` is below `max`", change: (m) => Object.assign(input(m, 0), { min: 10, max: 5, default: 7 }) },
	{ rule: "A number's default is within `min..max`", change: (m) => (input(m, 0).default = 90) },
	{ rule: "`control` on a number is `\"slider\"`", change: (m) => (input(m, 0).control = "knob") },
	{ rule: "`control` on a select is `\"segmented\"`", change: (m) => (input(m, 1).control = "slider") },
	{ rule: "A date's `min`, `default` and `max` parse in its `mode`", change: (m) => (m.inputs = [{ id: "day", type: "date", label: "Day", default: "25/10/2026" }]) },
	{ rule: "A date's default is within `min..max`", change: (m) => (m.inputs = [{ id: "day", type: "date", label: "Day", default: "2019-12-31", min: "2020-01-01" }]) },
	{ rule: "`mode` only on a date", change: (m) => (input(m, 2).mode = "date") },
	{ rule: "A select has two or more options", change: (m) => (input(m, 1).options = [{ value: "fast", label: "Fast" }]) },
	{ rule: "Option values are unique", change: (m) => (input(m, 1).options = [{ value: "fast", label: "Fast" }, { value: "fast", label: "Also fast" }]) },
	{ rule: "A select's default is one of its options", change: (m) => (input(m, 1).default = "slow") },
	{ rule: "`lang` only on a textarea", change: (m) => (input(m, 2).lang = "json") },
	{ rule: "`grammar` needs `lang` beside it", change: (m) => Object.assign(input(m, 2), { type: "textarea", grammar: { keywords: ["on"] } }) },
	{ rule: "`share` is `true` or `false`", change: (m) => (input(m, 2).share = "no") },
	{ rule: "`role` is a non-empty string", change: (m) => (input(m, 2).role = "") },
	{ rule: "`details` is a non-empty string", change: (m) => (input(m, 2).details = "") },
];

/** For each type: a real input from the repository to show, and the gallery card that runs one. */
const EXAMPLES: Record<string, { from: string; id: string; gallery?: string }> = {
	text: { from: "tools/regex-explainer", id: "pattern" },
	textarea: { from: "bench/fixtures/grammar-input", id: "machine", gallery: "grammar-input" },
	number: { from: "bench/fixtures/slider", id: "rtt", gallery: "slider" },
	select: { from: "bench/fixtures/presets", id: "stack", gallery: "presets" },
	toggle: { from: "bench/fixtures/styled-output", id: "" },
	date: { from: "bench/fixtures/native-inputs", id: "captured", gallery: "native-inputs" },
};

const SUMMARY: Record<string, string> = {
	text: "One line: a name, a pattern, an id",
	textarea: "Pasted data, a document, source in a notation",
	number: "A bounded quantity: a rate, a count, a size",
	select: "A choice from a short fixed list, as a dropdown or a row of segments, or a preset that fills other inputs",
	toggle: "On or off",
	date: "A day, a time of day, or both, in the browser's own picker",
};
/** The type of the value `run` gets for an input of this kind. */
const RECEIVES: Record<string, string> = {
	text: "string",
	textarea: "string",
	number: "number, clamped to `min..max`",
	select: "string, one of the option values",
	toggle: "boolean",
	date: "string, `YYYY-MM-DD`, `HH:MM` or `YYYY-MM-DDTHH:MM`, within `min..max`",
};

/**
 * Two-space JSON where anything that fits in 72 characters stays on one line, so a list of `{ label, value }`
 * pairs reads as a list rather than a column five lines per entry.
 */
/** JSON on one line, with a space after each `:` and `,` as a person would write it. */
function oneLine(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(oneLine).join(", ")}]`;
	if (value && typeof value === "object") return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${oneLine(v)}`).join(", ")}}`;
	return JSON.stringify(value) ?? "null";
}

function compact(value: unknown, indent = ""): string {
	const flat = oneLine(value);
	if (flat.length + indent.length <= 72 || value === null || typeof value !== "object") return flat;
	const inner = `${indent}  `;
	if (Array.isArray(value)) return `[\n${value.map((v) => inner + compact(v, inner)).join(",\n")}\n${indent}]`;
	return `{\n${Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${compact(v, inner)}`).join(",\n")}\n${indent}}`;
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

	const attrTable = (attrs: Attr[], prefix: string) => attributeTable(attrs, (a) => at(`${prefix}.${a.name}`));

	const out: string[] = [];
	out.push(
		"Each input becomes a labelled control on the form, with its `description` as the control's accessible description. Its value reaches `run(values)` under its `id`.",
		"",
		"## Types",
		"",
		"| Input | Type | Required | Optional | Use it for |",
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
		out.push("", `## ${s.type}`, "", `**Type:** ${RECEIVES[s.type]}. Takes the common attributes, plus:`, "", attrTable(s.attrs, "inputs"));
		if (s.type === "select") out.push("", "### Option attributes", "", "Each entry of `options`.", "", attrTable(option, "options"));
		if (s.type === "textarea") out.push("", "### Grammar attributes", "", "The keys of `grammar`. Each is optional, and a grammar needs at least one. Patterns are not allowed: a regular expression from a tool could hang the page it is on.", "", attrTable(grammar, "grammar"));
		out.push("", "### Example", "", exampleInput(s.type));
	}
	out.push("", "## Validation rules", "", "`validateManifest` checks these before anything runs. The message is exactly what an author gets.", "", "| Rule | Message |", "|---|---|");
	// Plain text, not a code span: a message may quote `run` in backticks of its own.
	for (const r of RULES) out.push(`| ${r.rule} | ${cell(await message(r.change))} |`);
	return out.join("\n");
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** What each kind is for, one line, for the summary table. */
const RESULT_USE: Record<string, string> = {
	fields: "Label and value pairs, optionally grouped",
	text: "Prose, or preformatted text",
	code: "Source with a language, painted by the host's highlighter",
	table: "Rows and typed columns, optionally linked to a chart",
	series: "Line, area, bar, scatter, box and other x/y charts",
	heatmap: "A value over two dimensions",
	pie: "Parts of a whole, or a donut with its total",
	radar: "A profile across several measures",
	treemap: "A hierarchy sized by value",
	venn: "How two or three sets overlap",
	graph: "Nodes and edges, laid out by the runtime",
	group: "Several results in one answer",
	bytes: "Hex dump with offsets, a printable gutter and named ranges",
	error: "The input was wrong, and the tool says which one",
};

/** The named types a kind's fields use, each given its own attribute table under the kind. */
const RESULT_TYPES: Record<string, string[]> = {
	fields: ["Field"],
	table: ["Column"],
	series: ["Chart", "Series", "Readout"],
	heatmap: ["Heatmap"],
	pie: ["Pie"],
	radar: ["Radar"],
	treemap: ["Treemap", "TreemapNode"],
	venn: ["Venn"],
	graph: ["Graph", "GraphNode", "GraphEdge", "GraphGroup", "GraphLane", "GraphRow"],
	bytes: ["ByteRange"],
};

/** A real result to show for each kind: which tool, with which inputs. */
const RESULT_EXAMPLES: Record<string, { from: string; values?: Record<string, unknown>; gallery?: string }> = {
	fields: { from: "tools/percentiles" },
	text: { from: "tools/regex-explainer" },
	code: { from: "tools/regex-explainer", gallery: "code-result" },
	table: { from: "tools/percentiles", gallery: "copy" },
	series: { from: "tools/histogram", gallery: "charts" },
	heatmap: { from: "bench/fixtures/discrete-series", values: { case: "heatmap" }, gallery: "charts" },
	pie: { from: "bench/fixtures/discrete-series", values: { case: "pie" }, gallery: "charts" },
	radar: { from: "bench/fixtures/discrete-series", values: { case: "radar" }, gallery: "charts" },
	treemap: { from: "bench/fixtures/discrete-series", values: { case: "treemap" }, gallery: "charts" },
	venn: { from: "bench/fixtures/discrete-series", values: { case: "venn-two" }, gallery: "charts" },
	graph: { from: "tools/build-order", gallery: "graphs" },
	group: { from: "tools/utf8-bytes" },
	bytes: { from: "tools/utf8-bytes", gallery: "bytes" },
	error: { from: "tools/histogram", values: { values: "1 2 three" }, gallery: "failures" },
};

/** Run a repository tool at build time and return its result. */
async function runTool(dir: string, values: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
	const m = JSON.parse(read(`${dir}/tool.json`)) as { inputs: { id: string; default?: unknown }[] };
	const defaults = Object.fromEntries(m.inputs.map((i) => [i.id, i.default]));
	const mod = (await import(join(ROOT, dir, "index.ts"))) as { default: { run(input: unknown, ctx: unknown): unknown } };
	return (await mod.default.run({ ...defaults, ...values }, { signal: new AbortController().signal, progress() {} })) as Record<string, unknown>;
}

/** The first part of a result with this kind, looking inside groups. */
function partOf(result: Record<string, unknown>, kind: string): Record<string, unknown> | undefined {
	if (result.kind === kind) return result;
	if (result.kind !== "group") return undefined;
	for (const p of result.parts as Record<string, unknown>[]) {
		const found = partOf(p, kind);
		if (found) return found;
	}
	return undefined;
}

/** Arrays past `keep` items cut to their first `keep`, so an example shows the shape, not 200 bytes of data. */
function shorten(value: unknown, keep = 3): { value: unknown; cut: boolean } {
	let cut = false;
	const walk = (v: unknown): unknown => {
		if (Array.isArray(v)) {
			if (v.length > keep + 1) cut = true;
			return (v.length > keep + 1 ? v.slice(0, keep) : v).map(walk);
		}
		if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
		return v;
	};
	return { value: walk(value), cut };
}

async function resultExample(kind: string): Promise<string> {
	const ex = RESULT_EXAMPLES[kind];
	if (!ex) return "";
	const part = partOf(await runTool(ex.from, ex.values), kind);
	if (!part) throw new Error(`reference: ${ex.from} returns no ${kind} result to show`);
	const short = shorten(part);
	const where = `What \`${ex.from}\` returns${ex.values ? ` for \`${JSON.stringify(ex.values)}\`` : ""}.${short.cut ? " Long arrays are cut to their first three items." : ""}`;
	return `\`\`\`json\n${compact(short.value)}\n\`\`\`\n\n${where}${ex.gallery ? `\n\n<!-- site: gallery ${ex.gallery} -->` : ""}`;
}

/** A real part that carries a `role`, so the common attributes have an example too. */
async function namedPart(): Promise<string> {
	const find = (o: Record<string, unknown>): Record<string, unknown> | undefined =>
		o.role !== undefined ? o : o.kind === "group" ? (o.parts as Record<string, unknown>[]).map(find).find(Boolean) : undefined;
	const part = find(await runTool("bench/fixtures/styled-output"));
	if (!part) throw new Error("reference: bench/fixtures/styled-output returns no part with a role");
	return `\`\`\`json\n${compact(shorten(part).value)}\n\`\`\`\n\nA part of what \`bench/fixtures/styled-output\` returns, named \`${String(part.role)}\` for a host stylesheet.`;
}

export async function resultsReference(): Promise<string> {
	const types = read("packages/sdk/src/types.ts");
	const { LATER, OUTPUT_SINCE } = (await import(join(ROOT, "packages/sdk/src/features.ts"))) as { LATER: Record<string, number>; OUTPUT_SINCE: Record<string, number> };
	const kindSince = (kind: string) => LATER[`kinds.${kind}`] ?? 1;
	const body = types.slice(types.indexOf("type OutputBody ="), types.indexOf("export type OutputKind"));
	const kinds: { kind: string; attrs: Attr[]; notes: string }[] = [];
	// The doc may not cross a `*/`: a lazy match let a field's JSDoc inside `table` run on to the next kind's.
	for (const m of body.matchAll(/(?:\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*)?\|\s*\{/g)) {
		const start = (m.index ?? 0) + m[0].length - 1;
		const attrs = members(block(body.slice(start), "{"));
		const kind = (attrs.find((a) => a.name === "kind")?.type ?? "").replace(/"/g, "");
		kinds.push({ kind, attrs: attrs.filter((a) => a.name !== "kind"), notes: jsdoc(m[1], true).text });
	}
	const typeBody = (name: string) => {
		const at = types.search(new RegExp(`export (?:interface ${name} \\{|type ${name} = \\{)`));
		if (at < 0) throw new Error(`reference: types.ts has no ${name}`);
		return members(block(types.slice(at), "{"));
	};
	const typeDoc = (name: string) => {
		const at = types.search(new RegExp(`export (?:interface ${name} \\{|type ${name} = \\{)`));
		const before = types.slice(0, at);
		const open = before.lastIndexOf("/**");
		const close = before.lastIndexOf("*/");
		return open >= 0 && close > open && before.slice(close + 2).trim() === "" ? jsdoc(before.slice(open + 3, close), true).text : "";
	};
	const table = attributeTable;

	const out: string[] = [
		"A tool's `run` returns one result. The runtime draws it: a tool never writes HTML. Every result is an object with a `kind`, and a `group` holds several.",
		"",
		"## Kinds",
		"",
		"| Kind | Use it for | Required | Since |",
		"|---|---|---|---|",
		...kinds.map((k) => `| [\`${k.kind}\`](#${k.kind}) | ${RESULT_USE[k.kind] ?? ""} | ${k.attrs.filter((a) => a.required).map((a) => `\`${a.name}\``).join(" ")} | ${sinceCell(kindSince(k.kind))} |`),
		"",
		"## Common attributes",
		"",
		"Any result, or any part of a group, may carry these.",
		"",
		table(typeBody("PartNames"), (a) => OUTPUT_SINCE[`part ${a.name}`] ?? 1),
		"",
		await namedPart(),
	];
	for (const k of kinds) {
		const base = kindSince(k.kind);
		out.push("", `## ${k.kind}`, "");
		if (k.notes) out.push(k.notes, "");
		out.push(k.attrs.length ? table(k.attrs, (a) => OUTPUT_SINCE[`${k.kind} ${a.name}`] ?? base) : "No attributes besides `kind`.");
		for (const t of RESULT_TYPES[k.kind] ?? []) {
			const doc = typeDoc(t);
			out.push("", `### ${t}`, "", ...(doc ? [doc, ""] : []), table(typeBody(t), (a) => OUTPUT_SINCE[`${t.toLowerCase()} ${a.name}`] ?? base));
		}
		out.push("", "### Example", "", await resultExample(k.kind));
	}
	return out.join("\n");
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/** The rules a manifest as a whole is held to, each with the message an author gets. */
const MANIFEST_RULES: { rule: string; change: (m: Record<string, unknown>) => void }[] = [
	{ rule: "`sdk` is a contract version this SDK reads", change: (m) => (m.sdk = 99) },
	{ rule: "`id` is lowercase letters, digits and hyphens", change: (m) => (m.id = "My Tool") },
	{ rule: "`blurb` is under 200 characters", change: (m) => (m.blurb = "x".repeat(240)) },
	{ rule: "At least one capability", change: (m) => (m.capabilities = []) },
	{ rule: "`kinds` is not empty", change: (m) => (m.kinds = []) },
	{ rule: "`kinds` includes `error`", change: (m) => (m.kinds = ["fields"]) },
	{ rule: "`cardFields` is a positive number", change: (m) => (m.cardFields = 0) },
	{ rule: "`timeoutMs` is 100 to 30000", change: (m) => Object.assign(m, { runtime: { entry: "index.ts", thread: "worker" }, timeoutMs: 50 }) },
	{ rule: "`samples` is not empty when present", change: (m) => (m.samples = []) },
	{ rule: "A link is `http`, `https`, `mailto` or relative", change: (m) => (m.links = [{ label: "Spec", href: "javascript:alert(1)" }]) },
];

/** The lines between `// #region name` and `// #endregion` in a repository file, dedented. */
function region(path: string, name: string): string {
	const text = read(path);
	const start = text.indexOf(`// #region ${name}`);
	if (start < 0) throw new Error(`reference: ${path} has no #region ${name}`);
	// Regions nest, `worker` inside `define`, so the end is the #endregion that closes this one.
	let depth = 0;
	let end = -1;
	for (const m of text.slice(start).matchAll(/\/\/ #(end)?region\b/g)) {
		depth += m[1] ? -1 : 1;
		if (depth === 0) {
			end = start + (m.index ?? 0);
			break;
		}
	}
	if (end < 0) throw new Error(`reference: ${path}'s #region ${name} is never closed`);
	const lines = text
		.slice(text.indexOf("\n", start) + 1, end)
		.replace(/\s+$/, "")
		.split("\n")
		.filter((l) => !/\/\/ #(end)?region\b/.test(l));
	const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)?.[0].length ?? 0));
	return lines.map((l) => l.slice(indent).replace(/\t/g, "  ")).join("\n");
}

/** A few keys of a repository tool's manifest, as JSON. */
function manifestKeys(dir: string, ...keys: string[]): string {
	const m = JSON.parse(read(`${dir}/tool.json`)) as Record<string, unknown>;
	const picked = Object.fromEntries(keys.map((k) => [k, k === "samples" ? (m[k] as unknown[]).slice(0, 2) : m[k]]));
	return `\`\`\`json\n${compact(picked)}\n\`\`\`\n\nFrom \`${dir}/tool.json\`${keys.includes("samples") ? ", the first two samples" : ""}.`;
}

/** One case from a repository tool's `cases.json`, chosen by a predicate. */
function fixtureCase(dir: string, pick: (c: Record<string, unknown>) => boolean, what: string): string {
	const cases = JSON.parse(read(`${dir}/cases.json`)) as Record<string, unknown>[];
	const found = cases.find(pick);
	if (!found) throw new Error(`reference: ${dir}/cases.json has no ${what} case`);
	return `\`\`\`json\n${compact(shorten(found).value)}\n\`\`\`\n\n${what}, from \`${dir}/cases.json\`.`;
}

export async function manifestReference(): Promise<string> {
	const types = read("packages/sdk/src/types.ts");
	const at = await since();
	const body = (name: string) => {
		const i = types.search(new RegExp(`export (?:interface ${name}\\b[^{]*\\{|type ${name}\\b[^=]*= \\{)`));
		if (i < 0) throw new Error(`reference: types.ts has no ${name}`);
		return members(block(types.slice(i), "{"));
	};
	const table = (attrs: Attr[], key: (a: Attr) => string) => attributeTable(attrs, (a) => at(key(a)));
	const manifest = body("Manifest");
	// `runtime` and `links` are inline object types; their own members get tables of their own.
	const inline = (name: string) => {
		const a = manifest.find((x) => x.name === name);
		if (!a) throw new Error(`reference: Manifest has no ${name}`);
		return members(a.type.replace(/^\{|\}(\[\])?$/g, ""));
	};
	const { CAPABILITIES } = (await import(join(ROOT, "packages/sdk/src/index.ts"))) as { CAPABILITIES: readonly string[] };
	const example = read("tools/histogram/tool.json").trim();

	const out: string[] = [
		"A tool is a directory with three files: `tool.json`, the manifest; `index.ts`, the module whose `run` computes the result; and `cases.json`, the known answers its fixtures check.",
		"",
		"## Manifest attributes",
		"",
		"The keys of `tool.json`.",
		"",
		table(manifest.map((a) => (a.name === "runtime" ? { ...a, type: "object" } : a.name === "links" ? { ...a, type: "Link[]" } : a)), (a) => a.name),
		"",
		"### runtime",
		"",
		table(inline("runtime"), (a) => `runtime.${a.name}`),
		"",
		manifestKeys("tools/regex-explainer", "runtime", "timeoutMs"),
		"",
		"### Link",
		"",
		"Each entry of `links`.",
		"",
		table(inline("links"), (a) => `links.${a.name}`),
		"",
		manifestKeys("tools/utf8-bytes", "links"),
		"",
		"### Sample",
		"",
		"Each entry of `samples`, a button under the form that fills the inputs.",
		"",
		table(body("Sample"), (a) => `samples.${a.name}`),
		"",
		manifestKeys("tools/percentiles", "samples"),
		"",
		"### Capabilities",
		"",
		"| Capability | Meaning |",
		"|---|---|",
		...CAPABILITIES.map((c) => `| \`${c}\` | ${c === "pure" ? "No network, no storage, no clock, no randomness that is not seeded: the same input always gives the same result" : ""} |`),
		"",
		"## Example",
		"",
		"```json",
		example,
		"```",
		"",
		"`tools/histogram/tool.json`.",
		"",
		"## The tool module",
		"",
		"`index.ts` default-exports an object with `run`.",
		"",
		"```ts",
		'import type { Tool } from "@toolbench/sdk";',
		"",
		"type Input = { values: string; bins: number }; // a type, not an interface",
		"",
		"export default {",
		"  run({ values, bins }, ctx) {",
		'    return { kind: "fields", fields: [{ label: "bins", value: String(bins) }] };',
		"  },",
		"} satisfies Tool<Input>;",
		"```",
		"",
		"Declare the input type with `type`, not `interface`: an interface does not satisfy `InputValues`, and TypeScript's error does not say why.",
		"",
		"### Ctx",
		"",
		"The second argument to `run`.",
		"",
		table(body("Ctx"), () => "ctx"),
		"",
		"A simulation that stops when the reader cancels, and shows its running mean as it goes:",
		"",
		"```ts",
		region("tools/queue-explorer/index.ts", "ctx"),
		"```",
		"",
		"From `tools/queue-explorer/index.ts`.",
		"",
		"## Fixtures",
		"",
		"`cases.json` is an array of cases. `pnpm check` runs each and compares the result.",
		"",
		table(body("Case"), () => "case"),
		"",
		fixtureCase("tools/histogram", (c) => (c.expect as { kind?: string }).kind === "error" && JSON.stringify(c).length < 400, "An exact case for bad input"),
		"",
		fixtureCase("tools/percentiles", (c) => c.match === "subset", "A `subset` case, with the `why` and `fieldCount` it requires"),
		"",
		"## Validation rules",
		"",
		"`validateManifest` checks these before anything runs. Rules for inputs are on the [Inputs](./docs-ref-inputs.html#validation-rules) page.",
		"",
		"| Rule | Message |",
		"|---|---|",
	];
	for (const r of MANIFEST_RULES) out.push(`| ${r.rule} | ${cell(await message(r.change))} |`);
	return out.join("\n");
}

// ---------------------------------------------------------------------------
// Host API
// ---------------------------------------------------------------------------

/** The JSDoc directly above `signature` in a source file, as one paragraph. */
function docAbove(path: string, signature: string): string {
	const text = read(path);
	const at = text.indexOf(signature);
	if (at < 0) throw new Error(`reference: ${path} has no "${signature}"`);
	const before = text.slice(0, at);
	const close = before.lastIndexOf("*/");
	const open = before.lastIndexOf("/**");
	if (open < 0 || close < open || before.slice(close + 2).trim() !== "") throw new Error(`reference: "${signature}" in ${path} has no JSDoc`);
	return jsdoc(before.slice(open + 3, close), true).text;
}

/** A gallery card's markup, read from the gallery's own source so the example is one that runs. */
function galleryMarkup(id: string): string {
	const text = read("site/build/gallery.ts");
	const at = text.indexOf(`id: "${id}"`);
	const demo = at < 0 ? null : /demo: `([^`]+)`/.exec(text.slice(at));
	if (!demo?.[1]) throw new Error(`reference: the gallery has no demo for ${id}`);
	return demo[1].trim();
}

export async function hostReference(): Promise<string> {
	const element = read("packages/runtime/src/element.ts");
	const sources = read("packages/runtime/src/sources.ts");
	const bodyIn = (text: string, name: string) => members(block(text.slice(text.indexOf(`export interface ${name}`)), "{"));
	// A type alias the page would otherwise name without saying what it is, `Mode`, spelled out.
	const aliases = new Map([...element.matchAll(/export type (\w+) = ([^;{]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]));
	const spelled = (attrs: Attr[]) => attrs.map((a) => ({ ...a, type: aliases.get(a.type) ?? a.type }));
	const ELEMENT = "packages/runtime/src/element.ts";
	const methods: { name: string; signature: string; doc: string }[] = [
		{ name: "values (set)", signature: "values = { ... }", doc: docAbove(ELEMENT, "set values(partial: InputValues)") },
		{ name: "values (get)", signature: "values", doc: docAbove(ELEMENT, "get values(): InputValues") },
		{ name: "run()", signature: "run({ focus? }): Promise<void>", doc: docAbove(ELEMENT, "async run(options") },
		{ name: "reveal()", signature: "reveal(id): Promise<boolean>", doc: docAbove(ELEMENT, "async reveal(id: string)") },
		{ name: "seed", signature: "seed = output", doc: docAbove(ELEMENT, "set seed(output") },
	];

	const out: string[] = [
		"A host is the page that shows tools. It defines the `<tool-host>` element once, with a source of tools, and then writes `<tool-host>` wherever a tool belongs.",
		"",
		"```ts",
		region("site/src/host.ts", "define"),
		"```",
		"",
		"How this site does it, from `site/src/host.ts`.",
		"",
		"## defineToolHost",
		"",
		`\`defineToolHost(options, tagName = "tool-host")\`. ${docAbove(ELEMENT, "export function defineToolHost(")}`,
		"",
		"### Options",
		"",
		attributeTable(bodyIn(element, "ToolHostConfig")),
		"",
		"### setHostStyles",
		"",
		`\`setHostStyles(styles)\`. ${docAbove(ELEMENT, "export function setHostStyles(")}`,
		"",
		"## Element attributes",
		"",
		"What `<tool-host>` reads from its markup. Changing one redraws the tool and keeps the reader's inputs and result.",
		"",
		attributeTable(spelled(bodyIn(element, "ToolHostAttributes"))),
		"",
		"### Example",
		"",
		"```html",
		galleryMarkup("parts"),
		"```",
		"",
		"A gallery card: one part shown, the rest behind a button.",
		"",
		"<!-- site: gallery parts -->",
		"",
		"## Properties and methods",
		"",
		"On the element, for a page that drives a tool itself.",
		"",
		"| Member | Use | What it does |",
		"|---|---|---|",
		...methods.map((m) => `| \`${m.name}\` | \`${m.signature}\` | ${cell(m.doc)} |`),
		"",
		"### Example",
		"",
		"```ts",
		region("site/src/gallery.ts", "values"),
		region("site/src/gallery.ts", "run"),
		"```",
		"",
		"```ts",
		region("site/src/gallery.ts", "reveal"),
		"```",
		"",
		"From `site/src/gallery.ts`.",
		"",
		"## Events",
		"",
		"Dispatched on `<tool-host>`. Each bubbles and is composed, so a listener on the document hears every tool. None fires while the element starts up with its first values.",
		"",
		"| Event | `detail` | When |",
		"|---|---|---|",
		...bodyIn(element, "ToolHostEvents").map((e) => `| \`${e.name}\` | \`${(/CustomEvent<(.*)>$/.exec(e.type)?.[1] ?? e.type).trim()}\` | ${cell(e.notes)} |`),
		"",
		"### Example",
		"",
		"```ts",
		region("site/src/gallery.ts", "events"),
		"```",
		"",
		"From `site/src/gallery.ts`.",
		"",
		"<!-- site: gallery events -->",
		"",
		"## Sources",
		"",
		"Where tools come from. `RegistrySource` is the one most hosts use; a host may write its own `ToolSource`.",
		"",
		"### ToolSource",
		"",
		attributeTable(
			bodyIn(sources, "ToolSource").map((a) => ({ ...a, name: a.name.replace(/\(.*\)/, "()"), type: a.type })),
		),
		"",
		"### RegistrySource",
		"",
		`\`new RegistrySource(entries)\`. ${docAbove("packages/runtime/src/sources.ts", "export class RegistrySource")}`,
		"",
		"### RegistryEntry",
		"",
		attributeTable(bodyIn(sources, "RegistryEntry").map((a) => ({ ...a, name: a.name.replace(/\(.*\)/, "()") }))),
		"",
		"```ts",
		read("site/src/registry.ts").slice(read("site/src/registry.ts").indexOf("export function entries")).trim().replace(/\t/g, "  "),
		"```",
		"",
		"How this site builds its registry from a directory glob, from `site/src/registry.ts`.",
	];
	return out.join("\n");
}

// ---------------------------------------------------------------------------
// Theme tokens
// ---------------------------------------------------------------------------

/**
 * What each token is for, read from the token table in docs/architecture.md. A row may name several
 * tokens, "`--tb-bad`, `--tb-warn`, `--tb-good`" or "`--tb-s1` to `--tb-s8`", and each gets its row.
 */
function tokenUses(): Map<string, string> {
	const uses = new Map<string, string>();
	for (const m of read("docs/architecture.md").matchAll(/^\| (`--tb-[^|]+) \| [^|]+ \| ([^|]+) \|$/gm)) {
		const names = [...(m[1] ?? "").matchAll(/`(--tb-[\w-]+)`/g)].map((n) => n[1] ?? "");
		const range = /`--tb-([a-z]+)(\d+)` to `--tb-[a-z]+(\d+)`/.exec(m[1] ?? "");
		if (range) for (let i = Number(range[2]); i <= Number(range[3]); i++) names.push(`--tb-${range[1]}${i}`);
		for (const n of names) uses.set(n, (m[2] ?? "").trim());
	}
	return uses;
}

export async function tokensReference(): Promise<string> {
	const css = read("packages/runtime/src/styles.ts");
	const host = css.slice(css.indexOf(":host {"), css.indexOf("}", css.indexOf(":host {")));
	// Each token's last declaration wins, which is the light-dark() one where there are two.
	const tokens = new Map<string, string>();
	for (const m of host.matchAll(/(--tb-[\w-]+):\s*([^;]+);/g)) tokens.set(m[1] ?? "", (m[2] ?? "").trim().replace(/\s+/g, " "));
	const uses = tokenUses();
	const missing = [...tokens.keys()].filter((t) => !uses.has(t));
	if (missing.length) throw new Error(`reference: docs/architecture.md's token table has no row for ${missing.join(", ")}`);
	const values = (v: string) => {
		const ld = /^light-dark\((.+), (.+)\)$/.exec(v);
		if (ld) return [`\`${ld[1]}\``, `\`${ld[2]}\``];
		const ref = /^var\((--tb-[\w-]+)\)$/.exec(v);
		return ref ? [`\`${v}\``, `follows \`${ref[1]}\``] : [`\`${v}\``, "same as light"];
	};
	const parts = [...new Set([...read("packages/runtime/src/graph/draw.ts").matchAll(/part: "([\w-]+)"/g), ...read("packages/runtime/src/element.ts").matchAll(/part: "([\w-]+)"/g)].map((m) => m[1] ?? ""))];
	return [
		"A tool draws inside a shadow root, so a page's CSS does not reach it. It reads these custom properties instead, which do cross the boundary: set any of them on `tool-host`, or on anything around it.",
		"",
		"## Tokens",
		"",
		"| Token | Light | Dark | Used for |",
		"|---|---|---|---|",
		...[...tokens].map(([t, v]) => `| \`${t}\` | ${values(v).join(" | ")} | ${cell(uses.get(t) ?? "")} |`),
		"",
		"The defaults follow the page's colour scheme through `light-dark()`.",
		"",
		"### Example",
		"",
		"```css",
		read("site/src/gallery.css").slice(read("site/src/gallery.css").indexOf("/* #region theme */") + "/* #region theme */".length, read("site/src/gallery.css").indexOf("/* #endregion */")).trim(),
		"```",
		"",
		"The gallery's second theme, from `site/src/gallery.css`.",
		"",
		"<!-- site: gallery theming -->",
		"",
		"## Parts",
		"",
		"Elements a page can style from outside with `::part()`.",
		"",
		"| Part | Element |",
		"|---|---|",
		...parts.map((p) => `| \`${p}\` | ${p === "wide-toggle" ? "The expand and fit button on a scaled graph" : ""} |`),
		"",
		"## Classes and attributes",
		"",
		"For everything inside the shadow root, a host passes its own stylesheet to `defineToolHost({ styles })`. The class names and attributes it may rely on are listed on the [Styling](./docs-styling.html#what-you-can-select) page.",
	].join("\n");
}

// ---------------------------------------------------------------------------
// For tools and agents: the same reference as data, and as one text file
// ---------------------------------------------------------------------------

type JsonAttr = { name: string; type: string; required: boolean; default?: string; since?: number; notes: string };

/** The reference as JSON, from the same parsers as the pages, so the two cannot disagree. */
export async function referenceData(): Promise<Record<string, unknown>> {
	const types = read("packages/sdk/src/types.ts");
	const element = read("packages/runtime/src/element.ts");
	const at = await since();
	const { LATER, OUTPUT_SINCE } = (await import(join(ROOT, "packages/sdk/src/features.ts"))) as { LATER: Record<string, number>; OUTPUT_SINCE: Record<string, number> };
	const { SDK_VERSION } = (await import(join(ROOT, "packages/sdk/src/index.ts"))) as { SDK_VERSION: number };
	const json = (a: Attr, v?: number): JsonAttr => ({ name: a.name, type: a.type, required: a.required, ...(a.fallback ? { default: a.fallback } : {}), ...(v ? { since: v } : {}), notes: a.notes });
	const body = (text: string, name: string) => {
		const i = text.search(new RegExp(`export (?:interface ${name}\\b[^{]*\\{|type ${name}\\b[^=]*= \\{)`));
		if (i < 0) throw new Error(`reference: no ${name}`);
		return members(block(text.slice(i), "{"));
	};

	const union = types.slice(types.indexOf("export type InputSpec ="), types.indexOf("/** One choice in a `select`. */"));
	const inputs = union
		.split("| (InputBase & ")
		.slice(1)
		.map((part) => {
			const attrs = members(block(part, "{"));
			const type = (attrs.find((a) => a.name === "type")?.type ?? "").replace(/"/g, "");
			return { type, value: RECEIVES[type], attributes: attrs.filter((a) => a.name !== "type").map((a) => json(a, at(`inputs.${a.name}`))) };
		});

	const outputs = types.slice(types.indexOf("type OutputBody ="), types.indexOf("export type OutputKind"));
	const results: Record<string, unknown>[] = [];
	for (const m of outputs.matchAll(/(?:\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*)?\|\s*\{/g)) {
		const attrs = members(block(outputs.slice((m.index ?? 0) + m[0].length - 1), "{"));
		const kind = (attrs.find((a) => a.name === "kind")?.type ?? "").replace(/"/g, "");
		const base = LATER[`kinds.${kind}`] ?? 1;
		results.push({
			kind,
			since: base,
			use: RESULT_USE[kind],
			attributes: attrs.filter((a) => a.name !== "kind").map((a) => json(a, OUTPUT_SINCE[`${kind} ${a.name}`] ?? base)),
			types: Object.fromEntries((RESULT_TYPES[kind] ?? []).map((t) => [t, body(types, t).map((a) => json(a, OUTPUT_SINCE[`${t.toLowerCase()} ${a.name}`] ?? base))])),
		});
	}

	return {
		$comment: "Generated at build time from the Toolbench source. The same data as the site's Reference pages.",
		contract: SDK_VERSION,
		runtime: (JSON.parse(read("packages/runtime/package.json")) as { version: string }).version,
		inputs: { common: members(block(types, "interface InputBase")).map((a) => json(a, at(`inputs.${a.name}`))), types: inputs },
		results: { common: body(types, "PartNames").map((a) => json(a, OUTPUT_SINCE[`part ${a.name}`] ?? 1)), kinds: results },
		manifest: body(types, "Manifest").map((a) => json(a, at(a.name))),
		host: { options: body(element, "ToolHostConfig").map((a) => json(a)), attributes: body(element, "ToolHostAttributes").map((a) => json(a)) },
	};
}

/** Every reference page in one plain-text file, for an assistant to read in a single request. */
export async function llmsText(pages: { title: string; url: string; summary: string; markdown: string }[]): Promise<string> {
	const { SDK_VERSION } = (await import(join(ROOT, "packages/sdk/src/index.ts"))) as { SDK_VERSION: number };
	return [
		"# Toolbench",
		"",
		"> A zero-dependency framework for small interactive tools in any web page. A tool is one function plus one JSON manifest; the runtime builds the form, runs the function and draws the result.",
		"",
		`Contract version ${SDK_VERSION}. Install: \`npm install @toolbench/sdk @toolbench/runtime\`. Machine-readable: reference.json beside this file.`,
		"",
		"## Pages",
		"",
		...pages.map((p) => `- [${p.title}](${p.url}): ${p.summary}`),
		"",
		...pages.flatMap((p) => [`# ${p.title}`, "", p.markdown.replace(/^<!-- site: .* -->$/gm, "").replace(/\n{3,}/g, "\n\n"), ""]),
	].join("\n");
}
