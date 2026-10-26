/**
 * The repository's markdown, rendered to HTML at build time.
 *
 * No dependency, on purpose. The docs use a small, stable subset of GitHub-flavoured markdown:
 * ATX headings, paragraphs, fenced code, pipe tables, nested lists, the occasional blockquote, a
 * horizontal rule and a little inline HTML (`<kbd>`, `<details>`, a centred `<div>` in the README). A
 * renderer for exactly that is under 300 lines, ships nothing to the reader, and cannot pull a
 * transitive dependency into a repository whose packages have none. If the docs ever reach for a
 * construct this does not cover, the build output shows it as literal text, which is loud.
 *
 * Headings get GitHub's slugs, so a link written for github.com (`#4b-sample-inputs`) lands on the
 * same heading here, and links between the docs are rewritten to the site's pages by `linkFor`.
 */
import { codeBlock, escapeHtml } from "./highlight.ts";

export type Heading = { depth: number; text: string; slug: string };
export type Rendered = { html: string; title: string; headings: Heading[] };
export type RenderOptions = {
	/** Rewrite a link target: repository-relative markdown to a site page, anything else to GitHub. */
	linkFor?: (href: string) => string;
	/**
	 * Keep no raw HTML at all: every `<` is text. For a line whose author is not writing a docs page (a What's
	 * new item), where the docs' small tag allowlist is a way in rather than a convenience.
	 */
	noRawTags?: boolean;
	/** Drop a hand-written "Contents" list: the site draws its own navigation from the headings. */
	dropContents?: boolean;
	/** A ```mermaid block, drawn. Without this a diagram renders as its source. */
	diagram?: (source: string) => string;
	/**
	 * A `<!-- site: kind arg -->` line: an HTML comment, so GitHub shows nothing, and the site draws what
	 * it names in its place. Without this the comment passes through, invisible, as on GitHub.
	 */
	marker?: (kind: string, arg: string) => string;
};

/** GitHub's heading slug: lower case, punctuation dropped, spaces to hyphens. */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/<[^>]+>/g, "")
		.replace(/[^\p{L}\p{N}\s_-]/gu, "")
		.trim()
		.replace(/\s/g, "-");
}

export function inline(text: string, opts: RenderOptions = {}): string {
	// Code spans first, set aside so nothing inside them is treated as markup.
	const codes: string[] = [];
	let s = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _ticks, code: string) => {
		codes.push(`<code>${escapeHtml(code.trim() === "" ? code : code.replace(/^ (.*) $/, "$1"))}</code>`);
		return `\u0000${codes.length - 1}\u0000`;
	});
	// Inline HTML the docs use, kept; everything else escaped.
	const tags: string[] = [];
	if (!opts.noRawTags) s = s.replace(/<\/?(?:kbd|br|sup|sub|em|strong|code|details|summary|b|i)\b[^>]*>/g, (tag) => {
		tags.push(tag);
		return `\u0001${tags.length - 1}\u0001`;
	});
	s = escapeHtml(s);
	s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt: string, src: string) => {
		const target = opts.linkFor ? opts.linkFor(src) : src;
		return `<img src="${target}" alt="${alt}" loading="lazy">`;
	});
	s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
		const target = opts.linkFor ? opts.linkFor(href.replace(/&amp;/g, "&")) : href;
		return `<a href="${escapeHtml(target)}">${label}</a>`;
	});
	s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	s = s.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>");
	s = s.replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<em>$2</em>");
	s = s.replace(/\u0001(\d+)\u0001/g, (_, i: string) => tags[Number(i)] ?? "");
	return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)] ?? "");
}

function splitRow(line: string): string[] {
	const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
	// A pipe inside a code span is content, not a column break.
	const cells: string[] = [];
	let cell = "";
	let inCode = false;
	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i] as string;
		if (ch === "`") inCode = !inCode;
		if (ch === "\\" && trimmed[i + 1] === "|") {
			cell += "|";
			i++;
			continue;
		}
		if (ch === "|" && !inCode) {
			cells.push(cell.trim());
			cell = "";
		} else cell += ch;
	}
	cells.push(cell.trim());
	return cells;
}

