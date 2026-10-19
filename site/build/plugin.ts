/**
 * Build-time content for the site's pages, so nothing a visitor reads is a copy that can drift.
 *
 * Each page is plain HTML with comment directives, replaced here before Vite sees the markup:
 *
 *   <!-- partial:header -->                    a file from site/partials/
 *   <!-- doc:STYLING.md -->                    a whole docs page: navigation, the file rendered, its contents
 *   <!-- doc-title:STYLING.md -->              that page's title
 *   <!-- readme-block:0 -->                    the README's first fenced block, highlighted
 *   <!-- trace:tools/histogram/tool.json -->   a manifest, each input's lines tagged with its id
 *   <!-- gallery -->                           every tool in tools/, with its source
 *   <!-- gallery-features -->, <!-- gallery-index -->  every runtime feature, live, beside its code
 *   <!-- stats -->                             the landing page's figures, each read from its source
 *   <!-- version -->                           the runtime's version, from packages/runtime/package.json
 *   <!-- runtime-kb -->                        the runtime's gzipped size, as size-check.mjs publishes it
 *   <!-- fonts -->                             the web font, only when built with SITE_FONT=atkinson
 *
 * `transformIndexHtml` runs in dev and in the build alike, so the dev server shows what ships.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import type { Plugin } from "vite";
import { diagram, mermaidBlocks, prepareDiagrams } from "./diagrams.ts";
import { galleryFeatures, galleryIndex } from "./gallery.ts";
import { codeBlock, escapeHtml, highlight } from "./highlight.ts";
import { renderMarkdown, slugify, type Rendered } from "./markdown.ts";
import { stats } from "./stats.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const GITHUB = "https://github.com/eknowledger/toolbench";
const BLOB = `${GITHUB}/blob/main`;
const EDIT = `${GITHUB}/edit/main`;

type Doc = { file: string; page: string; title: string; summary: string; sections?: string[] };

/**
 * The repository's markdown the site renders, one page each. The README is the exception: it is a front
 * page for GitHub, with badges and screenshots of the bench, so the site takes only its reference
 * sections, in the README's own order.
 */
export const DOCS: Doc[] = [
	{
		file: "README.md",
		page: "docs.html",
		title: "Guide",
		summary: "Install, the quick start, and how a tool is shown, run and themed.",
		sections: ["Install", "Quick start", "Display modes", "How a tool runs", "Result shapes", "Worker mode", "Theming", "Size and cost", "Browser and runtime support", "Non-goals"],
	},
	{ file: "docs/authoring-a-tool.md", page: "docs-authoring.html", title: "Authoring a tool", summary: "The walkthrough for a first tool, then the manifest, inputs, results and fixtures in full." },
	{ file: "STYLING.md", page: "docs-styling.html", title: "Styling", summary: "Host stylesheets, and the class names and attributes they may rely on." },
	{
		file: "docs/authoring-a-tool.md",
		page: "docs-charts.html",
		title: "Chart reference",
		summary: "Every chart a tool can return, and what each one needs from the data.",
		sections: ["9. Charts"],
	},
	{ file: "docs/versioning.md", page: "docs-versioning.html", title: "Versioning", summary: "The compatibility promise, and how the contract version rises." },
	{ file: "docs/architecture.md", page: "docs-architecture.html", title: "Architecture", summary: "How it works, where the boundaries are, and how to change it." },
	{ file: "SECURITY.md", page: "docs-security.html", title: "Security", summary: "The threat model, and what is in scope to report." },
];

function read(path: string): string {
	return readFileSync(join(ROOT, path), "utf8");
}

