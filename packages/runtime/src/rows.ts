/**
 * A rows input (#204): a list the reader adds to, removes from and reorders, a row per item and a cell per
 * column.
 *
 * Its own chunk, fetched alongside the tool's code only by a tool that has a rows input, as the choices and
 * the segments are. It is the largest of the input controls, the keyboard moves, the drag, the focus after a
 * removal and the narrow layout, and most pages have no list to edit. The form is not drawn until the tool's
 * code is here, so waiting for it costs no time.
 */
import type { InputSpec, Row, RowColumn } from "@toolbench/sdk";
import { el, svg } from "./dom.ts";
import { adoptStyles } from "./styles.ts";
import { cells } from "./values.ts";

type Rows = Extract<InputSpec, { type: "rows" }>;

/*
 * In the runtime's layer, like its own sheet, so a host's rule still wins. The cells sit in a wrapper that
 * is `display: contents` while the row is wide, so they are the row's grid columns, and a grid of their own
 * when it is narrow, stacked beside one handle and one remove button.
 */
const STYLES = /* css */ `
fieldset.tb-field-row { border: 0; margin: 0; padding: 0; min-width: 0; }
legend.tb-label { padding: 0; margin-bottom: 0.25rem; }
.tb-rows-box { display: grid; gap: 0.375rem; min-width: 0; }
.tb-rows { display: grid; gap: 0.375rem; margin: 0; padding: 0; list-style: none; }
.tb-rows-head, .tb-row { display: grid; grid-template-columns: 28px var(--cols) 28px; gap: 0.375rem; align-items: center; }
.tb-row-cells { display: contents; }
.tb-rows-head { font-size: 0.75rem; font-weight: 600; color: var(--tb-faint); margin-bottom: -0.125rem; }
.tb-rows-head > :first-child { grid-column: 2; }
.tb-row-msg { grid-column: 2 / -2; }
.tb-icon { box-sizing: border-box; width: 28px; height: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font: inherit; color: var(--tb-faint); background: none; border: 1px solid transparent; border-radius: 8px; cursor: pointer; }
.tb-icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.tb-icon:hover { color: var(--tb-fg); border-color: var(--tb-border); }
.tb-icon:focus-visible, .tb-add:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; color: var(--tb-fg); }
.tb-handle { cursor: grab; touch-action: none; }
.tb-handle svg { fill: currentColor; stroke: none; }
/* A row being moved, by keyboard or pointer: lifted, and its handle says so. */
.tb-row[data-moving] { background: var(--tb-accent-bg); border-radius: 8px; box-shadow: 0 0 0 4px var(--tb-accent-bg); }
.tb-row[data-moving] .tb-handle { color: var(--tb-accent-text); }
.tb-cell { display: flex; align-items: center; gap: 0.375rem; min-width: 0; }
.tb-cell > :is(.tb-input, .tb-select) { flex: 1; min-width: 0; }
.tb-cell .tb-unit { font-size: 0.82rem; flex: none; }
.tb-rows-empty { margin: 0; padding: 0.75rem; border: 1px dashed var(--tb-border); border-radius: 8px; font-size: 0.82rem; color: var(--tb-muted); text-align: center; }
.tb-rows-foot { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
/* Add is Reset's outlined shape at sample size: it edits the form, it does not run anything. */
.tb-add { font: inherit; font-size: 0.82rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.3rem; color: var(--tb-fg); background: none; border: 1px dashed var(--tb-muted); border-radius: 8px; padding: 0.3rem 0.7rem; cursor: pointer; }
.tb-add:hover:not([aria-disabled="true"]) { border-style: solid; }
.tb-add[aria-disabled="true"] { opacity: 0.5; cursor: default; }
.tb-add svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
@container (max-width: 26rem) {
  .tb-rows:not([data-columns="1"]) .tb-row { grid-template-columns: 28px minmax(0, 1fr) 28px; }
  .tb-rows:not([data-columns="1"]) .tb-row-cells { display: grid; gap: 0.375rem; }
  .tb-rows:not([data-columns="1"]) .tb-cell::before { content: attr(data-label); flex: none; width: 3.5rem; font-size: 0.72rem; font-weight: 600; color: var(--tb-faint); overflow-wrap: anywhere; }
  .tb-rows-head { display: none; }
}
`;

