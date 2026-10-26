/**
 * A textarea painted behind the real textarea rather than instead of it (#153): by the host's highlighter,
 * or by the tool's own grammar (#163).
 *
 * The textarea stays the control: caret, selection, undo, paste, IME, its label and its screen-reader
 * name are all native and untouched. A `<pre>` with the same box and the same font rules sits under it,
 * `aria-hidden`, holding whatever Node `highlight(source, lang)` returned, and the textarea's own text goes
 * transparent while that paint is current. Measured in all three engines: no computed font or box property
 * differs between the two, every painted glyph clicked put the caret on that character, and the textarea's
 * own one-character selection box sat within 0.5 CSS px of the painted glyph.
 *
 * Its own chunk, with its own sheet, fetched only by a page whose tool declares `lang` and which has
 * something to paint it with: a host hook, or a grammar. Most tools do neither, so they do not pay for it,
 * which is the chart split's reasoning (#85).
 *
 * ⚠️ The paint waits for typing to stop, and the text shows plain until it does. Chrome ends an undo group
 * at a node insertion anywhere in the document, and repainting is insertions, so painting on every key made
 * every key its own undo step: 8 presses to take back "abc def" and a newline, against 1 in Firefox and
 * WebKit. Painting at a pause keeps the browser's grouping.
 */
import type { TextareaGrammar } from "@toolbench/sdk";
import { el } from "./dom.ts";
import { adopt as adoptSheet } from "./styles.ts";

/** Quiet time before a repaint. The undo measurement above held at 250 ms with 30 ms between keys. */
const QUIET_MS = 250;

/**
 * Past this many characters the textarea stays plain. The bench's JSON highlighter took 268 to 321 ms per
 * paint on 323,041 characters, measured, about 1 ms per thousand, and 17 to 31 ms at 20,000 across the
 * three engines. A tool that takes a pasted log of 200,000 should not freeze after each pause.
 */
export const PAINT_MAX = 20_000;

/*
 * The layer copies the textarea's box and font rules exactly, or the caret lands beside the glyph the reader
 * sees. Block, because an inline-block textarea leaves a baseline gap below it that the layer would fill.
 * The gutter is reserved on both so a scrollbar appearing in the textarea cannot move where its lines wrap.
 *
 * A grammar's tokens change colour and nothing else. Bold or italic can change a glyph's advance in a
 * fallback font, and then every character after it sits beside its caret position. Each colour measured at
 * 5.58:1 or better on the surface, in both themes.
 *
 * ⚠️ Inside `@layer toolbench`, like every rule the runtime ships. Unlayered, these would compete with a
 * host's unlayered rules on specificity and order, and outrank its layered ones outright, which breaks
 * STYLING.md's guarantee that a host rule always wins.
 */
const CSS = `@layer toolbench{
.tb-painted{position:relative}
.tb-painted>.tb-textarea{display:block;position:relative}
.tb-paint{position:absolute;inset:0;margin:0;overflow:hidden;pointer-events:none;visibility:hidden;font:inherit;font-family:var(--tb-mono);font-size:.82rem;padding:.4375rem .5625rem;border:1px solid transparent;border-radius:8px;color:var(--tb-input-fg);background:var(--tb-input-bg);white-space:pre-wrap;overflow-wrap:break-word}
.tb-painted>.tb-textarea,.tb-paint{scrollbar-gutter:stable}
.tb-painted>.tb-textarea::selection{background:color-mix(in srgb,var(--tb-accent) 30%,transparent)}
.tb-painted[data-paint]>.tb-paint{visibility:visible}
.tb-painted[data-paint]>.tb-textarea{color:transparent;background:transparent;caret-color:var(--tb-input-fg)}
.tb-painted[data-paint]>.tb-textarea::selection{color:transparent}
.tb-paint [data-tok=keyword]{color:var(--tb-s2)}
.tb-paint [data-tok=string]{color:var(--tb-good)}
.tb-paint [data-tok=comment]{color:var(--tb-muted)}
.tb-paint [data-tok=operator]{color:var(--tb-s4)}
}`;

let sheet: CSSStyleSheet | undefined;

/**
 * Adopt the sheet into the shadow root the wrapper is drawn into, once per root.
 *
 * A microtask, because the form is built detached and inserted afterwards; a microtask still runs before
 * the browser paints, so the textarea is never seen unstyled. Where constructed sheets are refused, a
 * `<style>` inside the wrapper itself, which a repaint of the shadow root cannot strip from under it.
 */
function adopt(wrap: HTMLElement): void {
	queueMicrotask(() => {
		const root = wrap.getRootNode();
		if (!(root instanceof ShadowRoot)) return;
		try {
			sheet ??= new CSSStyleSheet();
			if (!sheet.cssRules.length) sheet.replaceSync(CSS);
			// After the runtime's sheet and before any host sheet, the order the chart sheets keep too.
			adoptSheet(root, sheet);
		} catch {
			wrap.append(el("style", {}, CSS));
		}
	});
}

export type Highlight = (source: string, lang: string) => Node;

/** A letter in any script that has case, a digit, or an underscore: what a keyword is made of. */
const isWord = (ch: string) => ch === "_" || (ch >= "0" && ch <= "9") || ch.toLowerCase() !== ch.toUpperCase();

