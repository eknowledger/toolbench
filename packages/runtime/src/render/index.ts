/**
 * Output renderers: one per kind, plus the dispatcher.
 *
 * Two properties are load-bearing here.
 *
 * **The dispatcher is exhaustive at compile time.** The `const _: never` at the bottom of `render`
 * means adding a kind to the SDK's `Output` union without adding a renderer is a *type error in this
 * package*, not a blank space in front of a reader. That is the mechanism that keeps a contract
 * version bump from silently breaking rendering.
 *
 * **A card truncates fields and nothing else.** `cardFields` exists so a compact slot can show the
 * first few values, but an error is never shortened — a partial error reads as a complete answer,
 * which is the one failure mode worse than showing nothing.
 */
import type { ByteRange, Cell, Field, Output } from "@toolbench/sdk";
import { el } from "../dom.ts";
import { renderChart } from "./chart.ts";

export interface RenderOptions {
	/** Compact mode: fewer fields, no captions, no chart legend. */
	compact?: boolean;
	/** How many fields a compact render shows before stopping. */
	cardFields?: number;
}

export function render(output: Output, options: RenderOptions = {}): HTMLElement {
	switch (output.kind) {
		case "fields":
			return renderFields(output.fields, options);
		case "text":
			return renderText(output.text, output.mono === true);
		case "code":
			return renderCode(output.lang, output.source);
		case "table":
			return renderTable(output, options);
		case "series":
			return renderChart(output.chart, options);
		case "group": {
			/*
			 * ⚠️ A compact slot renders the FIRST part only, plus a count of what it left out.
			 *
			 * A group is how a tool answers in more than one shape — fields and a table and a chart — and
			 * a card that rendered all of them would be a page. Truncating fields but not the table
			 * beside them (the first version) produced a card that was somehow both abbreviated and
			 * enormous.
			 */
			if (options.compact && output.parts.length > 1) {
				const [first, ...rest] = output.parts;
				return el(
					"div",
					{ class: "tb-group" },
					first ? render(first, options) : null,
					el("p", { class: "tb-more" }, `+${rest.length} more result${rest.length === 1 ? "" : "s"} on the full tool`),
				);
			}
			return el("div", { class: "tb-group" }, ...output.parts.map((part) => render(part, options)));
		}
		case "bytes":
			return renderBytes(output, options);
		case "error":
			return renderError(output);
		default: {
			/*
			 * ⚠️ If this line fails to compile, the SDK gained an output kind and this file did not.
			 * That is the intended outcome: fix it here rather than shipping a tool that renders
			 * nothing. `UnknownOutput` below is for the *runtime* case — an old runtime meeting a new
			 * tool — which a compiler cannot catch.
			 */
			const _exhaustive: never = output;
			return unknownOutput((_exhaustive as { kind: string }).kind);
		}
	}
}

/** What a reader sees when a tool needs a newer runtime than the one on the page. */
export function unknownOutput(kind: string): HTMLElement {
	return el(
		"div",
		{ class: "tb-unknown", role: "status" },
		el("strong", {}, "This tool needs a newer version of the runtime."),
		el("p", {}, `It returned a "${kind}" result, which this page does not know how to draw.`),
	);
}

function renderFields(fields: Field[], options: RenderOptions): HTMLElement {
	const limit = options.compact ? (options.cardFields ?? 4) : fields.length;
	const shown = fields.slice(0, limit);
	const hidden = fields.length - shown.length;

	const groups = new Map<string, Field[]>();
	for (const field of shown) {
		const key = field.group ?? "";
		groups.set(key, [...(groups.get(key) ?? []), field]);
	}

	const sections: HTMLElement[] = [];
	for (const [group, groupFields] of groups) {
		const rows = groupFields.map((field) =>
			el(
				"div",
				{ class: "tb-field", "data-tone": field.tone ?? "normal" },
				el("dt", {}, field.label),
				el(
					"dd",
					{},
					el("span", { class: "tb-value" }, field.value),
					field.note ? el("span", { class: "tb-note" }, field.note) : null,
				),
			),
		);
		sections.push(
			group
				? el("section", { class: "tb-field-group" }, el("h4", {}, group), el("dl", {}, ...rows))
				: el("dl", { class: "tb-fields" }, ...rows),
		);
	}

	if (hidden > 0) {
		// "fields" rather than a bare count: a group can also be truncated in a card, and two
		// unlabelled "+2 more" lines next to each other are a puzzle rather than information.
		sections.push(el("p", { class: "tb-more" }, `+${hidden} more field${hidden === 1 ? "" : "s"}`));
	}
	return el("div", { class: "tb-out-fields" }, ...sections);
}

function renderText(text: string, mono: boolean): HTMLElement {
	return el("div", { class: "tb-out-text" }, el(mono ? "pre" : "p", { class: mono ? "tb-mono" : "" }, text));
}

function renderCode(lang: string, source: string): HTMLElement {
	/*
	 * No syntax highlighting, deliberately. A highlighter is a large dependency and a host site
	 * usually already has one; the `data-lang` hook lets it style this block if it wants to.
	 */
	return el(
		"div",
		{ class: "tb-out-code", "data-lang": lang },
		el("pre", {}, el("code", { class: `language-${lang}` }, source)),
	);
}

