/**
 * The gallery: every feature of the runtime, each as a live example beside the code that produces it.
 *
 * Nothing shown as code is typed here. A manifest excerpt is read from the tool's own `tool.json`, a
 * snippet of host code from the site file that actually runs it (between `#region` markers), the markup
 * from the example's own markup, and a chart's result by running the tool at build time. Change any of
 * them and the gallery shows the change.
 *
 * The examples use the tools in `tools/` and, read only, the bench's fixtures, which exist to put one
 * runtime feature on screen each. The site owns no tools of its own.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { codeBlock, escapeHtml } from "./highlight.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

type Code = { label: string; lang: string; text: string };
type Feature = {
	id: string;
	title: string;
	/** One or two sentences for a visitor: what it is and when to reach for it. HTML allowed. */
	text: string;
	demo: string;
	code: (demo: Code) => Promise<Code[]> | Code[];
	/** The demo takes the full width and the code sits below it. */
	wide?: boolean;
};
type Group = { id: string; title: string; text: string; features: Feature[] };

/** A refusal has no live tool to show, so its card shows the validator's message, computed with its code. */
const REFUSALS = new Map<string, string>();

/** JSON with short arrays of plain values on one line, so a result reads as data rather than as a column. */
export function compactJson(value: unknown, indent = ""): string {
	if (Array.isArray(value)) {
		if (value.every((v) => v === null || typeof v !== "object")) return `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
		const inner = `${indent}  `;
		return `[\n${value.map((v) => inner + compactJson(v, inner)).join(",\n")}\n${indent}]`;
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value).filter(([, v]) => v !== undefined);
		if (entries.length === 0) return "{}";
		const inner = `${indent}  `;
		return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${compactJson(v, inner)}`).join(",\n")}\n${indent}}`;
	}
	return JSON.stringify(value);
}

type Manifest = Record<string, unknown> & { inputs: { id: string }[] };
const manifest = (dir: string) => JSON.parse(read(`${dir}/tool.json`)) as Manifest;

/** Some top-level keys of a manifest, in the manifest's own order. */
function keys(dir: string, ...names: string[]): Code {
	const m = manifest(dir);
	const picked = Object.fromEntries(Object.entries(m).filter(([k]) => names.includes(k)));
	return { label: `${dir}/tool.json`, lang: "json", text: compactJson(picked) };
}

/** One input of a manifest. */
function input(dir: string, id: string): Code {
	const spec = manifest(dir).inputs.find((i) => i.id === id);
	if (!spec) throw new Error(`${dir}/tool.json has no input ${id}`);
	return { label: `${dir}/tool.json, one input`, lang: "json", text: compactJson(spec) };
}

/** The lines between `#region name` and `#endregion` in a site file, dedented. */
function region(path: string, name: string, lang = "ts"): Code {
	const lines = read(path).split("\n");
	const start = lines.findIndex((l) => l.includes(`#region ${name}`));
	const end = lines.findIndex((l, i) => i > start && l.includes("#endregion"));
	if (start < 0 || end < 0) throw new Error(`${path} has no #region ${name}`);
	const body = lines.slice(start + 1, end);
	const pad = Math.min(...body.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)?.[0].length ?? 0));
	// Tabs as two spaces: a code block is a phone's width at most, and a tab there is eight.
	return { label: path, lang, text: body.map((l) => l.slice(pad).replace(/\t/g, "  ")).join("\n") };
}

const markup = (html: string): Code => ({ label: "Markup", lang: "html", text: html.trim().replace(/^ {4}/gm, "") });

/** What a tool returns for an input, computed now by running it. */
async function output(dir: string, values: Record<string, unknown>, label = "What run() returns"): Promise<Code> {
	const m = manifest(dir);
	const defaults = Object.fromEntries(m.inputs.map((i) => [i.id, (i as { default?: unknown }).default]));
	const mod = (await import(join(ROOT, dir, "index.ts"))) as { default: { run(input: unknown, ctx: unknown): unknown } };
	const result = await mod.default.run({ ...defaults, ...values }, { signal: new AbortController().signal, progress() {} });
	return { label, lang: "json", text: compactJson(result) };
}

