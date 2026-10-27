/**
 * The `bytes` kind (contract v2): a hex dump with offsets, a printable gutter and named ranges, and its rules.
 *
 * A chunk of its own on the chart kinds' pattern, fetched when a bytes result is drawn or before a seed holding
 * one paints, so a page that never shows a hex dump pays nothing for it. Built into the chunk every page loads,
 * it cost 817 gzipped bytes there, measured, for a kind most tools never return.
 */
import type { ByteRange, Output } from "@toolbench/sdk";
import { el } from "../dom.ts";
import { adoptStyles } from "../styles.ts";
import { plural, type RenderOptions } from "./index.ts";

const STYLES = /* css */ `
.tb-out-bytes { margin: 0; }
.tb-bytes-caption { color: var(--tb-faint); font-size: 0.78rem; padding-bottom: 0.375rem; }
.tb-bytes-grid {
  font-family: var(--tb-mono); font-size: 0.78rem; line-height: 1.6;
  background: var(--tb-surface); border: 1px solid var(--tb-border); border-radius: 8px;
  padding: 0.5rem 0.625rem; overflow-x: auto;
}
/* ⚠️ ONE grid for the whole dump, with the rows as display:contents.
   Each row being its own grid was the first version, and the columns then sized per row: a final row
   with three bytes had a narrower hex column, so its ASCII gutter sat several characters left of the
   row above. A hex dump whose columns shift is not a hex dump. */
.tb-bytes-grid-inner { display: grid; grid-template-columns: auto auto auto; gap: 0 0.875rem; justify-content: start; }
.tb-bytes-row { display: contents; }
.tb-bytes-offset, .tb-bytes-hex, .tb-bytes-ascii { white-space: pre; }
.tb-bytes-offset { color: var(--tb-faint); }
.tb-bytes-hex .tb-byte + .tb-byte { margin-left: 0.5ch; }
.tb-bytes-ascii { color: var(--tb-muted); }
/* Tone marks a byte's range. The background carries it rather than the text colour, because two hex
   digits are too small a target to read a colour from.
   ⚠️ The normal tone gets a SOLID accent, not the wash. The wash (--tb-accent-bg) was the first choice and
   it is nearly the surface colour: every two and three-byte highlight was invisible, and only the one
   range that happened to carry a tone showed up at all. */
.tb-byte[data-tone] { border-radius: 2px; }
.tb-byte[data-tone="normal"] { background: var(--tb-accent); color: var(--tb-accent-ink); }
.tb-byte[data-tone="good"]   { background: var(--tb-good); color: var(--tb-bg); }
.tb-byte[data-tone="warn"]   { background: var(--tb-warn); color: var(--tb-bg); }
.tb-byte[data-tone="bad"]    { background: var(--tb-bad); color: var(--tb-bg); }
/* An untoned range in the next series colour (#148), after the tone rules so it beats "normal" at equal
   specificity. The page colour as text: the light series are dark and the dark series light, and every
   pairing measured 5.58:1 or better in both themes. --_tb-range is private, not a theming token. */
.tb-out-bytes [data-series="1"] { --_tb-range: var(--tb-s1); }
.tb-out-bytes [data-series="2"] { --_tb-range: var(--tb-s2); }
.tb-out-bytes [data-series="3"] { --_tb-range: var(--tb-s3); }
.tb-out-bytes [data-series="4"] { --_tb-range: var(--tb-s4); }
.tb-out-bytes [data-series="5"] { --_tb-range: var(--tb-s5); }
.tb-out-bytes [data-series="6"] { --_tb-range: var(--tb-s6); }
.tb-byte[data-series] { background: var(--_tb-range); color: var(--tb-bg); }
.tb-bytes-legend {
  display: flex; flex-wrap: wrap; gap: 0.75rem;
  margin: 0.5rem 0 0; padding: 0; list-style: none;
  font-size: 0.78rem; color: var(--tb-muted);
}
.tb-bytes-legend li { display: flex; align-items: center; gap: 0.375rem; }
.tb-bytes-swatch { width: 0.75rem; height: 0.75rem; border-radius: 2px; background: var(--tb-accent); }
.tb-bytes-legend li[data-tone="good"] .tb-bytes-swatch { background: var(--tb-good); }
.tb-bytes-legend li[data-tone="warn"] .tb-bytes-swatch { background: var(--tb-warn); }
.tb-bytes-legend li[data-tone="bad"]  .tb-bytes-swatch { background: var(--tb-bad); }
.tb-bytes-legend li[data-series] .tb-bytes-swatch { background: var(--_tb-range); }
`;

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
 * is interesting without saying what, and tells a screen reader nothing at all.
 *
 * The printable gutter replaces a non-printable byte with `.`, the convention, rather than trying to
 * render control characters. A byte is only shown as itself between 0x20 and 0x7e.
 */
export function renderBytes(output: Extract<Output, { kind: "bytes" }>, options: RenderOptions): HTMLElement {
	const { bytes, highlight = [], offset = 0 } = output;
	/*
	 * One lookup per byte, built once. The alternative is scanning every range per byte, which is
	 * O(bytes x ranges) and shows up immediately on a packet-sized dump.
	 */
	const rangeOf = new Map<number, ByteRange>();
	for (const range of highlight) {
		for (let i = range.at; i < range.at + range.len && i < bytes.length; i++) rangeOf.set(i, range);
	}
	/*
	 * A range with no tone takes the next chart series colour, 1 to 6 and then round again (#148). Every one
	 * used to be the same accent, so a decoder marking eight fields of a message drew eight identical blocks,
	 * and two adjacent ranges read as one. A tone still wins: it says something about a range, and a `bad`
	 * field must look bad whatever its neighbours are. Counted over untoned ranges only, so a toned one in
	 * the middle does not leave a colour unused. The label stays in the legend and the hover, because a
	 * colour on its own tells a reader nothing about which field it is.
	 */
	const attrs = new Map<ByteRange, Record<string, string>>();
	let untoned = 0;
	for (const range of highlight) {
		attrs.set(range, range.tone ? { "data-tone": range.tone } : { "data-tone": "normal", "data-series": String((untoned++ % 6) + 1) });
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
								...(range ? { ...attrs.get(range), title: range.label } : {}),
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
							{ class: "tb-byte", ...(range ? attrs.get(range) : {}) },
							byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".",
						);
					}),
				),
			),
		);
	}

	const hidden = totalRows - rows;
	const figure = el(
		"figure",
		{ class: "tb-out-bytes" },
		output.caption ? el("figcaption", { class: "tb-bytes-caption" }, output.caption) : null,
		el("div", { class: "tb-bytes-grid" }, el("div", { class: "tb-bytes-grid-inner" }, ...lines)),
		// Stands down for a disclosure, for the same reason the field notice does.
		hidden > 0 && options.more !== "expand"
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
							attrs.get(range),
							el("span", { class: "tb-bytes-swatch" }),
							`${range.label}: ${plural(range.len, "byte")} at 0x${hex(offset + range.at, 4)}`,
						),
					),
				)
			: null,
	);
	adoptStyles(figure, "bytes", () => STYLES);
	return figure;
}
