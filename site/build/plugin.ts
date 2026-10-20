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
import { readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import type { Plugin } from "vite";
import { checkDiagrams, diagram, mermaidBlocks } from "./diagrams.ts";
import { galleryFeatures, galleryIndex, galleryTitle } from "./gallery.ts";
import { codeBlock, escapeHtml, highlight } from "./highlight.ts";
import { renderMarkdown, slugify, type Rendered } from "./markdown.ts";
import { hostReference, inputsReference, manifestReference, resultsReference, tokensReference } from "./reference.ts";
import { browsers, stats } from "./stats.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const GITHUB = "https://github.com/eknowledger/toolbench";
const BLOB = `${GITHUB}/blob/main`;
const EDIT = `${GITHUB}/edit/main`;

type Doc = {
	file: string;
	page: string;
	title: string;
	summary: string;
	sections?: string[];
	unnumbered?: boolean;
	/** Which list the docs sidebar puts the page in. */
	group: "Guide" | "Reference" | "Project";
	/** Markdown written at build time from the source, for a reference page; `file` is then what it is read from. */
	generate?: () => Promise<string>;
};

/**
 * The repository's markdown the site renders, one page each. The README is the exception: it is a front
 * page for GitHub, with badges and screenshots of the bench, so the site takes only its reference
 * sections, in the README's own order.
 */
export const DOCS: Doc[] = [
	{
		file: "README.md",
		page: "docs.html",
		title: "Getting started",
		summary: "Install, the quick start, and how a tool is shown, run and themed.",
		group: "Guide",
		sections: ["Install", "Quick start", "Display modes", "How a tool runs", "Result shapes", "Worker mode", "Theming", "Size and cost", "Browser and runtime support", "Non-goals"],
	},
	{ file: "docs/authoring-a-tool.md", page: "docs-authoring.html", title: "Authoring a tool", summary: "The walkthrough for a first tool, then the manifest, inputs, results and fixtures in full.", group: "Guide" },
	{ file: "STYLING.md", page: "docs-styling.html", title: "Styling", summary: "Host stylesheets, and the class names and attributes they may rely on.", group: "Guide" },
	{
		file: "docs/authoring-a-tool.md",
		page: "docs-charts.html",
		title: "Charts and graphs",
		summary: "Every chart and graph a tool can return, and what each one needs from the data.",
		sections: ["9. Charts", "9b. Graphs"],
		// "9." is where the section sits in the authoring guide; on a page of its own it reads as a stray number.
		unnumbered: true,
		group: "Guide",
	},
	{ file: "docs/versioning.md", page: "docs-versioning.html", title: "Versioning", summary: "The compatibility promise, and how the contract version rises.", group: "Guide" },
	{
		file: "packages/sdk/src/types.ts",
		page: "docs-ref-inputs.html",
		title: "Inputs",
		summary: "Every input type, its attributes, and the rules a manifest's inputs are held to.",
		group: "Reference",
		generate: inputsReference,
	},
	{
		file: "packages/sdk/src/types.ts",
		page: "docs-ref-results.html",
		title: "Results",
		summary: "Every result kind a tool can return, its attributes, and an example of each.",
		group: "Reference",
		generate: resultsReference,
	},
	{
		file: "packages/sdk/src/types.ts",
		page: "docs-ref-manifest.html",
		title: "Manifest",
		summary: "tool.json, the run function, and cases.json: every attribute and rule.",
		group: "Reference",
		generate: manifestReference,
	},
	{
		file: "packages/runtime/src/element.ts",
		page: "docs-ref-host.html",
		title: "Host API",
		summary: "defineToolHost, the element's attributes, properties and methods, and tool sources.",
		group: "Reference",
		generate: hostReference,
	},
	{
		file: "packages/runtime/src/styles.ts",
		page: "docs-ref-tokens.html",
		title: "Theme tokens",
		summary: "The custom properties a page sets to theme every tool, and the parts it can style.",
		group: "Reference",
		generate: tokensReference,
	},
	{ file: "docs/architecture.md", page: "docs-architecture.html", title: "Architecture", summary: "How it works, where the boundaries are, and how to change it.", group: "Project" },
	{ file: "SECURITY.md", page: "docs-security.html", title: "Security", summary: "The threat model, and what is in scope to report.", group: "Project" },
];

function read(path: string): string {
	return readFileSync(join(ROOT, path), "utf8");
}

/** The README cut to the sections the guide uses. Each `## ` heading starts a section. */
/** A reference page's markdown, written once per build before any page asks for it. */
const generated = new Map<string, string>();

async function generateReference(): Promise<void> {
	for (const d of DOCS) if (d.generate) generated.set(d.page, await d.generate());
}

function source(doc: Doc): string {
	if (doc.generate) return generated.get(doc.page) ?? "";
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
	const out = renderMarkdown(text, { linkFor, dropContents: true, diagram, marker });
	// Only the visible text loses its number. The ids keep it, so a link into the page still lands.
	if (doc.unnumbered) {
		const strip = (t: string) => t.replace(/^\d+[a-z]?\.\s+/, "");
		out.html = out.html.replace(/(<h[23] id="[^"]*">)\d+[a-z]?\.\s+/g, "$1");
		out.headings = out.headings.map((h) => ({ ...h, text: strip(h.text) }));
	}
	cache.set(doc.page, out);
	return out;
}

/**
 * What a `<!-- site: ... -->` line in the docs becomes. `embed id` puts the tool on the page, live;
 * `gallery id` links to the gallery example that shows the feature the section describes.
 */
function marker(kind: string, arg: string): string {
	if (kind === "embed") {
		const name = (JSON.parse(read(`site/examples/${arg}/tool.json`)) as { name: string }).name;
		return `<figure class="live-embed"><tool-host tool="${escapeHtml(arg)}" mode="page" data-run></tool-host><figcaption>The ${escapeHtml(name)} this walkthrough builds, running.</figcaption></figure>`;
	}
	if (kind === "gallery") {
		const title = galleryTitle(arg);
		if (!title) throw new Error(`a docs marker links to gallery#${arg}, which the gallery does not have`);
		return `<p class="see-live"><a href="./gallery.html#${escapeHtml(arg)}"><span class="live-dot" aria-hidden="true"></span>See it live: ${escapeHtml(title)}</a></p>`;
	}
	throw new Error(`unknown docs marker "site: ${kind}"`);
}

/** A docs page by its file name, `docs-charts.html`, which is unique where a markdown file need not be. */
/** Every ```mermaid block the site renders, for the build's check and for `pnpm site:diagrams`. */
export function diagramSources(): string[] {
	return DOCS.flatMap((d) => mermaidBlocks(source(d)));
}

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
	const link = (d: Doc) => `<li><a href="./${d.page}"${d === doc ? ' aria-current="page"' : ""}>${escapeHtml(d.title)}</a></li>`;
	const nav = (["Guide", "Reference", "Project"] as const)
		.map((g) => `<h2>${g}</h2><ul>${DOCS.filter((d) => d.group === g).map(link).join("")}</ul>`)
		.join("");
	const { html } = rendered(doc);
	return `
  <nav class="docs-nav panel" aria-label="Documentation">
    ${panelBar("docs-nav")}
    <div class="panel-body" id="docs-nav-body">
      ${nav}
      <h2>Elsewhere</h2>
      <ul>
        <li><a href="${BLOB}/CONTRIBUTING.md">Contributing</a></li>
        <li><a href="${BLOB}/ROADMAP.md">Roadmap</a></li>
      </ul>
    </div>
  </nav>
  <article class="prose">
    <h1>${escapeHtml(doc.title)}</h1>
    <p class="doc-meta">${escapeHtml(doc.summary)}</p>
    <p class="doc-links">${doc.generate ? `Generated from <a href="${BLOB}/${doc.file}" data-source-file>${escapeHtml(doc.file)}</a>` : `<a href="${BLOB}/${doc.file}" data-source-file>${escapeHtml(doc.file)}</a> <a class="edit" href="${EDIT}/${doc.file}">Edit this page on GitHub</a>`}</p>
    ${html}
  </article>
  <nav class="docs-toc panel" aria-label="On this page">
    ${panelBar("docs-toc")}
    <div class="panel-body" id="docs-toc-body">${toc(doc)}</div>
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

function list(words: string[]): string {
	if (words.length < 2) return words.join("");
	return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

const PANELS: Record<string, string> = { "docs-nav": "Documentation", "docs-toc": "On this page", "gallery-nav": "In the gallery" };

/** A sidebar's heading and the button that collapses it. See src/panels.ts. */
function panelBar(name: string): string {
	const title = PANELS[name] ?? name;
	return `<div class="panel-bar"><h2 class="panel-title">${escapeHtml(title)}</h2><button type="button" class="panel-toggle" data-panel-toggle="${name}" aria-expanded="true" aria-controls="${name}-body"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span class="visually-hidden">${escapeHtml(title)}</span></button></div>`;
}

/** The landing page's figures: one tile each, every value read from the file that owns it. */
function statTiles(): string {
	const tiles = stats()
		.map((t) => `<li class="stat" data-stat="${t.id}"><span class="stat-value">${escapeHtml(t.value)}</span><span class="stat-label">${escapeHtml(t.label)}</span></li>`)
		.join("");
	// The browsers the suite runs in, as their icons and names: a picture, where a count would say little.
	const names = browsers();
	const icons = names
		.map((n) => `<li><svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" focusable="false">${BROWSER_ICONS[n] ?? ""}</svg><span>${escapeHtml(n)}</span></li>`)
		.join("");
	const label = `Tested in ${list(names)}`;
	return `<ul class="stats" role="list">${tiles}<li class="stat stat-browsers" data-stat="browsers" aria-label="${escapeHtml(label)}"><ul class="browser-icons" role="list">${icons}</ul><span class="stat-label">tested on every change</span></li></ul>`;
}

/** Plain line drawings, one per browser: recognisable at a glance, and the name sits beside each. */
const BROWSER_ICONS: Record<string, string> = {
	Chrome: '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M12 8h8.7M8.6 14 4.2 6.5M15.4 14l-4.3 7.9"/></g>',
	Firefox: '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M6.2 5.8c.4 3.2 2.6 5.3 5.6 5.3 2.4 0 4 1.7 4 3.8 0 2.4-2 4.2-4.6 4.2-3 0-5.4-2.4-5.4-5.4"/><path d="M14.2 2.4c1.3 1.8 1.2 4-.4 5.6"/></g>',
	Safari: '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/><path d="m16 8-2.6 5.4L8 16l2.6-5.4Z"/></g>',
};

/**
 * The mark, drawn from the repository's own logo files so it cannot drift from them: the shapes from
 * assets/logo.svg, and each colour from that file for the light theme and from assets/logo-dark.svg for
 * the dark one. The site once drew the brackets in its own ink and the triangle in one amber for both
 * themes, which is not the logo: dark brackets where the dark logo has light ones.
 */
function logo(large: boolean): string {
	const light = read("assets/logo.svg");
	const dark = read("assets/logo-dark.svg");
	const paths = (svg: string) => [...svg.matchAll(/<path\b([^>]*)\/>/g)].map((m) => m[1] ?? "");
	const attr = (p: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(p)?.[1] ?? "";
	const [bracketL, runL] = paths(light);
	const [bracketD, runD] = paths(dark);
	if (!bracketL || !runL || !bracketD || !runD) throw new Error("assets/logo.svg and logo-dark.svg must each have the bracket path and the triangle path");
	const size = large ? 64 : 28;
	return `<svg class="mark${large ? " mark-large" : ""}" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path d="${attr(bracketL, "d")}" fill="none" stroke-width="${attr(bracketL, "stroke-width")}" stroke-linecap="round" style="stroke: ${attr(bracketL, "stroke")}; stroke: light-dark(${attr(bracketL, "stroke")}, ${attr(bracketD, "stroke")})"/><path d="${attr(runL, "d")}" style="fill: ${attr(runL, "fill")}; fill: light-dark(${attr(runL, "fill")}, ${attr(runD, "fill")})"/></svg>`;
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
		// The build only reads drawings. A diagram edited without `pnpm site:diagrams` fails here, by name.
		async buildStart() {
			await generateReference();
			checkDiagrams(diagramSources());
		},
		configureServer(server) {
			// The markdown lives outside the Vite root, so tell the watcher, and reload the page on an edit.
			for (const d of DOCS) server.watcher.add(join(ROOT, d.file));
			server.watcher.on("change", (file) => {
				if (file.endsWith(".md") || file.endsWith("tool.json")) {
					cache.clear();
					server.ws.send({ type: "full-reload" });
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
						case "panel-bar":
							return panelBar(arg);
						case "logo":
							return logo(arg === "large");
						default:
							return whole;
					}
				});
			},
		},
	};
}
