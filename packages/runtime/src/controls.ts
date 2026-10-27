/**
 * The native controls behind the newer input types (#203), for a tool that has one.
 *
 * Its own chunk, fetched alongside the tool's code as the painted textarea and the share button are, so a
 * page whose tools use none of them pays nothing for their code or their rules: in the boot chunk they
 * measured 762 gzipped bytes for the segments alone. The form is not drawn until the tool's code is here,
 * so waiting for this costs no time. Without it each input still works as the plain control the runtime
 * draws itself: a segmented select is a dropdown, and a colour is its hex box with no swatch.
 */
import type { SelectOption } from "@toolbench/sdk";
import { el } from "./dom.ts";
import { adoptStyles } from "./styles.ts";

/*
 * In the runtime's layer, like its own sheet, so a host's rule still wins. A legend is not a grid item, so
 * the row's gap does not reach it and it brings its own margin.
 */
const STYLES = /* css */ `
fieldset.tb-field-row { border: 0; margin: 0; padding: 0; min-width: 0; }
legend.tb-label { padding: 0; margin-bottom: 0.25rem; }
.tb-seg { display: flex; gap: 2px; min-width: 0; overflow: hidden; padding: 2px; border: 1px solid var(--tb-input-border); border-radius: 8px; background: var(--tb-input-bg); }
.tb-seg[aria-invalid="true"] { border-color: var(--tb-bad); }
.tb-seg-opt { flex: 1 1 0; position: relative; display: flex; align-items: center; justify-content: center; gap: 0.4rem; min-height: 24px; padding: 0.3125rem 0.625rem; border-radius: 6px; font-size: 0.85rem; color: var(--tb-muted); cursor: pointer; white-space: nowrap; }
.tb-seg-opt input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
.tb-seg-opt:hover { color: var(--tb-fg); }
/* A solid fill: a wash of the accent was the trap #148 recorded, nearly the surface colour. */
.tb-seg-opt:has(:checked) { background: var(--tb-accent); color: var(--tb-accent-ink); font-weight: 600; }
/* One ring, round the group as round any other control. Round the filled segment it was clipped by the
   group and doubled the fill's edge, and the radio's own was the browser's blue (#99). */
.tb-seg:has(:focus-visible), .tb-seg[data-keys]:has(:focus) { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
.tb-seg input:focus-visible { outline: none; }
/* Stacked, set by a measurement when a segment would cut its label: ordinary radios, one per line. */
.tb-seg[data-stack] { flex-direction: column; gap: 0.125rem; overflow: visible; padding: 0.25rem 0.375rem; background: none; }
.tb-seg[data-stack] .tb-seg-opt { justify-content: flex-start; white-space: normal; padding: 0.125rem 0.25rem; color: var(--tb-fg); }
.tb-seg[data-stack] .tb-seg-opt:has(:checked) { background: none; color: var(--tb-fg); }
.tb-seg[data-stack] .tb-seg-opt input { position: static; opacity: 1; width: 1rem; height: 1rem; flex: none; accent-color: var(--tb-accent); }
/* A colour: the swatch as tall as the hex box beside it, which is the value. */
.tb-color-row { display: flex; gap: 0.5rem; }
.tb-color-row .tb-input { width: 8.5rem; font-family: var(--tb-mono); text-transform: lowercase; }
.tb-swatch { width: 2.25rem; height: auto; flex: none; padding: 3px; border: 1px solid var(--tb-input-border); border-radius: 8px; background: var(--tb-input-bg); cursor: pointer; }
.tb-swatch::-webkit-color-swatch-wrapper { padding: 0; }
.tb-swatch::-webkit-color-swatch { border: 0; border-radius: 5px; }
.tb-swatch::-moz-color-swatch { border: 0; border-radius: 5px; }
.tb-swatch:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
`;

/*
 * Whether the reader is using the keyboard, for the group's ring. WebKit never matches :focus-visible on a
 * radio, after Tab or an arrow key alike, so a Safari reader moving through the segments by keyboard saw no
 * ring at all: CI's WebKit run read "none" where Chromium and Firefox read "solid". So the group also draws
 * it while it holds focus and the last thing the reader did was press a key.
 */
let keys = false;
addEventListener("keydown", () => (keys = true), true);
addEventListener("pointerdown", () => (keys = false), true);

/**
 * Fill `group` with a segment per option: a native radio named `name` inside its label, so the arrow keys,
 * the one tab stop and "2 of 3" are the browser's. `choose` is called with the value a reader picks.
 * Returns the function that checks the radio for `value()`, for a value written by assignment.
 *
 * The row stacks into plain radios while any segment would cut its label, and goes back when they fit.
 * Measured, because CSS cannot ask whether text fits, and again when the group's width changes but not its
 * height: stacking changes the height, so observing that would measure on every toggle. Also on a change of
 * choice, because the chosen label is bold and may not fit where the regular one did.
 */
/**
 * The system's colour picker beside a colour's hex `box` (#203), kept in step both ways: a pick writes the box
 * and is passed to `pick`; a whole colour typed in the box, or `value()` after an assignment, moves the
 * swatch, and half a colour leaves it where it was, since a colour input would read it as black. Its name
 * says what it is for, "Highlight colour picker", because a swatch has no text of its own.
 */
export function swatch(box: HTMLInputElement, label: string, value: () => string, pick: (value: string) => void): { row: HTMLElement; sync: () => void } {
	adoptStyles(box, "controls", () => STYLES);
	const picker = el("input", { class: "tb-swatch", type: "color", "aria-label": `${label} picker` });
	const sync = () => {
		if (/^#[0-9a-f]{6}$/.test(value())) picker.value = value();
	};
	sync();
	box.addEventListener("input", sync);
	picker.addEventListener("input", () => {
		box.value = picker.value;
		pick(picker.value);
	});
	return { row: el("div", { class: "tb-color-row" }, picker, box), sync };
}

export function segments(group: HTMLElement, options: readonly SelectOption[], name: string, value: () => string, choose: (value: string) => void): () => void {
	adoptStyles(group, "controls", () => STYLES);
	const radios = options.map((option) => {
		const radio = el("input", { type: "radio", name, value: option.value });
		radio.addEventListener("change", () => choose(radio.value));
		group.append(el("label", { class: "tb-seg-opt" }, radio, option.label));
		return radio;
	});
	const over = (e: Element) => e.scrollWidth > e.clientWidth + 1;
	const fit = () => {
		group.removeAttribute("data-stack");
		group.toggleAttribute("data-stack", over(group) || [...group.children].some(over));
	};
	let width = -1;
	new ResizeObserver(([entry]) => {
		if (entry && entry.contentRect.width !== width) {
			width = entry.contentRect.width;
			fit();
		}
	}).observe(group);
	const check = () => {
		for (const radio of radios) radio.checked = radio.value === value();
		fit();
	};
	for (const type of ["focusin", "keydown"]) group.addEventListener(type, () => group.toggleAttribute("data-keys", keys));
	check();
	return check;
}