/** Six dots, the grip a reader recognises as "this moves", and a cross, on a 16 unit grid. */
const DOTS = [4, 8, 12].flatMap((y) => [6, 10].map((x) => svg("circle", { cx: x, cy: y, r: 1.3 })));
const icon = (...paths: Node[]) => svg("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" }, ...paths);

/** Where the focus goes after a change: a row and a column, the handle or the remove button. */
type Spot = { row: number; at: number | "handle" | "remove" };

/** A new row: empty text, the number nearest 0 within the range, the first option, off. */
const fresh = (columns: readonly RowColumn[]): Row =>
	Object.fromEntries(columns.map((c) => [c.id, c.type === "number" ? Math.min(c.max, Math.max(c.min, 0)) : c.type === "select" ? (c.options[0]?.value ?? "") : c.type === "toggle" ? false : ""]));

/**
 * Fill `box` with the rows of `value()`, the Add button and `count`, and keep them in step. `choose` gets
 * the next list after every edit. `say` puts a sentence in the element's unseen status region, because a
 * row appearing, going or moving changes nothing a screen reader would otherwise mention.
 *
 * Returns `sync`, for a value written by assignment, and `mark`, which shows an error's line under a row.
 *
 * ⚠️ At `maxRows` Add is `aria-disabled`, not `disabled`: a disabled button leaves the tab order and takes
 * its reason with it. It points at the count line, which then says why.
 */