/**
 * What the SDK's validator says about a manifest, run at build time, so the gallery shows the real message
 * rather than one typed to look like it.
 */
async function refusal(dir: string, change: (m: Record<string, unknown>) => void, label: string): Promise<{ manifest: Code; message: string }> {
	const sdk = (await import(join(ROOT, "packages/sdk/src/index.ts"))) as { validateManifest(m: unknown): unknown; upgradeManifest(m: unknown): unknown };
	const m = structuredClone(manifest(dir)) as unknown as Record<string, unknown>;
	change(m);
	try {
		sdk.validateManifest(sdk.upgradeManifest(m));
	} catch (error) {
		return { manifest: { label, lang: "json", text: compactJson(m) }, message: (error as Error).message };
	}
	throw new Error(`${label}: the validator accepted a manifest the gallery shows it refusing`);
}

const refusalBox = (title: string, message: string) =>
	`<div class="refusal"><p class="refusal-title">${escapeHtml(title)}</p><pre class="refusal-message">${escapeHtml(message)}</pre></div>`;

/** The bench fixture that draws every chart, one case per kind. */
const CHARTS: { id: string; title: string; text: string }[] = [
	{ id: "lines", title: "Line", text: "A quantity along x. A missing value stays a gap." },
	{ id: "area", title: "Area", text: "A line filled from zero, for a total over time." },
	{ id: "step", title: "Step", text: "A value that holds until it changes." },
	{ id: "band", title: "Band", text: "A spread around a median, drawn beneath it." },
	{ id: "thresholds", title: "Thresholds", text: "Labelled limits, and a scale that widens to show them." },
	{ id: "histogram", title: "Bars and histograms", text: "Counts over bins, growing from zero." },
	{ id: "stacked", title: "Stacked bars", text: "Parts that add up to a total, against a budget line." },
	{ id: "horizontal", title: "Horizontal bars", text: "One row per category, for long names." },
	{ id: "pyramid", title: "Pyramid", text: "Two sides of one measure, mirrored." },
	{ id: "combo", title: "Two axes", text: "Bars and a line, each reading its own axis." },
	{ id: "scatter", title: "Scatter", text: "Points with their own x values." },
	{ id: "bubble", title: "Bubble", text: "A third measure as each point's area." },
	{ id: "box", title: "Box plot", text: "The spread of a measurement per group." },
	{ id: "log", title: "Log scales", text: "Values across orders of magnitude." },
	{ id: "linked", title: "Chart linked to a table", text: "Point at either and the other follows." },
	{ id: "heatmap", title: "Heatmap", text: "A value over two dimensions, with a key." },
	{ id: "pie", title: "Pie", text: "Parts of a whole, each labelled with its share." },
	{ id: "donut", title: "Donut", text: "A pie with its total in the centre." },
	{ id: "radar", title: "Radar", text: "A profile across several measures." },
	{ id: "treemap", title: "Treemap", text: "A hierarchy, each part sized by its value." },
	{ id: "venn-three", title: "Venn", text: "How two or three sets overlap." },
	{ id: "pie-negative", title: "When data cannot be drawn", text: "A chart that would mislead is refused, with the reason." },
];

const FIX = "bench/fixtures";

