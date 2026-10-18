/**
 * The ER chunk: record nodes with a header and rows, and the markers beyond arrow and open, crow's feet among
 * them. Fetched for the first graph with a record or one of those markers.
 *
 * No DOM import: rows are drawn through the element factory the drawing passes in, so the worker that lays out
 * a large graph can import this chunk for a record's size without carrying any drawing code.
 */
import { ext } from "./chunks.ts";
import { HEAD, oddUp, ROW, SHAPES, textW } from "./geometry.ts";

SHAPES.record = { size: () => [0, 0], r: 4 };

ext.css.er = `.tb-graph-row,.tb-graph-head-name{fill:var(--tb-fg);font:600 12px var(--tb-mono)}.tb-graph-row{font:11px var(--tb-mono)}
.tb-graph-detail{fill:var(--tb-muted);font:11px var(--tb-mono)}.tb-graph-tag{fill:var(--c,var(--tb-muted));font:600 9px var(--tb-mono)}
.tb-graph-header{fill:color-mix(in oklab,var(--c,var(--tb-faint)) 22%,var(--tb-bg))}.tb-graph-rule{stroke:color-mix(in oklab,var(--c,var(--tb-faint)) 35%,var(--tb-border))}`;

ext.record = {
	size: (n) => {
		let w = textW(n.label ?? n.id, 12) + 28;
		for (const r of n.rows ?? []) w = Math.max(w, (r.tag ? textW(r.tag, 9) + 8 : 0) + textW(r.label, 11) + (r.detail ? textW(r.detail, 11) + 18 : 0) + 24);
		return [oddUp(w), oddUp(HEAD + (n.rows?.length ?? 0) * ROW)];
	},
	draw: (n, _g, add) => {
		const { x, y, w } = n;
		const mid = { "dominant-baseline": "central" };
		add("path", { class: "tb-graph-header", d: `M${x + 0.75} ${y + HEAD}V${y + 4.75}Q${x + 0.75} ${y + 0.75} ${x + 4.75} ${y + 0.75}H${x + w - 4.75}Q${x + w - 0.75} ${y + 0.75} ${x + w - 0.75} ${y + 4.75}V${y + HEAD}Z` });
		add("text", { class: "tb-graph-head-name", x: x + w / 2, y: y + HEAD / 2, "text-anchor": "middle", ...mid }, n.label);
		for (const r of n.rows ?? []) {
			const cy = r.y + r.h / 2;
			let tx = x + 10;
			add("line", { class: "tb-graph-rule", x1: x, x2: x + w, y1: r.y, y2: r.y });
			if (r.tag) (add("text", { class: "tb-graph-tag", x: tx, y: cy, ...mid }, r.tag), (tx += textW(r.tag, 9) + 8));
			add("text", { class: "tb-graph-row", x: tx, y: cy, "data-row": r.id, ...mid }, r.label);
			if (r.detail) add("text", { class: "tb-graph-detail", x: x + w - 10, y: cy, "text-anchor": "end", ...mid }, r.detail);
		}
	},
};

/** Crow's foot and UML ends: bars, a circle, the foot, a diamond. Drawn as lines, so the edge's stroke draws them. */
ext.mark = (m, at) => {
	const bar = (b: number) => `M${at(b, -5)}L${at(b, 5)}`;
	const circ = (b: number) => `M${at(b - 4, 0)}A4 4 0 1 0 ${at(b + 4, 0)}A4 4 0 1 0 ${at(b - 4, 0)}Z`;
	const foot = `M${at(12, 0)}L${at(0, -6)}M${at(12, 0)}L${at(0, 0)}M${at(12, 0)}L${at(0, 6)}`;
	const dia = `M${at(0, 0)}L${at(6, -4.5)}L${at(12, 0)}L${at(6, 4.5)}Z`;
	const table: Record<string, [string, string]> = {
		diamond: [dia, "solid"],
		"open-diamond": [dia, "hollow"],
		circle: [circ(4), "solid"],
		"open-circle": [circ(4), "hollow"],
		bar: [bar(4), "none"],
		one: [bar(8), "none"],
		"only-one": [bar(7) + bar(12), "none"],
		"zero-or-one": [bar(7) + circ(16), "hollow"],
		many: [foot, "none"],
		"one-or-many": [foot + bar(16), "none"],
		"zero-or-many": [foot + circ(17), "hollow"],
	};
	return table[m]!;
};