export function rows(box: HTMLElement, spec: Rows, id: string, count: HTMLElement, value: () => Row[], choose: (next: Row[]) => void, say: (message: string) => void) {
	adoptStyles(box, "rows", () => STYLES);
	const { columns, maxRows } = spec;
	const min = spec.minRows ?? 0;
	// The column a row is called by, "Move row 2, /api": the first text column, which is what a reader typed to tell rows apart.
	const name = columns.find((c) => c.type === "text");
	const width = (c: RowColumn) => (c.type === "text" ? "minmax(0, 1fr)" : c.type === "number" ? "minmax(6rem, 10rem)" : c.type === "select" ? "minmax(0, 12rem)" : "auto");
	const cols = `--cols: ${columns.map(width).join(" ")}`;
	const head = columns.length > 1 ? el("div", { class: "tb-rows-head", style: cols, "aria-hidden": "true" }, ...columns.map((c) => el("span", {}, c.label))) : null;
	const list = el("ol", { class: "tb-rows", "data-columns": columns.length, style: cols });
	const empty = el("p", { class: "tb-rows-empty" }, "No rows yet.");
	const add = el("button", { type: "button", class: "tb-add" }, icon(svg("path", { d: "M8 3v10M3 8h10" })), "Add row");
	box.classList.add("tb-rows-box");
	box.append(head ?? "", list, empty, el("div", { class: "tb-rows-foot" }, add, count));

	let drawn = "";
	let marked: { row: number; line: string } | undefined;
	const called = (row: Row, r: number) => `row ${r + 1}${name && row[name.id] !== "" ? `, ${String(row[name.id])}` : ""}`;
	const edit = (next: Row[]) => {
		drawn = JSON.stringify(next);
		choose(next);
	};

	/** Move row `from` to `to`, keeping focus where the reader is, and say where it went. */
	const move = (from: number, to: number, at: Spot["at"]) => {
		const now = value();
		const target = Math.max(0, Math.min(now.length - 1, to));
		if (target === from) return;
		const next = [...now];
		const [row] = next.splice(from, 1);
		next.splice(target, 0, row as Row);
		edit(next);
		draw({ row: target, at });
		list.children[target]?.setAttribute("data-moving", "");
		say(`Moved ${name && (row as Row)[name.id] !== "" ? String((row as Row)[name.id]) : `row ${from + 1}`} to row ${target + 1} of ${next.length}.`);
	};

	const remove = (r: number, at: Spot["at"]) => {
		const next = value().filter((_, i) => i !== r);
		edit(next);
		// The same column of the row that took its place, else the row before, else Add: never the page.
		draw(next.length > 0 ? { row: Math.min(r, next.length - 1), at } : undefined);
		if (next.length === 0) add.focus();
		say(`Row ${r + 1} removed, ${next.length} of ${maxRows}.`);
	};

	const line = (row: Row, r: number, n: number) => {
		const li = el("li", { class: "tb-row" });
		const label = called(row, r);
		const handle = el("button", { type: "button", class: "tb-icon tb-handle", "aria-label": `Move ${label}` }, icon(...DOTS.map((d) => d.cloneNode())));
		const cross = el("button", { type: "button", class: "tb-icon tb-remove", "aria-label": `Remove ${label}` }, icon(svg("path", { d: "M4 4l8 8M12 4l-8 8" })));
		const invalid = marked?.row === r;
		const cellBox = el("div", { class: "tb-row-cells" });
		columns.forEach((column, c) => {
			const attrs = { "aria-label": `${column.label}, row ${r + 1} of ${n}`, "aria-invalid": invalid ? "true" : undefined, "aria-describedby": invalid ? `${id}-row-err` : undefined };
			const put = (v: string | number | boolean) => {
				const now = value();
				edit(now.map((x, i) => (i === r ? { ...x, [column.id]: v } : x)));
				if (column === name) {
					const renamed = called({ ...row, [column.id]: v }, r);
					handle.setAttribute("aria-label", `Move ${renamed}`);
					cross.setAttribute("aria-label", `Remove ${renamed}`);
				}
			};
			let control: HTMLInputElement | HTMLSelectElement;
			if (column.type === "select") {
				control = el("select", { class: "tb-select", ...attrs }, ...column.options.map((o) => el("option", { value: o.value }, o.label)));
				control.value = String(row[column.id]);
				control.addEventListener("change", () => put(control.value));
			} else if (column.type === "toggle") {
				const box = el("input", { class: "tb-checkbox", type: "checkbox", ...attrs });
				box.checked = row[column.id] === true;
				box.addEventListener("change", () => put(box.checked));
				control = box;
			} else {
				const number = column.type === "number";
				const input = el("input", {
					class: "tb-input",
					type: number ? "number" : "text",
					...(number ? { min: column.min, max: column.max, step: column.step, inputmode: "decimal", dir: "ltr" } : { maxlength: column.maxLength, dir: column.dir ?? "auto", spellcheck: "false", autocomplete: "off", autocapitalize: "off" }),
					...attrs,
				});
				input.value = String(row[column.id]);
				/*
				 * As typed, as a number input is (#262), and refused before `run` naming the row. Clamped, 9999999
				 * under a max of 10000 ran on 10000, and an emptied cell ran on the number it held before.
				 */
				input.addEventListener("input", () => {
					const cell = cells([column], { [column.id]: input.value }, true);
					if (cell) put(cell[column.id] as string | number);
				});
				control = input;
			}
			control.addEventListener("keydown", (e) => {
				const event = e as KeyboardEvent;
				// Alt and an arrow moves the row from any cell; Ctrl or Cmd and Backspace in an empty cell removes it.
				if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
					event.preventDefault();
					move(r, r + (event.key === "ArrowUp" ? -1 : 1), c);
				} else if ((event.ctrlKey || event.metaKey) && event.key === "Backspace" && control.value === "") {
					event.preventDefault();
					remove(r, c);
				}
			});
			cellBox.append(el("span", { class: "tb-cell", "data-label": column.label }, control, column.unit ? el("span", { class: "tb-unit" }, column.unit) : null));
		});
		handle.addEventListener("keydown", (event) => {
			const to = { ArrowUp: r - 1, ArrowDown: r + 1, Home: 0, End: n - 1 }[event.key];
			if (to === undefined) return;
			event.preventDefault();
			move(r, to, "handle");
		});
		/*
		 * A pointer drags by the handle, the keyboard's extra rather than the only way. Listened for on the
		 * window, because each step redraws the list and the handle pressed is not the one under the pointer.
		 */
		handle.addEventListener("pointerdown", (down) => {
			if (down.button !== 0) return;
			let at = r;
			const over = (event: PointerEvent) => {
				const others = [...list.children].filter((_, i) => i !== at);
				const to = others.filter((li) => li.getBoundingClientRect().top + li.getBoundingClientRect().height / 2 < event.clientY).length;
				if (to !== at) {
					move(at, to, "handle");
					at = to;
				}
			};
			const up = () => {
				removeEventListener("pointermove", over);
				removeEventListener("pointerup", up);
			};
			addEventListener("pointermove", over);
			addEventListener("pointerup", up);
		});
		cross.addEventListener("click", () => remove(r, "remove"));
		li.addEventListener("focusout", () => li.removeAttribute("data-moving"));
		li.append(handle, cellBox, cross);
		if (invalid) li.append(el("p", { class: "tb-field-msg tb-row-msg", id: `${id}-row-err` }, marked?.line ?? ""));
		return li;
	};

	const draw = (focus?: Spot) => {
		const now = value();
		const n = now.length;
		drawn = JSON.stringify(now);
		list.replaceChildren(...now.map((row, r) => line(row, r, n)));
		list.hidden = empty.hidden = false;
		(n > 0 ? empty : list).hidden = true;
		if (head) head.hidden = n === 0;
		const full = n >= maxRows;
		for (const [attr, set] of [["aria-disabled", "true"], ["aria-describedby", count.id]] as const) {
			if (full) add.setAttribute(attr, set);
			else add.removeAttribute(attr);
		}
		count.textContent = full ? `${n} of ${maxRows}, the most this tool allows. Remove one to add another.` : `${n} of at most ${maxRows}${min > 0 ? `, at least ${min}` : ""}`;
		if (!focus) return;
		const li = list.children[focus.row];
		const target = focus.at === "handle" ? li?.querySelector(".tb-handle") : focus.at === "remove" ? li?.querySelector(".tb-remove") : li?.querySelectorAll(".tb-cell > :first-child")[focus.at];
		(target as HTMLElement | null)?.focus();
	};

	/*
	 * Stop Enter here so it presses these buttons rather than running the tool, as it would from a cell.
	 * ⚠️ Immediate: the element's Enter-to-run listener is on this same box, added after this one, so plain
	 * stopPropagation let a remove button's Enter both remove the row and run the tool.
	 */
	box.addEventListener("keydown", (event) => {
		if (event.key === "Enter" && (event.target as Element).closest("button")) event.stopImmediatePropagation();
	});
	add.addEventListener("click", () => {
		const now = value();
		if (now.length >= maxRows) return;
		edit([...now, fresh(columns)]);
		draw({ row: now.length, at: 0 });
		say(`Row ${now.length + 1} added, ${now.length + 1} of ${maxRows}.`);
	});

	draw();
	return {
		/** Redraw for a value written from outside, unless it is the one already on screen, which typing wrote. */
		sync: () => {
			if (JSON.stringify(value()) === drawn) return;
			marked = undefined;
			draw();
		},
		/** Show `text` under row `row`, marking its cells, or clear it. */
		mark: (row: number | undefined, text: string) => {
			marked = row === undefined ? undefined : { row, line: text };
			draw();
		},
	};
}