/**
 * A tool's grammar as spans: comments, strings, operators and keywords, everything else plain text.
 *
 * ⚠️ No regular expression anywhere, and that is the design rather than a style. A grammar is data a tool
 * ships, and a pattern from a tool could backtrack for seconds on a line the reader pasted, freezing the
 * page the tool is embedded in. Every step here is `startsWith` or a character comparison, so the cost is
 * the text's length times the operator list, which validation caps at 32.
 *
 * In order, at each position: a comment runs to the end of its line; a string runs to its closing delimiter
 * or the end of its line, a backslash escaping the next character; the longest matching operator; a word,
 * coloured if it is a keyword. The text of the result is the source exactly, which is what lets the caret
 * land on the glyph the reader sees.
 */
export function tokenise(source: string, grammar: TextareaGrammar): Node {
	const root = el("span", { "data-grammar": "" });
	const keywords = new Set(grammar.keywords ?? []);
	const operators = [...(grammar.operators ?? [])].sort((a, b) => b.length - a.length);
	const quotes = grammar.strings ?? "";
	const comment = grammar.comment;
	let plain = "";
	const push = (tok: string, text: string) => {
		if (plain) root.append(plain);
		plain = "";
		root.append(el("span", { "data-tok": tok }, text));
	};
	const lineEnd = (from: number) => {
		const end = source.indexOf("\n", from);
		return end < 0 ? source.length : end;
	};
	let i = 0;
	while (i < source.length) {
		const ch = source[i] as string;
		if (comment && source.startsWith(comment, i)) {
			const end = lineEnd(i);
			push("comment", source.slice(i, end));
			i = end;
			continue;
		}
		if (quotes.includes(ch)) {
			let j = i + 1;
			while (j < source.length && source[j] !== ch && source[j] !== "\n") j += source[j] === "\\" && source[j + 1] !== "\n" ? 2 : 1;
			j = Math.min(source[j] === ch ? j + 1 : j, source.length);
			push("string", source.slice(i, j));
			i = j;
			continue;
		}
		const op = operators.find((o) => source.startsWith(o, i));
		if (op) {
			push("operator", op);
			i += op.length;
			continue;
		}
		if (isWord(ch)) {
			let j = i + 1;
			while (j < source.length && isWord(source[j] as string)) j++;
			const word = source.slice(i, j);
			if (keywords.has(word)) push("keyword", word);
			else plain += word;
			i = j;
			continue;
		}
		plain += ch;
		i++;
	}
	if (plain) root.append(plain);
	return root;
}

/**
 * Wrap `area` and paint it. Returns the element to put in the form in its place, and `paint`, for a value
 * written without a keystroke (a sample, a preset, the host), which fires no `input` event.
 *
 * The host's hook gets the first say on a language it knows. A tool's grammar paints when there is no hook,
 * or when the hook answered with plain text, which is how a hook says it does not know the language: the
 * bench's own returns its text wrapped and untouched for anything but JSON. A hook that throws, or whose
 * text is not the source, is refused as before, and the grammar paints instead.
 */
export function paintTextarea(area: HTMLTextAreaElement, lang: string, highlight: Highlight | undefined, grammar?: TextareaGrammar): { wrap: HTMLElement; paint: () => void } {
	const layer = el("pre", { class: "tb-paint", "aria-hidden": "true", dir: area.dir });
	// `role="none"`: without it Chrome exposed the positioning wrapper as an extra `generic` node, measured.
	const wrap = el("div", { class: "tb-painted", role: "none" }, layer, area);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const follow = () => {
		layer.scrollTop = area.scrollTop;
		layer.scrollLeft = area.scrollLeft;
	};
	const paint = () => {
		const source = area.value;
		/*
		 * A Node whose text is not the source would put the caret on a different character from the one the
		 * reader sees: a highlighter that adds line numbers, trims, or drops a character. That is worse than no
		 * colour, so it is refused the same way a throw is.
		 */
		const fits = (node: unknown): node is Node => node instanceof Node && node.textContent === source;
		let node: unknown;
		if (source.length <= PAINT_MAX) {
			try {
				node = highlight?.(source, lang);
			} catch {
				// Host code. A hook that throws leaves the plain textarea, or the grammar, which still work.
			}
			// Plain text back, with no element in it, is a hook that does not know this language.
			const knows = fits(node) && typeof (node as ParentNode).querySelector === "function" && (node as ParentNode).querySelector("*") !== null;
			if (grammar && !knows) node = tokenise(source, grammar);
		}
		const ok = fits(node);
		// A trailing newline is an empty last line in a textarea and nothing at all in a <pre>.
		if (ok) layer.replaceChildren(node as Node, source.endsWith("\n") ? " " : "");
		wrap.toggleAttribute("data-paint", ok);
		follow();
	};

	area.addEventListener("input", () => {
		if (wrap.hasAttribute("data-paint")) wrap.removeAttribute("data-paint");
		clearTimeout(timer);
		timer = setTimeout(paint, QUIET_MS);
	});
	area.addEventListener("scroll", follow);
	adopt(wrap);
	paint();
	return { wrap, paint };
}