export const GROUPS: Group[] = [
	{
		id: "modes",
		title: "Display modes",
		text: "One tool, three presentations. The mode also decides when the tool's code is fetched.",
		features: [
			{
				id: "page-mode",
				title: "A tool on its own page",
				text: "<code>mode=\"page\"</code> shows every input, the whole result and the tool's links. Its code loads as it scrolls near.",
				demo: `<tool-host tool="utf8-bytes" mode="page"></tool-host>`,
				code: (demo) => [demo],
			},
			{
				id: "card-mode",
				title: "A card that costs nothing until it is opened",
				text: "<code>mode=\"card\"</code> is plain markup until someone opens it. Only then does the tool's code download.",
				demo: `<tool-host tool="percentiles" mode="card"></tool-host>`,
				code: (demo) => [demo],
			},
			{
				id: "embed-mode",
				title: "In the middle of an article",
				text: "<code>mode=\"embed\"</code> drops the title and takes the page's type, so a tool reads as part of the prose around it.",
				wide: true,
				demo: `<div class="article-demo">
      <p>Bin a set of response times and the long tail shows up at once: most requests are quick, and a few are very slow. Try adding a slower one.</p>
      <tool-host tool="histogram" mode="embed"></tool-host>
      <p>Every bar moved because the bins are equal widths between the smallest and the largest value.</p>
    </div>`,
				code: (demo) => [demo],
			},
			{
				id: "answer-first",
				title: "The answer first",
				text: "<code>layout=\"answer-first\"</code> leads with the result and puts the controls underneath, for a tool that opens a page about something else.",
				demo: `<tool-host tool="percentiles" mode="embed" layout="answer-first" data-run></tool-host>`,
				code: (demo) => [demo, region("site/src/gallery.ts", "run")],
			},
			{
				id: "parts",
				title: "Part of a result, and the rest on request",
				text: "<code>parts=\"1\"</code> shows the first part of a grouped result; <code>more=\"expand\"</code> turns the notice into a button that reveals the rest in place, without running the tool again.",
				demo: `<tool-host tool="percentiles" mode="embed" parts="1" more="expand" data-run></tool-host>`,
				code: (demo) => [demo],
			},
			{
				id: "links",
				title: "The links under a tool",
				text: "<code>links=\"all\"</code>, the default, draws the manifest's links. <code>page</code> draws only a link to the tool's own page, and <code>none</code> draws nothing, for a tool in an article that lists its references already.",
				wide: true,
				demo: `<div class="demo-grid links-demo">
      <div><p><code>links="all"</code></p><tool-host tool="utf8-bytes" mode="embed"></tool-host></div>
      <div><p><code>links="page"</code></p><tool-host tool="utf8-bytes" mode="embed" links="page"></tool-host></div>
      <div><p><code>links="none"</code></p><tool-host tool="utf8-bytes" mode="embed" links="none"></tool-host></div>
    </div>`,
				code: (demo) => [demo],
			},
		],
	},
	{
		id: "inputs",
		title: "Inputs",
		text: "The form is built from the manifest: five input types, each with a real label, a description and keyboard behaviour.",
		features: [
			{
				id: "samples",
				title: "Sample inputs",
				text: "A row of examples under the form. A click fills the inputs and waits for Run. The one worth shipping is the input the tool rejects.",
				demo: `<tool-host tool="percentiles" mode="embed"></tool-host>`,
				code: () => [keys("tools/percentiles", "samples")],
			},
			{
				id: "reset",
				title: "Reset",
				text: "Change an input and a Reset button appears beside Run. It puts back the values the tool opened with and clears the result. <code>reset=\"none\"</code> leaves it out.",
				demo: `<tool-host tool="queue-explorer" mode="embed"></tool-host>`,
				code: (demo) => [demo, markup(`<tool-host tool="utf8-bytes" mode="embed" reset="none"></tool-host>`)],
			},
			{
				id: "presets",
				title: "A select that fills other inputs",
				text: "Give a select's options <code>sets</code>, and choosing one fills those inputs for the reader to edit. The select follows the form after that.",
				demo: `<tool-host tool="presets" mode="embed"></tool-host>`,
				code: () => [input(`${FIX}/presets`, "stack")],
			},
			{
				id: "slider",
				title: "A slider",
				text: "<code>\"control\": \"slider\"</code> on a number input adds a native range beside the box, for a value read by sweeping it.",
				demo: `<tool-host tool="slider" mode="embed"></tool-host>`,
				code: () => [input(`${FIX}/slider`, "rtt"), keys(`${FIX}/slider`, "autoRun")],
			},
			{
				id: "highlighted-input",
				title: "A highlighted textarea",
				text: "A textarea with a <code>lang</code> is painted by the host's highlighter, the same hook that paints code results. Caret, selection and undo stay the browser's own.",
				demo: `<tool-host tool="highlighted-input" mode="embed"></tool-host>`,
				code: () => [input(`${FIX}/highlighted-input`, "config"), region("site/src/gallery-host.ts", "highlight")],
			},
			{
				id: "grammar-input",
				title: "A textarea with its own grammar",
				text: "A tool can ship the <code>grammar</code> for a notation of its own: keywords, a comment marker, operators and strings. It is painted with no host highlighter at all, and a host highlighter that knows the <code>lang</code> still wins.",
				demo: `<tool-host tool="grammar-input" mode="embed"></tool-host>`,
				code: () => [input(`${FIX}/grammar-input`, "machine")],
			},
			{
				id: "autorun",
				title: "Update as the reader types",
				text: "<code>\"autoRun\": true</code> runs on every edit. Off by default, and refused for worker tools, because it only suits a tool that is genuinely instant.",
				demo: `<tool-host tool="histogram" mode="embed"></tool-host>`,
				code: () => [keys("tools/histogram", "runtime", "autoRun")],
			},
		],
	},
	{
		id: "running",
		title: "Running and failing",
		text: "Nothing runs until the reader asks. A slow tool gets a worker, and every way a run can go wrong says which one it was.",
		features: [
			{
				id: "worker",
				title: "A worker, with a timeout",
				text: "<code>\"thread\": \"worker\"</code> runs the tool off the page's thread, so a long run can be stopped. <code>timeoutMs</code> sets how long it may take.",
				demo: `<tool-host tool="queue-explorer" mode="embed"></tool-host>`,
				code: () => [keys("tools/queue-explorer", "runtime", "timeoutMs"), region("site/src/host.ts", "worker"), region("site/src/tool.worker.ts", "worker")],
			},
			{
				id: "failures",
				title: "Failure modes",
				text: "A run that never ends is stopped at its timeout. A tool that throws is reported as a bug. Bad input is the tool working: the message points at the input. An unknown tool says so.",
				wide: true,
				demo: `<div class="demo-grid">
      <tool-host tool="stress" mode="embed" data-values='{"mode":"spin"}' data-run></tool-host>
      <tool-host tool="stress" mode="embed" data-values='{"mode":"throw"}' data-run></tool-host>
      <tool-host tool="stress" mode="embed" data-values='{"mode":"bad-input"}' data-run></tool-host>
      <tool-host tool="no-such-tool" mode="embed"></tool-host>
    </div>`,
				code: (demo) => [demo, keys(`${FIX}/stress`, "runtime", "timeoutMs"), region("site/src/gallery.ts", "values")],
			},
			{
				id: "lifecycle",
				title: "Deprecated and retired tools",
				text: "A deprecated tool still runs and carries a marker. A retired one refuses to load and points the way onward, so an old link explains rather than breaks.",
				wide: true,
				demo: `<div class="demo-grid">
      <tool-host tool="legacy-converter" mode="page"></tool-host>
      <tool-host tool="old-converter" mode="page"></tool-host>
    </div>`,
				code: (demo) => [demo, keys("site/examples/legacy-converter", "status"), keys("site/examples/old-converter", "status", "links")],
			},
			{
				id: "refused",
				title: "A manifest the validator refuses",
				text: "A tool is checked before anything runs. A manifest that uses a feature newer than the contract it declares is refused, and so is a link that is not <code>http</code>, <code>https</code>, <code>mailto</code> or relative. Each message names the field and says what to do.",
				wide: true,
				demo: "",
				code: async () => {
					const sdk = await refusal(`${FIX}/grammar-input`, (m) => (m.sdk = 5), "bench/fixtures/grammar-input/tool.json, declaring sdk 5");
					const link = await refusal("tools/histogram", (m) => (m.links = [{ label: "Spec", href: "java\tscript:alert(document.cookie)" }]), "tools/histogram/tool.json, with a tab inside a link's scheme");
					REFUSALS.set("refused", `<div class="demo-grid">${refusalBox("A grammar, declaring contract 5", sdk.message)}${refusalBox("A link with a tab inside its scheme", link.message)}</div>`);
					return [sdk.manifest, link.manifest];
				},
			},
		],
	},
	{
		id: "results",
		title: "Results",
		text: "A tool returns data in one of a closed set of shapes, and the runtime draws it. The tool never writes HTML.",
		features: [
			{
				id: "bytes",
				title: "Bytes",
				text: "Offsets, hex, a printable gutter and named ranges that can wrap a row, for anyone reading a wire format.",
				demo: `<tool-host tool="utf8-bytes" mode="embed" data-run></tool-host>`,
				code: async () => [await output("tools/utf8-bytes", {})],
			},
			{
				id: "code-result",
				title: "Code, painted by the host",
				text: "A <code>code</code> result is preformatted text with a language. A host that has a highlighter passes it once, and every tool's code is painted with it.",
				demo: `<tool-host tool="regex-explainer" mode="embed" data-run></tool-host>`,
				code: () => [region("site/src/gallery-host.ts", "highlight")],
			},
			{
				id: "copy",
				title: "Copy a result",
				text: "Every code and table result has a Copy button. Code copies exactly as drawn. A table copies as tab-separated rows that paste into a spreadsheet as cells, and a cell that would run as a formula there is copied as text.",
				demo: `<tool-host tool="percentiles" mode="embed" data-run></tool-host>`,
				code: async () => [await output("tools/percentiles", {})],
			},
			{
				id: "field-faces",
				title: "A field in the text face",
				text: "A field's value is monospace, for an address or a hex string read character by character. <code>mono: false</code> sets a sentence or a plain number in the text face, in the same list.",
				demo: `<tool-host tool="field-faces" mode="embed"></tool-host>`,
				code: async () => [await output(`${FIX}/field-faces`, {})],
			},
		],
	},
	{
		id: "host",
		title: "Fitting it to your site",
		text: "The tools live in shadow roots: your CSS cannot break them, and theirs cannot break your page.",
		features: [
			{
				id: "theming",
				title: "Theming with custom properties",
				text: "A dozen <code>--tb-*</code> properties set colours, type and radius.",
				wide: true,
				demo: `<div class="demo-grid">
      <tool-host tool="utf8-bytes" mode="card"></tool-host>
      <div class="theme-demo"><tool-host tool="utf8-bytes" mode="card"></tool-host></div>
    </div>`,
				code: (demo) => [demo, region("site/src/gallery.css", "theme", "css")],
			},
			{
				id: "host-styles",
				title: "Host stylesheets",
				text: "For what a property cannot say, pass CSS to <code>defineToolHost({ styles })</code>, for every tool or one tool by id. Your rules win over the runtime's, whatever their specificity.",
				demo: `<tool-host tool="styled-output" mode="embed" id="styled"></tool-host>`,
				code: (demo) => [demo, region("site/src/gallery-host.ts", "styles")],
			},
			{
				id: "reveal",
				title: "Linking to one part of a result",
				text: "A tool can name a part of its result, and <code>host.reveal(id)</code> opens, scrolls to and focuses it.",
				demo: `<div class="reveal-demo">
      <p class="reveal-buttons"><button type="button" class="button" data-reveal="stats">Show the stats</button> <button type="button" class="button" data-reveal="fields">Show the fields</button></p>
      <tool-host tool="styled-output" mode="embed" parts="1" more="expand" id="reveal-host"></tool-host>
    </div>`,
				code: (demo) => [demo, region("site/src/gallery.ts", "reveal")],
			},
			{
				id: "table-wrap",
				title: "A wide table on a phone",
				text: "A column says whether it holds prose or a short token with <code>wrap</code>, and <code>rowHeader</code> makes one column each row's name. On a narrow tool the table keeps its columns and scrolls: tokens stay on one line, sentences get a reading width, the row's name stays in view, and a shadow shows there is more. Shown at 390px.",
				demo: `<div class="narrow-demo"><tool-host tool="narrow-table" mode="embed"></tool-host></div>`,
				code: async () => [await output(`${FIX}/narrow-table`, {})],
			},
			{
				id: "input-styles",
				title: "Styling one input",
				text: "Each input's row is named by <code>data-input</code>, <code>data-type</code> and the tool's <code>role</code>, and the controls read four properties of their own. Set one on a row and only that input changes.",
				demo: `<tool-host tool="input-help" mode="embed"></tool-host>`,
				code: () => [input(`${FIX}/input-help`, "slo"), region("site/src/gallery-host.ts", "input-styles")],
			},
			{
				id: "share",
				title: "A link to the tool with its inputs",
				text: "The link icon copies this page's address with the tool's inputs in it, and a tool opens with the inputs a link carries. An input marked <code>share: false</code>, the token here, is never put in a link or read from one.",
				wide: true,
				demo: `<div class="demo-grid">
      <tool-host tool="share-private" mode="embed"></tool-host>
      <tool-host tool="share-private" mode="embed" share-position="top" share-label="Copy link"></tool-host>
    </div>`,
				code: (demo) => [demo, input(`${FIX}/share-private`, "token")],
			},
			{
				id: "events",
				title: "Following the tool from your page",
				text: "<code>tool-input</code> fires after the inputs change and <code>tool-run</code> after a run's result is drawn, for a deep link, analytics or a button of your own. Edit the form or press Run.",
				demo: `<div class="events-demo">
      <pre class="events-log" id="events-log">No events yet.</pre>
      <tool-host tool="percentiles" mode="embed" id="events-host"></tool-host>
    </div>`,
				code: (demo) => [demo, region("site/src/gallery.ts", "events")],
			},
		],
	},
];

