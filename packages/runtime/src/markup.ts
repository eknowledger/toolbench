/**
 * The light markup an input's help text may carry (#217): a blank line starts a paragraph, a line starting
 * "- " is a list item, `code`, **strong**, and {good|text} for the tones good, warn, bad, muted and accent.
 *
 * Parsed to a small tree and built with `el`, never as HTML: help text is the tool's, and SECURITY.md promises
 * no markup is ever interpreted from a string. There are no links. Anything else is text, a marker left open
 * included, so a description written before this existed reads as it did.
 */
import { el } from "./dom.ts";

export type Tone = "good" | "warn" | "bad" | "muted" | "accent";
export type Inline = string | { t: "code"; text: string } | { t: "strong"; kids: Inline[] } | { t: "tone"; tone: Tone; kids: Inline[] };
export type Block = { t: "p"; kids: Inline[] } | { t: "ul"; items: Inline[][] };

/*
 * One pattern, tried at each position in order: code, strong, a tone. Every span needs a character inside
 * it, so an empty or unclosed one is text. No nested repeats, so a long line cannot make it backtrack.
 */
const SPAN = /`([^`]+)`|\*\*([^]+?)\*\*|\{(good|warn|bad|muted|accent)\|([^}]+)\}/g;

/** Inline spans. Code is literal, so markup inside it shows as written; strong and a tone hold the others. */
function inline(s: string): Inline[] {
	const out: Inline[] = [];
	let last = 0;
	for (const m of s.matchAll(SPAN)) {
		const [all, code, strong, tone, text] = m;
		const at = m.index;
		if (at > last) out.push(s.slice(last, at));
		out.push(code ? { t: "code", text: code } : strong ? { t: "strong", kids: inline(strong) } : { t: "tone", tone: tone as Tone, kids: inline(text!) });
		last = at + all.length;
	}
	if (last < s.length) out.push(s.slice(last));
	return out;
}

export function parseMarkup(source: string): Block[] {
	const blocks: Block[] = [];
	for (const chunk of source.split(/\n[ \t]*\n/)) {
		let para: string[] = [];
		let list: Inline[][] = [];
		const close = () => {
			if (para.length) blocks.push({ t: "p", kids: inline(para.join("\n")) });
			if (list.length) blocks.push({ t: "ul", items: list });
			para = [];
			list = [];
		};
		for (const line of chunk.split("\n")) {
			if (line.startsWith("- ")) {
				if (para.length) close();
				list.push(inline(line.slice(2)));
			} else if (line.trim()) {
				if (list.length) close();
				para.push(line);
			}
		}
		close();
	}
	return blocks;
}

/** One paragraph of plain text: drawn exactly as a description was before markup existed. */
export const isPlain = (blocks: Block[]) => blocks.length === 1 && blocks[0]!.t === "p" && blocks[0]!.kids.every((k) => typeof k === "string");

/**
 * Help text as DOM: a plain description is the `<p>` it always was, with the tool's string as its one text
 * node; one paragraph with markup stays a `<p>`; several blocks become a `<div>`, since a `<p>` cannot hold a
 * list. `attrs` go on the outer element, which stays the control's `aria-describedby` target.
 */
export function help(text: string, attrs: Record<string, string>): HTMLElement {
	const blocks = parseMarkup(text);
	if (isPlain(blocks)) return el("p", attrs, text);
	const node = (k: Inline): Node | string =>
		typeof k === "string" ? k : k.t === "code" ? el("code", {}, k.text) : el(k.t === "strong" ? "strong" : "span", k.t === "tone" ? { "data-tone": k.tone } : {}, ...k.kids.map(node));
	const kids = (b: Block) => (b.t === "p" ? b.kids.map(node) : b.items.map((item) => el("li", {}, ...item.map(node))));
	const only = blocks.length === 1 && blocks[0]!.t === "p" ? blocks[0]! : undefined;
	return only ? el("p", attrs, ...kids(only)) : el("div", attrs, ...blocks.map((b) => el(b.t, {}, ...kids(b))));
}