type ListItem = { lines: string[] };

export function renderMarkdown(source: string, opts: RenderOptions = {}): Rendered {
	const lines = source.replace(/\r\n/g, "\n").split("\n");
	const headings: Heading[] = [];
	const used = new Map<string, number>();
	let title = "";

	function heading(depth: number, raw: string): string {
		const text = raw.replace(/\s+#+\s*$/, "");
		let slug = slugify(text.replace(/`/g, ""));
		const n = used.get(slug) ?? 0;
		used.set(slug, n + 1);
		if (n > 0) slug = `${slug}-${n}`;
		// The first h1 is the page's title, which the page template places itself.
		if (depth === 1 && !title) {
			title = text.replace(/`/g, "");
			return "";
		}
		headings.push({ depth, text: text.replace(/`/g, ""), slug });
		return `<h${depth} id="${slug}">${inline(text, opts)}</h${depth}>`;
	}

	function blocks(input: string[]): string {
		const out: string[] = [];
		let i = 0;
		while (i < input.length) {
			const line = input[i] as string;
			if (line.trim() === "") {
				i++;
				continue;
			}
			// Fenced code.
			const fence = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)/.exec(line);
			if (fence) {
				const [, indent = "", marker = "```", lang = ""] = fence;
				const body: string[] = [];
				i++;
				while (i < input.length && !(input[i] as string).trim().startsWith(marker)) {
					body.push((input[i] as string).slice(indent.length));
					i++;
				}
				i++;
				const code = body.join("\n");
				out.push(lang === "mermaid" && opts.diagram ? opts.diagram(code) : codeBlock(code, lang));
				continue;
			}
			const h = /^(#{1,6})\s+(.*)$/.exec(line);
			if (h) {
				out.push(heading((h[1] as string).length, h[2] as string));
				i++;
				continue;
			}
			if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
				out.push("<hr>");
				i++;
				continue;
			}
			const marker = /^<!--\s*site:\s*(\w+)\s+(\S+)\s*-->\s*$/.exec(line);
			if (marker && opts.marker) {
				out.push(opts.marker(marker[1] ?? "", marker[2] ?? ""));
				i++;
				continue;
			}
			// Raw HTML block: passed through until a blank line, as GitHub does.
			if (/^\s*<(?:div|table|picture|details|p|img|!--)/i.test(line)) {
				const body: string[] = [];
				while (i < input.length && (input[i] as string).trim() !== "") body.push(input[i++] as string);
				out.push(body.join("\n"));
				continue;
			}
			if (line.startsWith(">")) {
				const body: string[] = [];
				while (i < input.length && (input[i] as string).startsWith(">")) body.push((input[i++] as string).replace(/^>\s?/, ""));
				out.push(`<blockquote>${blocks(body)}</blockquote>`);
				continue;
			}
			// Table: a header row followed by a delimiter row.
			if (line.includes("|") && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(input[i + 1] ?? "")) {
				const head = splitRow(line);
				const align = splitRow(input[i + 1] as string).map((c) => (c.endsWith(":") ? (c.startsWith(":") ? "center" : "right") : ""));
				i += 2;
				const rows: string[][] = [];
				while (i < input.length && (input[i] as string).includes("|") && (input[i] as string).trim() !== "") rows.push(splitRow(input[i++] as string));
				const cell = (tag: string, c: string, k: number) =>
					`<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(c, opts)}</${tag}>`;
				out.push(
					`<div class="table-wrap"><table><thead><tr>${head.map((c, k) => cell("th", c, k)).join("")}</tr></thead><tbody>${rows
						.map((r) => `<tr>${r.map((c, k) => cell("td", c, k)).join("")}</tr>`)
						.join("")}</tbody></table></div>`,
				);
				continue;
			}
			// Lists. An item continues while lines are indented past its marker, or are blank between such lines.
			const item = /^(\s*)([*+-]|\d+\.)\s+(.*)$/.exec(line);
			if (item) {
				const baseIndent = (item[1] as string).length;
				const ordered = /\d/.test(item[2] as string);
				const start = ordered ? Number.parseInt(item[2] as string, 10) : 1;
				const items: ListItem[] = [];
				while (i < input.length) {
					const l = input[i] as string;
					const m = /^(\s*)([*+-]|\d+\.)\s+(.*)$/.exec(l);
					if (m && (m[1] as string).length === baseIndent && /\d/.test(m[2] as string) === ordered) {
						items.push({ lines: [m[3] as string] });
						i++;
						continue;
					}
					const current = items.at(-1);
					if (!current) break;
					if (l.trim() === "") {
						const next = input[i + 1] ?? "";
						if (/^\s+\S/.test(next) && next.search(/\S/) > baseIndent) {
							current.lines.push("");
							i++;
							continue;
						}
						break;
					}
					if (l.search(/\S/) > baseIndent) {
						current.lines.push(l.replace(new RegExp(`^\\s{0,${baseIndent + (ordered ? 3 : 2)}}`), ""));
						i++;
						continue;
					}
					// A lazy continuation line of the item's paragraph.
					if (!/^\s*([*+-]|\d+\.)\s/.test(l) && !/^#{1,6}\s/.test(l) && !l.startsWith("```")) {
						current.lines.push(l.trim());
						i++;
						continue;
					}
					break;
				}
				const tag = ordered ? "ol" : "ul";
				const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
				const body = items
					.map((it) => {
						// A tight item is one paragraph and possibly a nested block: no <p> around the first line.
						const [first, ...rest] = splitFirstParagraph(it.lines);
						const text = first.join(" ");
						const nested = rest.length ? blocks(rest) : "";
						// A task item, "- [ ] x" or "- [x] x": a checkbox nobody can tick, labelled by its own text.
						const task = /^\[( |x|X)\]\s+(.*)$/.exec(text);
						if (task) {
							const checked = task[1] !== " " ? " checked" : "";
							return `<li class="task"><label><input type="checkbox" disabled${checked}> ${inline(task[2] ?? "", opts)}</label>${nested}</li>`;
						}
						return `<li>${inline(text, opts)}${nested}</li>`;
					})
					.join("");
				const tasks = body.includes('<li class="task">') ? ' class="tasks"' : "";
				out.push(`<${tag}${startAttr}${tasks}>${body}</${tag}>`);
				continue;
			}
			// Paragraph.
			const para: string[] = [];
			while (i < input.length) {
				const l = input[i] as string;
				if (l.trim() === "" || /^(#{1,6})\s/.test(l) || /^\s*(`{3,}|~{3,})/.test(l) || /^\s*([*+-]|\d+\.)\s/.test(l) || l.startsWith(">")) break;
				if (para.length && l.includes("|") && /^\s*\|?\s*:?-+:?/.test(input[i + 1] ?? "")) break;
				para.push(l.trim());
				i++;
			}
			if (para.length === 0) {
				// Nothing matched: emit the line as text rather than loop forever.
				out.push(`<p>${inline(line, opts)}</p>`);
				i++;
				continue;
			}
			out.push(`<p>${inline(para.join(" "), opts)}</p>`);
		}
		return out.join("\n");
	}

	let body = lines;
	if (opts.dropContents) {
		// The docs open with "**Contents**" and a list of links, closed by a rule. The site's sidebar replaces it.
		const at = body.findIndex((l) => /^\*\*Contents\*\*\s*$/.test(l) || /^## Contents\s*$/.test(l));
		if (at >= 0) {
			let end = at + 1;
			while (end < body.length && (body[end]?.trim() === "" || /^\s*([*+-]|\d+\.)\s/.test(body[end] as string))) end++;
			if (/^\s*-{3,}\s*$/.test(body[end] ?? "")) end++;
			body = [...body.slice(0, at), ...body.slice(end)];
		}
	}
	return { html: blocks(body), title, headings };
}

function splitFirstParagraph(lines: string[]): [string[], ...string[]] {
	const first: string[] = [];
	let k = 0;
	while (k < lines.length && (lines[k] as string).trim() !== "" && !/^\s*([*+-]|\d+\.)\s/.test(lines[k] as string) && !(lines[k] as string).startsWith("```")) {
		first.push(lines[k] as string);
		k++;
	}
	return [first, ...lines.slice(k)];
}