type Tab = { name: string; codes: Code[] };
type Card = { id: string; title: string; meta: string; text?: string; live: string; liveName?: string; tabs: Tab[]; wide?: boolean; tool?: string };

const basename = (label: string) => label.split(/[/,]/).filter(Boolean).at(-1)?.trim() ?? label;

/**
 * Sort a feature's code into the card's tabs: the manifest, the function or host code, and the embed
 * snippet. Only tabs with something in them are drawn.
 */
function tabsFor(codes: Code[]): Tab[] {
	const manifest = codes.filter((c) => c.lang === "json" && c.label.includes("tool.json"));
	const embed = codes.filter((c) => c.lang === "html");
	const code = codes.filter((c) => !manifest.includes(c) && !embed.includes(c));
	const tabs: Tab[] = [];
	if (manifest.length) tabs.push({ name: "tool.json", codes: manifest });
	if (code.length) tabs.push({ name: code[0]?.label.startsWith("What run") || code[0]?.label === "run() returns" ? "Result" : basename(code[0]?.label ?? "Code"), codes: code });
	if (embed.length) tabs.push({ name: "Embed", codes: embed.map((c) => ({ ...c, label: "Embed" })) });
	return tabs;
}

/**
 * One gallery card: a heading, then tabs (the ARIA tabs pattern, driven by src/tabs.ts). The Live panel
 * sizes the card; a code panel fills the same box and scrolls inside it, so switching tabs never moves
 * the grid. The Live panel is only made invisible when another tab is chosen, never removed, so the tool
 * in it keeps the reader's inputs and result.
 */
