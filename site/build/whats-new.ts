/**
 * The "What's new" page, built from the two packages' CHANGELOG.md files, so a release needs no step
 * beyond its changesets.
 *
 * The convention a changeset follows is in CONTRIBUTING.md ("Writing a changeset"). In short, an entry
 * starts with `**New: Name.**`, `**Fixed: Name.**` or `**Changed: Name.**` and one short sentence, which is
 * the page's line, and an HTML comment, invisible on GitHub, gives the links:
 *
 *   <!-- whats-new: gallery=reset docs=docs.html#reset shot=reset label="On by default" -->
 *
 * A later paragraph of the same entry that starts the same way is a second item, for a changeset that
 * shipped two things. Everything else in an entry is detail for the changelog, and the page ignores it.
 *
 * The packages share a version (a fixed group), so their sections for one version are merged, and an
 * entry both changelogs carry appears once.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { escapeHtml } from "./highlight.ts";
import { inline } from "./markdown.ts";
import { isSafeLinkHref } from "../../packages/sdk/src/links.ts";

const ROOT = resolve(import.meta.dirname, "../..");
export const CHANGELOGS = ["packages/runtime/CHANGELOG.md", "packages/sdk/CHANGELOG.md"];
/** Where `pnpm site:shots` writes, and where the build looks. Served from the site's root. */
export const SHOTS_DIR = "site/public/whats-new";
const KINDS = { New: "new", Changed: "changed", Fixed: "fixed" } as const;
type Kind = (typeof KINDS)[keyof typeof KINDS];
export const GROUPS: { kind: Kind; title: string }[] = [
	{ kind: "new", title: "New" },
	{ kind: "changed", title: "Changed" },
	{ kind: "fixed", title: "Fixed" },
];
/** A group longer than this shows its first `SHOWN` items and folds the rest. Folding one item saves nothing. */
const FOLD_OVER = 5;
const SHOWN = 4;
/** The page's line is one sentence a reader can take in at a glance; past this it is a paragraph. */
const MAX_LINE = 120;

export type Item = {
	kind: Kind;
	name: string;
	/** The one sentence, as markdown. */
	line: string;
	gallery?: string;
	docs?: string;
	shot?: string;
	label?: string;
	/** Where it came from, for an error message: `packages/sdk/CHANGELOG.md 0.12.0`. */
	from: string;
};
export type Release = { version: string; date: string | null; items: Item[] };