/** The README cut to the sections the guide uses. Each `## ` heading starts a section. */
function source(doc: Doc): string {
	const text = read(doc.file);
	if (!doc.sections) return text;
	const parts = text.split(/^(?=## )/m);
	return doc.sections
		.map((name) => {
			const part = parts.find((p) => p.startsWith(`## ${name}\n`));
			if (!part) throw new Error(`${doc.file} has no section "## ${name}", which the site's guide renders`);
			return part;
		})
		.join("\n");
}

const cache = new Map<string, Rendered>();

function rendered(doc: Doc): Rendered {
	const hit = cache.get(doc.page);
	if (hit) return hit;
	const text = source(doc);
	// Which anchors this page will have, so a link to a heading the site did not render goes to GitHub.
	const slugsOf = (d: Doc) => new Set([...source(d).matchAll(/^#{1,6}\s+(.*)$/gm)].map((m) => slugify((m[1] ?? "").replace(/`/g, ""))));
	const linkFor = (href: string): string => {
		if (/^(?:[a-z]+:|\/\/)/i.test(href)) return href;
		const [path = "", hash = ""] = href.split("#");
		const target = path === "" ? doc.file : normalize(join(dirname(doc.file), path));
		// This page first, then whichever site page renders that file and has that heading.
		if (target === doc.file && hash && slugsOf(doc).has(hash)) return `#${hash}`;
		const page = DOCS.find((d) => d.file === target && (hash === "" || slugsOf(d).has(hash)));
		if (page) return hash ? `./${page.page}#${hash}` : `./${page.page}`;
		return `${BLOB}/${target}${hash ? `#${hash}` : ""}`;
	};
	const out = renderMarkdown(text, { linkFor, dropContents: true, diagram });
	cache.set(doc.page, out);
	return out;
}

/** A docs page by its file name, `docs-charts.html`, which is unique where a markdown file need not be. */
function docFor(page: string): Doc {
	const doc = DOCS.find((d) => d.page === page);
	if (!doc) throw new Error(`site/build/plugin.ts: no docs page ${page}`);
	return doc;
}

function toc(doc: Doc): string {
	let html = "<ol>";
	let open = false;
	for (const h of rendered(doc).headings) {
		if (h.depth === 2) {
			if (open) html += "</ol></li>";
			html += `<li><a href="#${h.slug}">${escapeHtml(h.text)}</a><ol>`;
			open = true;
		} else if (h.depth === 3 && open) html += `<li><a href="#${h.slug}">${escapeHtml(h.text)}</a></li>`;
	}
	if (open) html += "</ol></li>";
	return `${html}</ol>`.replace(/<ol><\/ol>/g, "");
}

function docPage(doc: Doc): string {
	const nav = DOCS.map(
		(d) => `<li><a href="./${d.page}"${d === doc ? ' aria-current="page"' : ""}>${escapeHtml(d.title)}</a></li>`,
	).join("");
	const { html } = rendered(doc);
	return `
  <nav class="docs-nav" aria-label="Documentation">
    <h2>Documentation</h2>
    <ul>${nav}</ul>
    <h2>Elsewhere</h2>
    <ul>
      <li><a href="${BLOB}/CONTRIBUTING.md">Contributing</a></li>
      <li><a href="${BLOB}/ROADMAP.md">Roadmap</a></li>
    </ul>
  </nav>
  <article class="prose">
    <h1>${escapeHtml(doc.title)}</h1>
    <p class="doc-meta">${escapeHtml(doc.summary)} From <a href="${BLOB}/${doc.file}" data-source-file>${escapeHtml(doc.file)}</a>, rendered when this site was built. <a class="edit" href="${EDIT}/${doc.file}">Edit this page on GitHub</a></p>
    ${html}
  </article>
  <nav class="docs-toc" aria-label="On this page">
    <h2>On this page</h2>
    ${toc(doc)}
  </nav>`;
}

/**
 * The runtime's gzipped size, read from the figure `scripts/size-check.mjs --update` writes into the
 * README's size table, with the same pattern it writes with. One published number, not a second
 * measurement that could round differently: the README, the badge and this page then always agree.
 */
export function runtimeKb(): string {
	const match = /\| Runtime[^|]*\| ([\d.]+) KB/.exec(read("README.md"));
	if (!match?.[1]) throw new Error("README.md has no '| Runtime ... | n KB' row for the landing page to quote");
	return match[1];
}

function readmeBlock(n: number): string {
	const blocks = [...read("README.md").matchAll(/^```(\w*)\n([\s\S]*?)^```/gm)];
	const block = blocks[n];
	if (!block) throw new Error(`README.md has no fenced block ${n}`);
	const [, lang = "", code = ""] = block;
	const body = code.replace(/\n$/, "");
	const first = body.split("\n")[0] ?? "";
	// "// tools/reverse/index.ts" names the file; it becomes the label rather than a comment line.
	const named = /^\/\/\s*(\S+\.\w+)\s*$/.exec(first);
	const label = named ? named[1] : lang === "html" ? "page.html" : lang;
	const shown = named ? body.split("\n").slice(1).join("\n") : body;
	return codeBlock(shown, lang, label);
}

/**
 * A manifest with each line of each input wrapped in a span naming that input, so the page can light
 * the lines a form control came from. Found by bracket depth rather than by parsing, because the
 * line numbers are the point.
 */
function trace(path: string): string {
	const lines = read(path).replace(/\n$/, "").split("\n");
	let inInputs = false;
	let depth = 0;
	let current: { start: number; id: string | null } | null = null;
	const owner: (string | null)[] = lines.map(() => null);
	for (const [n, line] of lines.entries()) {
		if (/"inputs"\s*:\s*\[/.test(line)) {
			inInputs = true;
			continue;
		}
		if (!inInputs) continue;
		for (const ch of line) {
			if (ch === "{") {
				if (depth === 0) current = { start: n, id: null };
				depth++;
			} else if (ch === "}") depth--;
		}
		const id = /"id"\s*:\s*"([^"]+)"/.exec(line);
		if (current && id && current.id === null) current.id = id[1] ?? null;
		if (current && depth === 0) {
			for (let k = current.start; k <= n; k++) owner[k] = current.id;
			current = null;
		}
		if (depth === 0 && /^\s*\]/.test(line)) inInputs = false;
	}
	const body = lines
		.map((line, n) => {
			const id = owner[n];
			// Block spans with no newline between them: a newline as well would double every line's height.
			return `<span class="line"${id ? ` data-input="${id}"` : ""}>${highlight(line, "json") || " "}</span>`;
		})
		.join("");
	return `<pre class="code trace" data-lang="json" tabindex="0" aria-label="${escapeHtml(path)}"><code>${body}</code></pre>`;
}

type ToolInfo = { id: string; name: string; thread: string; returns: string[]; version: string; inputs: number };

const KIND_WORDS: Record<string, string> = {
	fields: "fields",
	table: "a table",
	series: "a chart",
	text: "text",
	code: "code",
	bytes: "bytes",
	heatmap: "a heatmap",
	pie: "a pie",
};

function tools(): ToolInfo[] {
	return readdirSync(join(ROOT, "tools"), { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => {
			const m = JSON.parse(read(`tools/${d.name}/tool.json`)) as {
				id: string;
				name: string;
				version: string;
				runtime: { thread?: string };
				kinds: string[];
				inputs: unknown[];
			};
			return {
				id: m.id,
				name: m.name,
				version: m.version,
				thread: m.runtime.thread === "worker" ? "a worker" : "the page",
				returns: m.kinds.map((k) => KIND_WORDS[k]).filter((k): k is string => Boolean(k)),
				inputs: m.inputs.length,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

function list(words: string[]): string {
	if (words.length < 2) return words.join("");
	return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** A list of every tool beside one tool at full size, with its facts and its source. */
function gallery(): string {
	const all = tools();
	return `
<div class="gallery">
  <nav class="tool-index" aria-label="Tools">
    <ul>${all
			.map(
				(t) => `
      <li><a href="#${t.id}" data-pick="${t.id}"><span class="tool-index-name">${escapeHtml(t.name)}</span><span class="tool-index-meta">Returns ${list(t.returns)}</span></a></li>`,
			)
			.join("")}
    </ul>
  </nav>
  <div class="tool-panes">${all
		.map(
			(t) => `
    <section class="tool-pane" id="${t.id}" aria-label="${escapeHtml(t.name)}">
      <tool-host tool="${t.id}" mode="page"></tool-host>
      <dl class="facts">
        <div><dt>Runs in</dt><dd>${t.thread}</dd></div>
        <div><dt>Returns</dt><dd>${list(t.returns)}</dd></div>
        <div><dt>Inputs</dt><dd>${t.inputs}</dd></div>
        <div><dt>Version</dt><dd>${t.version}</dd></div>
      </dl>
      <details class="source" data-source="${t.id}"><summary>View source</summary><div class="source-body"><p class="source-loading">Loading the files.</p></div></details>
    </section>`,
		)
		.join("")}
  </div>
</div>`;
}

/*
 * The web font is opt-in at build time, so the two builds can be measured against each other. The files
 * are subsets made by `site/build/subset-font.py`: the site's characters, at 400 and 700 only.
 */
/** The landing page's figures: one tile each, every value read from the file that owns it. */
function statTiles(): string {
	return `<ul class="stats" role="list">${stats()
		.map((t) => `<li class="stat" data-stat="${t.id}"><span class="stat-value">${escapeHtml(t.value)}</span><span class="stat-label">${escapeHtml(t.label)}</span></li>`)
		.join("")}</ul>`;
}

function fonts(): string {
	if (process.env.SITE_FONT !== "atkinson") return "";
	return `<link rel="preload" href="/fonts/atkinson-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/atkinson-700.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="./src/fonts.css">`;
}

export function siteContent(): Plugin {
	return {
		name: "toolbench-site-content",
		// Draw any diagram the cache lacks before a page asks for it. In dev and in the build alike.
		async buildStart() {
			await prepareDiagrams(DOCS.flatMap((d) => mermaidBlocks(source(d))));
		},
		configureServer(server) {
			// The markdown lives outside the Vite root, so tell the watcher, and reload the page on an edit.
			for (const d of DOCS) server.watcher.add(join(ROOT, d.file));
			server.watcher.on("change", (file) => {
				if (file.endsWith(".md") || file.endsWith("tool.json")) {
					cache.clear();
					void prepareDiagrams(DOCS.flatMap((d) => mermaidBlocks(source(d)))).then(() => server.ws.send({ type: "full-reload" }));
				}
			});
		},
		transformIndexHtml: {
			order: "pre",
			async handler(html, ctx) {
				// Partials first, so a partial may itself contain directives.
				for (let depth = 0; depth < 4 && /<!--\s*partial:/.test(html); depth++) {
					html = html.replace(/<!--\s*partial:([\w-]+)\s*-->/g, (_, name: string) =>
						readFileSync(join(import.meta.dirname, "../partials", `${name}.html`), "utf8").trim(),
					);
				}
				// The current section's navigation link, marked in the static markup rather than by a script.
				const file = ctx.path.split("/").at(-1) || "index.html";
				const section = file.startsWith("docs") ? "docs.html" : file;
				html = html.replace(/<a([^>]*?)data-nav href="\.\/([\w.-]+)"/g, (whole, pre: string, href: string) =>
					href === section ? `<a${pre}data-nav aria-current="page" href="./${href}"` : whole,
				);
				// The one directive that runs tools, so the one that is awaited.
				if (html.includes("<!-- gallery-features -->")) html = html.replace("<!-- gallery-features -->", await galleryFeatures());
				return html.replace(/<!--\s*([\w-]+)(?::([^\s]+))?\s*-->/g, (whole, name: string, arg = "") => {
					switch (name) {
						case "doc":
							return docPage(docFor(arg));
						case "doc-title":
							return escapeHtml(docFor(arg).title);
						case "readme-block":
							return readmeBlock(Number(arg));
						case "trace":
							return trace(arg);
						case "gallery":
							return gallery();
						case "gallery-index":
							return galleryIndex();
						case "stats":
							return statTiles();
						case "runtime-kb":
							return runtimeKb();
						case "version":
							return escapeHtml((JSON.parse(read("packages/runtime/package.json")) as { version: string }).version);
						case "fonts":
							return fonts();
						default:
							return whole;
					}
				});
			},
		},
	};
}