function card(c: Card): string {
	const all = [{ name: c.liveName ?? "Live", codes: [] as Code[] }, ...c.tabs];
	const tab = (t: Tab, k: number) =>
		`<button type="button" role="tab" id="${c.id}-tab-${k}" aria-controls="${c.id}-panel-${k}" aria-selected="${k === 0}" tabindex="${k === 0 ? 0 : -1}">${escapeHtml(t.name)}</button>`;
	const panel = (t: Tab, k: number) =>
		k === 0
			? `<div class="card-panel card-live" role="tabpanel" id="${c.id}-panel-0" aria-labelledby="${c.id}-tab-0">${c.live}</div>`
			: `<div class="card-panel card-code" role="tabpanel" id="${c.id}-panel-${k}" aria-labelledby="${c.id}-tab-${k}" tabindex="0" hidden>${t.codes.map((x) => codeBlock(x.text, x.lang, x.label)).join("")}</div>`;
	return `
  <article class="card${c.wide ? " card-wide" : ""}" id="${c.id}" aria-labelledby="${c.id}-h"${c.tool ? ` data-tool="${c.tool}"` : ""}>
    <header class="card-head"><h3 id="${c.id}-h"><a href="#${c.id}">${escapeHtml(c.title)}</a></h3><span class="card-meta">${escapeHtml(c.meta)}</span></header>
    ${c.text ? `<p class="card-text">${c.text}</p>` : ""}
    <div class="card-tabs" role="tablist" aria-label="${escapeHtml(c.title)}">${all.map(tab).join("")}</div>
    <div class="card-panels">${all.map(panel).join("")}</div>
  </article>`;
}