function renderTable(
	output: Extract<Output, { kind: "table" }>,
	options: RenderOptions,
): HTMLElement {
	const head = el(
		"tr",
		{},
		...output.columns.map((column) =>
			el("th", { scope: "col", "data-align": column.align ?? "start", class: column.mono ? "tb-mono" : "" }, column.label),
		),
	);
	const body = output.rows.map((row) =>
		el(
			"tr",
			{},
			...row.map((cell, i) => {
				const column = output.columns[i];
				const value = typeof cell === "object" && cell !== null ? cell : { text: String(cell) };
				const mono = ("mono" in value ? value.mono : undefined) ?? column?.mono ?? false;
				return el(
					"td",
					{
						"data-align": column?.align ?? (typeof cell === "number" ? "end" : "start"),
						"data-tone": ("tone" in value ? value.tone : undefined) ?? "normal",
						class: mono ? "tb-mono" : "",
					},
					value.text,
				);
			}),
		),
	);
	return el(
		"div",
		{ class: "tb-out-table" },
		el(
			"table",
			{},
			output.caption && !options.compact ? el("caption", {}, output.caption) : null,
			el("thead", {}, head),
			el("tbody", {}, ...body),
		),
	);
}

/** How many bytes per row. 16 is the convention every hex dump uses, and readers expect it. */
const BYTES_PER_ROW = 16;
/** Above this, a card would be a page. The full tool shows everything. */
const COMPACT_ROWS = 4;

/**
 * Raw bytes the way someone reading a wire format wants them: offset, hex, printable gutter.
 *
 * ⚠️ Two things this does that a `table` cannot, which is why the kind exists.
 *
 * A highlight spans a *byte range*, not cells, so it can start mid-row and wrap. Each byte carries
 * its range's tone, and the legend names every range, because colour alone tells a reader something
 * is interesting without saying what — and tells a screen reader nothing at all.
 *
 * The printable gutter replaces a non-printable byte with `.`, the convention, rather than trying to
 * render control characters. A byte is only shown as itself between 0x20 and 0x7e.
 */
function renderBytes(output: Extract<Output, { kind: "bytes" }>, options: RenderOptions): HTMLElement {
	const { bytes, highlight = [], offset = 0 } = output;
	/*
	 * One lookup per byte, built once. The alternative is scanning every range per byte, which is
	 * O(bytes x ranges) and shows up immediately on a packet-sized dump.
	 */
	const rangeOf = new Map<number, ByteRange>();
	for (const range of highlight) {
		for (let i = range.at; i < range.at + range.len && i < bytes.length; i++) rangeOf.set(i, range);
	}

	const totalRows = Math.ceil(bytes.length / BYTES_PER_ROW);
	const rows = options.compact ? Math.min(totalRows, COMPACT_ROWS) : totalRows;
	const hex = (n: number, width: number) => n.toString(16).padStart(width, "0");

	const lines: HTMLElement[] = [];
	for (let row = 0; row < rows; row++) {
		const start = row * BYTES_PER_ROW;
		const slice = bytes.slice(start, start + BYTES_PER_ROW);
		lines.push(
			el(
				"div",
				{ class: "tb-bytes-row" },
				el("span", { class: "tb-bytes-offset" }, hex(offset + start, 8)),
				el(
					"span",
					{ class: "tb-bytes-hex" },
					...slice.map((byte, i) => {
						const range = rangeOf.get(start + i);
						return el(
							"span",
							{
								class: "tb-byte",
								...(range ? { "data-tone": range.tone ?? "normal", title: range.label } : {}),
							},
							hex(byte, 2),
						);
					}),
				),
				el(
					"span",
					{ class: "tb-bytes-ascii" },
					...slice.map((byte, i) => {
						const range = rangeOf.get(start + i);
						return el(
							"span",
							{ class: "tb-byte", ...(range ? { "data-tone": range.tone ?? "normal" } : {}) },
							byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".",
						);
					}),
				),
			),
		);
	}

	const hidden = totalRows - rows;
	return el(
		"figure",
		{ class: "tb-out-bytes" },
		output.caption ? el("figcaption", { class: "tb-bytes-caption" }, output.caption) : null,
		el("div", { class: "tb-bytes-grid" }, el("div", { class: "tb-bytes-grid-inner" }, ...lines)),
		hidden > 0
			? el("p", { class: "tb-more" }, `+${hidden * BYTES_PER_ROW} more bytes on the full tool`)
			: null,
		/*
		 * The legend is the accessible half of this renderer. A hex grid is a wall of numbers to a
		 * screen reader, so every named range is also stated as text with its offset and length.
		 */
		highlight.length > 0
			? el(
					"ul",
					{ class: "tb-bytes-legend" },
					...highlight.map((range) =>
						el(
							"li",
							{ "data-tone": range.tone ?? "normal" },
							el("span", { class: "tb-bytes-swatch" }),
							`${range.label} — ${range.len} byte${range.len === 1 ? "" : "s"} at 0x${hex(offset + range.at, 4)}`,
						),
					),
				)
			: null,
	);
}

function renderError(output: Extract<Output, { kind: "error" }>): HTMLElement {
	/*
	 * Never truncated, never abbreviated, and always announced. `input` is what lets the form mark
	 * the offending control — the element wires that up; this only draws the message.
	 */
	const at = output.at !== undefined ? el("span", { class: "tb-at" }, `at ${output.at}${output.len ? `–${output.at + output.len}` : ""}`) : null;
	return el(
		"div",
		{ class: "tb-out-error", role: "alert", "data-input": output.input ?? "" },
		el("span", { class: "tb-error-icon", "aria-hidden": "true" }, "!"),
		el("span", { class: "tb-error-message" }, output.message),
		at,
	);
}

export type { Cell };
