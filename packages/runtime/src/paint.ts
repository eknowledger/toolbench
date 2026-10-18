/**
 * A textarea painted by the host's highlighter (#153), behind the real textarea rather than instead of it.
 *
 * The textarea stays the control: caret, selection, undo, paste, IME, its label and its screen-reader
 * name are all native and untouched. A `<pre>` with the same box and the same font rules sits under it,
 * `aria-hidden`, holding whatever Node `highlight(source, lang)` returned, and the textarea's own text goes
 * transparent while that paint is current. Measured in all three engines: no computed font or box property
 * differs between the two, every painted glyph clicked put the caret on that character, and the textarea's
 * own one-character selection box sat within 0.5 CSS px of the painted glyph.
 *
 * Its own chunk, with its own sheet, fetched only by a page whose tool declares `lang` and whose host passes
 * a hook. Most tools do neither, so they do not pay for it, which is the chart split's reasoning (#85).
 *
 * ⚠️ The paint waits for typing to stop, and the text shows plain until it does. Chrome ends an undo group
 * at a node insertion anywhere in the document, and repainting is insertions, so painting on every key made
 * every key its own undo step: 8 presses to take back "abc def" and a newline, against 1 in Firefox and
 * WebKit. Painting at a pause keeps the browser's grouping.
 */
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
 * ⚠️ Inside `@layer toolbench`, like every rule the runtime ships. Unlayered, these would compete with a
 * host's unlayered rules on specificity and order, and outrank its layered ones outright, which breaks
 * STYLING.md's guarantee that a host rule always wins.
 */
const CSS = `@layer toolbench{
.tb-painted{position:relative}
.tb-painted>.tb-textarea{display:block;position:relative}
.tb-paint{position:absolute;inset:0;margin:0;overflow:hidden;pointer-events:none;visibility:hidden;font:inherit;font-family:var(--tb-mono);font-size:.82rem;padding:.4375rem .5625rem;border:1px solid transparent;border-radius:8px;color:var(--tb-fg);background:var(--tb-surface);white-space:pre-wrap;overflow-wrap:break-word}
.tb-painted>.tb-textarea,.tb-paint{scrollbar-gutter:stable}
.tb-painted>.tb-textarea::selection{background:color-mix(in srgb,var(--tb-accent) 30%,transparent)}
.tb-painted[data-paint]>.tb-paint{visibility:visible}
.tb-painted[data-paint]>.tb-textarea{color:transparent;background:transparent;caret-color:var(--tb-fg)}
.tb-painted[data-paint]>.tb-textarea::selection{color:transparent}
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

/**
 * Wrap `area` and paint it. Returns the element to put in the form in its place, and `paint`, for a value
 * written without a keystroke (a sample, a preset, the host), which fires no `input` event.
 */
export function paintTextarea(area: HTMLTextAreaElement, lang: string, highlight: Highlight): { wrap: HTMLElement; paint: () => void } {
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
		let node: unknown;
		if (source.length <= PAINT_MAX) {
			try {
				node = highlight(source, lang);
			} catch {
				// Host code. A hook that throws leaves the plain textarea, which is still a working one.
			}
		}
		/*
		 * A Node whose text is not the source would put the caret on a different character from the one the
		 * reader sees: a highlighter that adds line numbers, trims, or drops a character. That is worse than no
		 * colour, so it is refused the same way a throw is.
		 */
		const ok = node instanceof Node && node.textContent === source;
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