const KIND_WORDS: Record<string, string> = { fields: "fields", table: "a table", series: "a chart", text: "text", code: "code", bytes: "bytes" };
function list(words: string[]): string {
	return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** The example tools in tools/, one card each, with the whole manifest and the whole function. */
function toolCards(): string {
	const dirs = readdirSync(join(ROOT, "tools"), { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
	const cards = dirs
		.map((id) => ({ id, m: manifest(`tools/${id}`) as Manifest & { name: string; kinds: string[] } }))
		.sort((a, b) => a.m.name.localeCompare(b.m.name))
		.map(({ id, m }) => {
			const embed = `<tool-host tool="${id}" mode="embed"></tool-host>`;
			return card({
				id: `tool-${id}`,
				tool: id,
				title: m.name,
				text: escapeHtml((m as unknown as { blurb: string }).blurb),
				meta: `Returns ${list(m.kinds.map((k) => KIND_WORDS[k]).filter((k): k is string => Boolean(k)))}`,
				live: embed,
				tabs: [
					{ name: "tool.json", codes: [{ label: `tools/${id}/tool.json`, lang: "json", text: read(`tools/${id}/tool.json`).replace(/\n$/, "") }] },
					{ name: "index.ts", codes: [{ label: `tools/${id}/index.ts`, lang: "ts", text: read(`tools/${id}/index.ts`).replace(/\t/g, "  ").replace(/\n$/, "") }] },
					{ name: "Embed", codes: [markup(embed)] },
				],
			});
		});
	return `
<section class="group" id="tools" aria-labelledby="tools-h">
  <div class="group-head"><h2 id="tools-h">Example tools</h2></div>
  <div class="cards">${cards.join("")}
  </div>
</section>`;
}

/** A few graph families from the bench's graph-families fixture, one card each. */
const GRAPHS: { id: string; title: string; text: string }[] = [
	{ id: "flowchart", title: "Flowchart", text: "Layered, with decisions and orthogonal routing." },
	{ id: "state-spline", title: "State machine", text: "States and transitions, with spline routing." },
	{ id: "deps-orthogonal", title: "Dependency graph", text: "What depends on what, ranked along the flow." },
	{ id: "org", title: "Org chart", text: "A tree, top down." },
	{ id: "network-straight", title: "Network", text: "A force layout for links with no direction." },
	{ id: "er", title: "Entity-relationship", text: "Records with rows, and crow's feet at the ends." },
	{ id: "mind", title: "Mind map", text: "A radial layout around one idea." },
	{ id: "lanes", title: "Swimlanes", text: "Each node in its lane, in order across them." },
	{ id: "nested", title: "Nested groups", text: "Groups inside groups, each one able to close." },
];

async function charts(): Promise<string> {
	const graphs: string[] = [];
	for (const g of GRAPHS) {
		const result = await output(`${FIX}/graph-families`, { case: g.id }, "run() returns");
		const live = `<tool-host tool="graph-families" mode="embed" controls="none" data-values='{"case":"${g.id}"}' data-run></tool-host>`;
		graphs.push(card({ id: `graph-${g.id}`, title: g.title, meta: "graph", text: escapeHtml(g.text), live, tabs: [{ name: "Result", codes: [result] }, { name: "Embed", codes: [markup(live)] }] }));
	}
	const cards: string[] = [];
	for (const c of CHARTS) {
		const result = await output(`${FIX}/discrete-series`, { case: c.id }, "run() returns");
		const live = `<tool-host tool="discrete-series" mode="embed" controls="none" data-values='{"case":"${c.id}"}' data-run></tool-host>`;
		cards.push(card({ id: `chart-${c.id}`, title: c.title, meta: "chart", text: escapeHtml(c.text), live, tabs: [{ name: "Result", codes: [result] }, { name: "Embed", codes: [markup(live)] }] }));
	}
	return `
<section class="group" id="charts" aria-labelledby="charts-h">
  <div class="group-head">
    <h2 id="charts-h">Charts</h2>
    <p>Every chart kind, drawn by the runtime with no charting library. Each answers a pointer and the keyboard, and carries its numbers as a table.</p>
  </div>
  <div class="cards">${cards.join("")}
  </div>
</section>
<section class="group" id="graphs" aria-labelledby="graphs-h">
  <div class="group-head">
    <h2 id="graphs-h">Graphs</h2>
    <p>Nodes and edges: what depends on what, where a flow goes, how a tree branches.</p>
  </div>
  <div class="cards">${graphs.join("")}
  </div>
</section>`;
}

/** The whole gallery body. */
export async function galleryFeatures(): Promise<string> {
	const out: string[] = [toolCards()];
	for (const g of GROUPS) {
		const cards: string[] = [];
		for (const f of g.features) {
			const codes = await f.code(markup(f.demo));
			cards.push(card({ id: f.id, title: f.title, meta: g.title, text: f.text, live: REFUSALS.get(f.id) ?? f.demo, ...(REFUSALS.has(f.id) ? { liveName: "Message" } : {}), tabs: tabsFor(codes), ...(f.wide ? { wide: true } : {}) }));
		}
		out.push(`
<section class="group" id="${g.id}" aria-labelledby="${g.id}-h">
  <div class="group-head">
    <h2 id="${g.id}-h">${escapeHtml(g.title)}</h2>
    <p>${g.text}</p>
  </div>
  <div class="cards">${cards.join("")}
  </div>
</section>`);
	}
	return out.join("") + (await charts());
}

/** The title of a gallery group or feature by its id, for links into the gallery from the docs. */
export function galleryTitle(id: string): string | undefined {
	if (id === "charts") return "every chart kind";
	if (id === "graphs") return "graph layouts and families";
	for (const g of GROUPS) {
		if (g.id === id) return g.title;
		const f = g.features.find((x) => x.id === id);
		if (f) return f.title;
	}
	return undefined;
}

/** The gallery's own contents list, groups and their features. */
export function galleryIndex(): string {
	const groups = [
		{ id: "tools", title: "Example tools", items: [] as { id: string; title: string }[] },
		...GROUPS.map((g) => ({ id: g.id, title: g.title, items: g.features.map((f) => ({ id: f.id, title: f.title })) })),
		{ id: "charts", title: "Charts", items: [] },
		{ id: "graphs", title: "Graphs", items: [] },
	];
	return `<ol>${groups
		.map(
			(g) =>
				`<li><a href="#${g.id}">${escapeHtml(g.title)}</a>${g.items.length ? `<ol>${g.items.map((i) => `<li><a href="#${i.id}">${escapeHtml(i.title)}</a></li>`).join("")}</ol>` : ""}</li>`,
		)
		.join("")}</ol>`;
}
