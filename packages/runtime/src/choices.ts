/**
 * A multiselect's choices (#204): a native checkbox per option, or for a long list of short values a row of
 * chips, each a toggle button.
 *
 * Its own chunk, fetched alongside the tool's code only by a tool that has a multiselect, as the segments and
 * the painted textarea are, so a page with none pays nothing for it. The form is not drawn until the tool's
 * code is here, so waiting for this costs no time. Without it the input is a native `<select multiple>`.
 */
import type { InputSpec } from "@toolbench/sdk";
import { el } from "./dom.ts";
import { adoptStyles } from "./styles.ts";

type Multiselect = Extract<InputSpec, { type: "multiselect" }>;

/*
 * In the runtime's layer, like its own sheet, so a host's rule still wins. A legend is not a grid item, so
 * the row's gap does not reach it and it brings its own margin.
 */
const STYLES = /* css */ `
fieldset.tb-field-row { border: 0; margin: 0; padding: 0; min-width: 0; }
legend.tb-label { padding: 0; margin-bottom: 0.25rem; }
.tb-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr)); gap: 0.125rem 0.75rem; }
.tb-check { display: flex; align-items: center; gap: 0.5rem; min-height: 28px; font-size: 0.9rem; border-radius: 6px; padding-inline: 0.25rem; cursor: pointer; }
.tb-check input { width: 16px; height: 16px; margin: 0; flex: none; accent-color: var(--tb-accent); cursor: inherit; }
.tb-check input:focus-visible, .tb-chip:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
.tb-chips { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.tb-chip { font: inherit; font-size: 0.82rem; min-height: 28px; padding: 0.2rem 0.65rem; display: inline-flex; align-items: center; gap: 0.3rem; color: var(--tb-input-fg); background: var(--tb-input-bg); border: 1px solid var(--tb-input-border); border-radius: 999px; cursor: pointer; }
.tb-chip:hover { border-color: var(--tb-muted); }
/* Pressed is a fill and a check mark, so it does not rest on colour alone. */
.tb-chip[aria-pressed="true"] { color: var(--tb-accent-text); background: var(--tb-accent-bg); border-color: var(--tb-accent); font-weight: 600; }
.tb-chip[aria-pressed="true"]::before { content: ""; width: 0.7em; height: 0.38em; border-left: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: translateY(-0.12em) rotate(-45deg); }
:is(.tb-check, .tb-chip):has([aria-disabled="true"]), .tb-chip[aria-disabled="true"] { opacity: 0.5; cursor: default; }
:is(.tb-checks, .tb-chips)[aria-invalid="true"] { box-shadow: inset 3px 0 0 var(--tb-bad); padding-inline-start: 0.625rem; }
`;

/**
 * Fill `group` with a control per option and keep `count` saying how many are chosen of how many allowed.
 * `choose` gets the next list, in the options' order. Returns the function that shows `value()` again, for a
 * value written by assignment: a sample, a preset, a host, Reset.
 *
 * ⚠️ At `max` the rest are `aria-disabled`, not `disabled`: a disabled control leaves the tab order, and the
 * reason with it, so a keyboard reader could not find out why they cannot choose another. Each one points at
 * the count line, which then says why, and a press on one is refused here.
 */
export function choices(group: HTMLElement, spec: Multiselect, count: HTMLElement, value: () => string[], choose: (next: string[]) => void): () => void {
	adoptStyles(group, "choices", () => STYLES);
	// Checkboxes stack into a readable grid up to six; past that a list of short values reads better as chips.
	const chips = (spec.control ?? (spec.options.length > 6 ? "chips" : "checkboxes")) === "chips";
	group.classList.add(chips ? "tb-chips" : "tb-checks");
	const all = spec.options.map((option) => option.value);
	const max = spec.max ?? all.length;
	const min = spec.min ?? 0;
	const items = spec.options.map((option) => {
		const control = chips ? el("button", { type: "button", class: "tb-chip" }, option.label) : el("input", { type: "checkbox", value: option.value });
		control.addEventListener("click", (event) => {
			const now = value();
			const on = now.includes(option.value);
			// A checkbox has already flipped itself by now; refusing the click flips it back.
			if (!on && now.length >= max) return event.preventDefault();
			choose(all.filter((v) => (v === option.value ? !on : now.includes(v))));
			sync();
		});
		group.append(chips ? control : el("label", { class: "tb-check" }, control, option.label));
		return { option, control };
	});
	const sync = () => {
		const now = value();
		const full = now.length >= max && max < all.length;
		for (const { option, control } of items) {
			const on = now.includes(option.value);
			if (control instanceof HTMLInputElement) control.checked = on;
			else control.setAttribute("aria-pressed", String(on));
			const off = full && !on;
			for (const [name, set] of [["aria-disabled", "true"], ["aria-describedby", count.id]]) {
				if (off) control.setAttribute(name as string, set as string);
				else control.removeAttribute(name as string);
			}
		}
		const bounds = [min > 0 && `at least ${min}`, max < all.length && `at most ${max}`].filter(Boolean);
		count.textContent = full ? `${now.length} selected, the most allowed. Deselect one to choose another.` : [`${now.length} selected`, ...bounds].join(", ");
	};
	sync();
	return sync;
}