const ITEM = /^\*\*(New|Fixed|Changed): ([^*]+?)\.\*\*\s+([\s\S]+)$/;
const COMMENT = /<!--\s*whats-new:([\s\S]*?)-->/;
const KEYS = new Set(["gallery", "docs", "shot", "label"]);
const SLUG = /^[a-z0-9-]+$/;
const DOCS_LINK = /^[a-z0-9-]+\.html(?:#[a-z0-9-]+)?$/;

function fail(from: string, message: string): never {
	throw new Error(`What's new, ${from}: ${message}. The convention is in CONTRIBUTING.md, "Writing a changeset".`);
}

function parseItem(paragraph: string, from: string): Item | null {
	const m = ITEM.exec(paragraph.trim());
	if (!m) return null;
	const [, kind = "", name = "", rest = ""] = m;
	const item: Item = { kind: KINDS[kind as keyof typeof KINDS], name: name.trim(), line: "", from };
	const comment = COMMENT.exec(rest);
	if (comment) {
		for (const a of (comment[1] ?? "").matchAll(/([\w-]+)=(?:"([^"]*)"|(\S+))/g)) {
			const key = a[1] ?? "";
			if (!KEYS.has(key)) fail(from, `"${item.name}" has an unknown key "${key}" in its whats-new comment`);
			(item as unknown as Record<string, string | undefined>)[key] = a[2] ?? a[3];
		}
	}
	// The issue link stays in the changelog. On the page it would be a third kind of link on every line.
	item.line = rest
		.replace(COMMENT, "")
		.replace(/\(\[#\d+\]\([^)]*\)(?:,\s*\[#\d+\]\([^)]*\))*\)/g, "")
		.replace(/\s+/g, " ")
		.trim();
	if (!item.name) fail(from, "an item has no name");
	if (!item.line) fail(from, `"${item.name}" has no sentence after its name`);
	if (item.line.length > MAX_LINE) fail(from, `"${item.name}" has a ${item.line.length}-character line; keep it to one sentence under ${MAX_LINE}`);
	if (/[.!?]\s+[A-Z]/.test(item.line)) fail(from, `"${item.name}" has more than one sentence in its line; put the rest in a paragraph below`);
	if (`${item.name}${item.line}`.includes("\u2014")) fail(from, `"${item.name}" has an em dash`);
	/*
	 * The page writes these into attributes and renders the line as markup, so each is held to the shape it
	 * needs rather than trusted. A changelog is reviewed text, so this is defence in depth, and cheap.
	 */
	for (const [key, value] of [["gallery", item.gallery], ["shot", item.shot]] as const)
		if (value !== undefined && !SLUG.test(value)) fail(from, `"${item.name}" has ${key}=${value}; it must be lower-case letters, digits and hyphens`);
	if (item.docs !== undefined && !DOCS_LINK.test(item.docs)) fail(from, `"${item.name}" has docs=${item.docs}; write a site page, page.html or page.html#anchor`);
	// A friendlier error than the renderer's: the line is rendered with noRawTags, so a tag could only ever
	// show as text, and this says so before it does. The renderer, not this regex, is what keeps tags out.
	if (/[\u0000-\u001f\u007f]/.test(item.line)) fail(from, `"${item.name}" has a control character in its line`);
	const prose = item.line.replace(/(`+)[\s\S]*?\1/g, "");
	if (prose.includes("<")) fail(from, `"${item.name}" has a "<" in its line outside a code span`);
	for (const link of prose.matchAll(/\]\(([^)\s]*)\)/g))
		if (/^[a-z][a-z0-9+.-]*:/i.test(link[1] ?? "") && !/^https?:/i.test(link[1] ?? "")) fail(from, `"${item.name}" links to ${link[1]}; only relative and http(s) links`);
	return item;
}

/**
 * The check on a line's links that decides what is rendered: it runs inside `inline()`'s own link
 * replacement, on the href it is about to write, and asks the SDK's URL-parser test, the same one the runtime
 * holds manifest links to. The parse-time check above reads the raw text with a regex of its own, so on its
 * own it could disagree with what the renderer finds; this one cannot, because it is the renderer's input.
 */
export function safeLink(name: string): (href: string) => string {
	return (href) => {
		if (!isSafeLinkHref(href)) throw new Error(`site/build/whats-new.ts: "${name}" links to ${JSON.stringify(href)}; only relative and http(s) links, with no spaces or control characters`);
		return href;
	};
}

/** Every version section of one changelog, its entries' items in order. */
export function parseChangelog(text: string, file: string): Map<string, Item[]> {
	const out = new Map<string, Item[]>();
	const sections = text.split(/^## /m).slice(1);
	for (const section of sections) {
		const version = (section.split("\n")[0] ?? "").trim();
		if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
		const from = `${file} ${version}`;
		const items: Item[] = [];
		// An entry is a top-level bullet; its continuation lines are indented under it.
		const entries = section.split(/^- /m).slice(1);
		for (const raw of entries) {
			const lines = raw.replace(/\n(?:###? [\s\S]*)?$/, "").split("\n");
			const first = lines[0] ?? "";
			if (first.startsWith("Updated dependencies")) continue;
			// changelog-github writes "[#228](...) [`sha`](...) Thanks [@who](...)! - " before the text.
			const lead = first.includes("! - ") ? first.slice(first.indexOf("! - ") + 4) : first;
			const body = [lead, ...lines.slice(1).map((l) => l.replace(/^ {2}/, ""))].join("\n");
			const paragraphs = body.split(/\n[ \t]*\n/);
			const head = parseItem(paragraphs[0] ?? "", from);
			if (!head) fail(from, `an entry does not start with **New: Name.**, **Fixed: Name.** or **Changed: Name.**: "${lead.slice(0, 70)}"`);
			items.push(head);
			for (const p of paragraphs.slice(1)) {
				const more = parseItem(p, from);
				if (more) items.push(more);
			}
		}
		out.set(version, items);
	}
	return out;
}

/**
 * The date each version first appeared in a changelog, from one `git log` over both files: the commit that
 * wrote its heading, which is the "chore: version packages" merge. Tags would do too, but a tag can be
 * pushed days after its release (0.8.0's was), and a checkout need not fetch tags.
 */
function releaseDates(): Map<string, string> {
	const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
	// ⚠️ A shallow clone has one commit, which would date every release to today without complaint.
	if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true")
		throw new Error("What's new: the release dates come from git history, and this clone is shallow. Fetch the whole history (actions/checkout with fetch-depth: 0).");
	const log = git(["log", "--reverse", "--format=%x00%cs", "-p", "--unified=0", "--", ...CHANGELOGS]);
	const dates = new Map<string, string>();
	let date = "";
	for (const line of log.split("\n")) {
		if (line.startsWith("\u0000")) date = line.slice(1).trim();
		else {
			const m = /^\+## (\d+\.\d+\.\d+)\s*$/.exec(line);
			if (m?.[1] && !dates.has(m[1])) dates.set(m[1], date);
		}
	}
	return dates;
}

export function compareVersions(a: string, b: string): number {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
	return 0;
}

let cached: Release[] | null = null;

/**
 * Both changelogs' items per version, merged, with no git and no dates: what the page and the GitHub
 * release notes (scripts/release-notes.mjs) both list.
 */
export function mergedItems(): Map<string, Item[]> {
	const merged = new Map<string, Item[]>();
	for (const file of CHANGELOGS) {
		for (const [version, items] of parseChangelog(readFileSync(join(ROOT, file), "utf8"), file)) {
			const list = merged.get(version) ?? [];
			// One item per kind and name: an entry both packages list, or one change written as several entries.
			for (const item of items) if (!list.some((x) => x.kind === item.kind && x.name.toLowerCase() === item.name.toLowerCase())) list.push(item);
			merged.set(version, list);
		}
	}
	return merged;
}

/** Every release in either changelog, newest first, the two packages merged. */
export function releases(): Release[] {
	if (cached) return cached;
	const merged = mergedItems();
	const dates = releaseDates();
	cached = [...merged]
		.map(([version, items]) => ({ version, date: dates.get(version) ?? null, items }))
		.sort((a, b) => compareVersions(a.version, b.version));
	return cached;
}

/** Forget the parsed changelogs, for the dev server after an edit. */
export function clearReleases(): void {
	cached = null;
}

export function shotFiles(shot: string): string[] {
	return ["light", "dark"].map((scheme) => `${SHOTS_DIR}/${shot}-${scheme}.jpg`);
}

/**
 * What the build holds the changelogs to beyond their shape: a screenshot exists in both themes. Gallery and
 * docs links are checked by the site test, against the built pages, which are the only complete list.
 */
export function checkReleases(options: { allowMissingShots?: boolean } = {}): void {
	const missing: string[] = [];
	for (const r of releases()) {
		for (const item of r.items) {
			if (item.shot && !item.gallery) fail(item.from, `"${item.name}" has a shot but no gallery entry to take it from`);
			if (item.docs && !/^[\w-]+\.html(?:#[\w-]+)?$/.test(item.docs)) fail(item.from, `"${item.name}" has docs=${item.docs}; write a site page, page.html#anchor`);
			if (item.shot) for (const f of shotFiles(item.shot)) if (!existsSync(join(ROOT, f))) missing.push(`${f} (${item.name}, ${r.version})`);
		}
	}
	if (missing.length && !options.allowMissingShots)
		throw new Error(`What's new: missing screenshots:\n  ${missing.join("\n  ")}\nRun \`pnpm site:shots\`, which builds the site and takes them.`);
}

/** Every item with a screenshot, for `pnpm site:shots`. */
export function shotItems(): Item[] {
	const seen = new Set<string>();
	return releases()
		.flatMap((r) => r.items)
		.filter((i) => i.shot && !seen.has(i.shot) && seen.add(i.shot));
}

export const anchor = (version: string) => `v${version.replace(/\./g, "-")}`;

/** "5 new, 3 fixed". */
export function counts(r: Release): string {
	const parts = GROUPS.map((g) => [g, r.items.filter((i) => i.kind === g.kind).length] as const)
		.filter(([, n]) => n > 0)
		.map(([g, n]) => `${n} ${g.title.toLowerCase()}`);
	return parts.join(", ") || "no changes";
}

/** The sentence after the name reads as its continuation: "Reset button: puts a tool's inputs back". */
export function continuation(line: string): string {
	// Only an ordinary capitalised word: "ToolHostAttributes" or "ER" keeps its capitals.
	const word = /^\S+/.exec(line)?.[0] ?? "";
	return /^[A-Z][a-z]*[,.]?$/.test(word) ? line[0]?.toLowerCase() + line.slice(1) : line;
}

function itemHtml(item: Item): string {
	const hidden = `<span class="visually-hidden">: ${escapeHtml(item.name)}</span>`;
	const links: string[] = [];
	if (item.gallery) links.push(`<a href="./gallery.html#${escapeHtml(item.gallery)}">Try it${hidden}</a>`);
	if (item.docs) links.push(`<a href="./${escapeHtml(item.docs)}">Docs${hidden}</a>`);
	if (item.shot) {
		const [light = "", dark = ""] = shotFiles(item.shot).map((f) => `./${f.replace(/^site\/public\//, "")}`);
		links.push(`<a href="${escapeHtml(light)}" data-shot-dark="${escapeHtml(dark)}" data-shot-name="${escapeHtml(item.name)}" aria-haspopup="dialog">Screenshot${hidden}</a>`);
	}
	const flag = item.label ? ` <span class="wn-flag">${escapeHtml(item.label)}</span>` : "";
	const linkRow = links.length ? ` <span class="wn-links">${links.join(" ")}</span>` : "";
	return `<li><strong>${escapeHtml(item.name)}:</strong> ${inline(continuation(item.line), { linkFor: safeLink(item.name), noRawTags: true })}${flag}${linkRow}</li>`;
}

function releaseHtml(r: Release): string {
	const id = anchor(r.version);
	const date = r.date ? `<time datetime="${r.date}">${r.date}</time>` : `<span class="wn-unreleased">not yet released</span>`;
	let html = `<section class="wn-release" aria-labelledby="${id}">\n<h2 id="${id}"><span class="wn-ver">${r.version}</span> ${date}</h2>\n`;
	for (const g of GROUPS) {
		const items = r.items.filter((i) => i.kind === g.kind);
		if (!items.length) continue;
		html += `<h3 class="wn-group wn-${g.kind}">${g.title} (${items.length})</h3>\n`;
		const fold = items.length > FOLD_OVER;
		const shown = fold ? items.slice(0, SHOWN) : items;
		html += `<ul class="wn-list">${shown.map(itemHtml).join("")}</ul>\n`;
		if (fold) {
			const rest = items.slice(SHOWN);
			html += `<details class="wn-more"><summary>and ${rest.length} more</summary><ul class="wn-list">${rest.map(itemHtml).join("")}</ul></details>\n`;
		}
	}
	if (!r.items.length) html += `<p>No changes a reader would notice.</p>\n`;
	return `${html}</section>`;
}

const BLOB = "https://github.com/eknowledger/toolbench/blob/main";

/** The page's middle column and its releases sidebar. The docs navigation is the caller's. */
export function whatsNewBody(): { article: string; toc: string } {
	const all = releases();
	const jump = all.map((r) => `<a href="#${anchor(r.version)}">${r.version}</a>`).join("");
	const article = `<article class="prose wn">
    <h1>What's new</h1>
    <p class="doc-meta">What changed in each release of <code>@toolbench/runtime</code> and <code>@toolbench/sdk</code>, newest first, one line each. Generated from the ${CHANGELOGS.map((f) => `<a href="${BLOB}/${f}" data-source-file>${escapeHtml(f.split("/")[1] ?? f)} changelog</a>`).join(" and ")}, which have the detail.</p>
    <nav class="wn-jump" aria-label="Releases">${jump}</nav>
    ${all.map(releaseHtml).join("\n")}
  </article>`;
	const toc = `<ol>${all.map((r) => `<li><a href="#${anchor(r.version)}"><span class="wn-toc-ver">${r.version}</span> <span class="wn-toc-meta">${r.date ?? "not yet released"} · ${counts(r)}</span></a></li>`).join("")}</ol>`;
	return { article, toc };
}

/** The one shared screenshot viewer, opened by src/whats-new.ts. Without script, each link opens the image. */
export function shotDialog(): string {
	return `<dialog class="wn-shot" aria-labelledby="wn-shot-title">
    <div class="wn-shot-bar"><p id="wn-shot-title" class="wn-shot-title">Screenshot</p><form method="dialog"><button type="submit" class="button" autofocus>Close</button></form></div>
    <img class="wn-shot-light" alt="">
    <img class="wn-shot-dark" alt="">
  </dialog>`;
}

/**
 * The landing page's line: the latest release's first three new things, by name. Fixes fill in when a
 * release has fewer, because "New in 0.10.1:" and nothing after it says less than the fix.
 */
export function latestLine(): string {
	const latest = releases().find((r) => r.date) ?? releases()[0];
	if (!latest) return "";
	const ordered = [...latest.items.filter((i) => i.kind === "new"), ...latest.items.filter((i) => i.kind !== "new")];
	const names = ordered.slice(0, 3).map((i, n) => (n === 0 ? i.name : continuation(i.name)));
	return `<p class="hero-new"><span class="hero-new-tag">New in ${latest.version}</span> <span>${names.map(escapeHtml).join(", ")}.</span> <a href="./whats-new.html#${anchor(latest.version)}">What's new</a></p>`;
}
