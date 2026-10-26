/**
 * The native controls behind the newer input types (#203), for a tool that has one.
 *
 * Its own chunk, fetched alongside the tool's code as the painted textarea and the share button are, so a
 * page whose tools use none of them pays nothing for their code or their rules: in the boot chunk they
 * measured 762 gzipped bytes for the segments alone. The form is not drawn until the tool's code is here,
 * so waiting for this costs no time. Without it each input still works as the plain control the runtime
 * draws itself: a segmented select is a dropdown.
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
.tb-seg:has(:focus-visible) { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
.tb-seg input:focus-visible { outline: none; }
/* Stacked, set by a measurement when a segment would cut its label: ordinary radios, one per line. */
.tb-seg[data-stack] { flex-direction: column; gap: 0.125rem; overflow: visible; padding: 0.25rem 0.375rem; background: none; }
.tb-seg[data-stack] .tb-seg-opt { justify-content: flex-start; white-space: normal; padding: 0.125rem 0.25rem; color: var(--tb-fg); }
.tb-seg[data-stack] .tb-seg-opt:has(:checked) { background: none; color: var(--tb-fg); }
.tb-seg[data-stack] .tb-seg-opt input { position: static; opacity: 1; width: 1rem; height: 1rem; flex: none; accent-color: var(--tb-accent); }
`;

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
	check();
	return check;
}
