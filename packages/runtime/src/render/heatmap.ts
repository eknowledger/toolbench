/**
 * The heatmap (#121): a value over two dimensions, one cell each, coloured by how much.
 *
 * Its own chunk, fetched only by a page that draws one. It shares the chart stylesheet and number format
 * with the series chart, as modules of their own, so it never pulls the line and bar renderer in.
 *
 * Colour is the encoding, so it follows the rules a colour encoding needs: sequential is one hue, light to
 * dark (flipped in the dark theme, where "more" is brighter); diverging is two hues either side of a
 * neutral grey midpoint, never a hue at the middle. And colour is never the only channel: a key shows the
 * scale, every cell answers the readout, and every value is in the data table. A `null` cell is hatched,
 * because an empty cell drawn in the lowest colour would claim a value of zero.
 */
import type { Heatmap } from "@toolbench/sdk";
import { el, svg } from "../dom.ts";
import { adoptChartStyles, adoptStyles, format } from "./plot-common.ts";
import type { RenderOptions } from "./index.ts";

const W = 640;
// Ids are per render: two heatmaps in one shadow root would otherwise share a hatch and a key gradient.
let serial = 0;

/*
 * The ramps are tokens, with defaults, so a host can theme them like every other colour. Defined by
 * fallback rather than on :host, so the runtime's own stylesheet does not carry them for pages that never
 * draw a heatmap.
 */
const HEATMAP_STYLES = /* css */ `
.tb-heatmap {
  --lo: var(--tb-heat-lo, light-dark(#eaf2fb, #1d2836));
  --hi: var(--tb-heat-hi, light-dark(#1f5aa8, #8ec4f0));
  --neg: var(--tb-heat-neg, light-dark(#b4531a, #f0a070));
  --mid: var(--tb-heat-mid, light-dark(#eceef2, #2b2e38));
  --pos: var(--tb-heat-pos, light-dark(#1f5aa8, #8ec4f0));
}
.tb-cell { stroke: var(--tb-bg); stroke-width: 2; }
.tb-cell[data-scale="sequential"] { fill: color-mix(in oklab, var(--hi) calc(var(--t) * 100%), var(--lo)); }
.tb-cell[data-scale="neg"] { fill: color-mix(in oklab, var(--neg) calc(var(--t) * 100%), var(--mid)); }
.tb-cell[data-scale="pos"] { fill: color-mix(in oklab, var(--pos) calc(var(--t) * 100%), var(--mid)); }
.tb-cell.tb-hot { stroke: var(--tb-fg); stroke-width: 2; }
.tb-hatch-line { stroke: var(--tb-faint); stroke-width: 1; }
.tb-key-lo { stop-color: var(--lo); }
.tb-key-hi { stop-color: var(--hi); }
.tb-key-neg { stop-color: var(--neg); }
.tb-key-mid { stop-color: var(--mid); }
.tb-key-pos { stop-color: var(--pos); }
`;

export function renderHeatmap(heatmap: Heatmap, options: RenderOptions = {}): HTMLElement {
	const compact = (options.cardChart ?? options.compact) === true;
	const text = (v: number | string) => (typeof v === "string" ? v : format(v));
	const xs = heatmap.x.map(text);
	const ys = heatmap.y.map(text);
	const cols = Math.max(1, xs.length);
	const rows = Math.max(1, ys.length);

	const longest = Math.max(3, ...ys.map((y) => y.length));
	const labelRoom = Math.min(180, 10 + longest * 6.2);
	const cellH = Math.max(14, Math.min(30, 260 / rows));
	const plot = { x: labelRoom + 8, y: 22, w: W - labelRoom - 8 - 16, h: rows * cellH };
	const cellW = plot.w / cols;
	const keyY = plot.y + plot.h + 34;
	const height = keyY + 34;

	const values = heatmap.values.flat().filter((v): v is number => v !== null && Number.isFinite(v));
	const min = values.length > 0 ? Math.min(...values) : 0;
	const max = values.length > 0 ? Math.max(...values) : 1;
	const diverging = heatmap.scale === "diverging";
	const midpoint = heatmap.midpoint ?? 0;
	const reach = diverging ? Math.max(Math.abs(max - midpoint), Math.abs(min - midpoint)) || 1 : max - min || 1;

	/** Where a value sits on the colour scale: `t` from 0 to 1, and which arm of a diverging scale. */
	const shade = (v: number) =>
		diverging ? { scale: v < midpoint ? "neg" : "pos", t: Math.min(1, Math.abs(v - midpoint) / reach) } : { scale: "sequential", t: (v - min) / reach };

	const id = `tb-heat-${++serial}`;
	const marks: SVGElement[] = [
		svg(
			"defs",
			{},
			svg(
				"pattern",
				{ id: `${id}-hatch`, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
				svg("line", { class: "tb-hatch-line", x1: 0, y1: 0, x2: 0, y2: 6 }),
			),
			svg(
				"linearGradient",
				{ id: `${id}-key` },
				...(diverging
					? [svg("stop", { class: "tb-key-neg", offset: "0%" }), svg("stop", { class: "tb-key-mid", offset: "50%" }), svg("stop", { class: "tb-key-pos", offset: "100%" })]
					: [svg("stop", { class: "tb-key-lo", offset: "0%" }), svg("stop", { class: "tb-key-hi", offset: "100%" })]),
			),
		),
	];

	const room = Math.max(2, Math.floor(cellW / 6.2));
	const every = Math.max(1, Math.ceil(36 / cellW));
	xs.forEach((name, c) => {
		if (c % every !== 0) return;
		const label = name.length > room * every ? `${name.slice(0, room * every - 1)}…` : name;
		marks.push(svg("text", { class: "tb-tick", x: plot.x + (c + 0.5) * cellW, y: plot.y + plot.h + 14, "text-anchor": "middle" }, label));
	});
	// The y axis's title sits above its labels: the column of row names leaves no room to rotate it beside them.
	marks.push(svg("text", { class: "tb-axis-label", x: plot.x - 6, y: plot.y - 8, "text-anchor": "end" }, heatmap.yLabel));
	const yRoom = Math.floor(labelRoom / 6.2);
	ys.forEach((name, r) => {
		const label = name.length > yRoom ? `${name.slice(0, yRoom - 1)}…` : name;
		marks.push(svg("text", { class: "tb-tick", x: plot.x - 6, y: plot.y + (r + 0.5) * cellH + 4, "text-anchor": "end" }, label));
	});

	heatmap.y.forEach((_, r) => {
		heatmap.x.forEach((_, c) => {
			const v = heatmap.values[r]?.[c] ?? null;
			const attrs: Record<string, string | number> = { class: "tb-cell", "data-r": r, "data-c": c, x: plot.x + c * cellW, y: plot.y + r * cellH, width: cellW, height: cellH };
			if (v === null) {
				attrs["data-empty"] = "";
				attrs.fill = `url(#${id}-hatch)`;
			}
			else {
				const { scale, t } = shade(v);
				attrs["data-scale"] = scale;
				attrs.style = `--t: ${t.toFixed(3)}`;
			}
			marks.push(svg("rect", attrs));
		});
	});

	// The key: the scale as a strip, its ends and, when diverging, its midpoint, so colour is never the only reading.
	const keyW = Math.min(240, plot.w);
	const keyX = plot.x + plot.w - keyW;
	marks.push(svg("rect", { x: keyX, y: keyY, width: keyW, height: 8, rx: 2, fill: `url(#${id}-key)` }));
	const lo = diverging ? midpoint - reach : min;
	const hi = diverging ? midpoint + reach : max;
	marks.push(svg("text", { class: "tb-tick", x: keyX, y: keyY + 22, "text-anchor": "start" }, format(lo)));
	if (diverging) marks.push(svg("text", { class: "tb-tick", x: keyX + keyW / 2, y: keyY + 22, "text-anchor": "middle" }, format(midpoint)));
	marks.push(svg("text", { class: "tb-tick", x: keyX + keyW, y: keyY + 22, "text-anchor": "end" }, format(hi)));
	marks.push(
		svg("text", { class: "tb-axis-label", x: keyX - 8, y: keyY + 8, "text-anchor": "end" }, heatmap.unit ? `${heatmap.label} (${heatmap.unit})` : heatmap.label),
	);
	marks.push(svg("text", { class: "tb-axis-label", x: plot.x + plot.w / 2, y: plot.y + plot.h + 28, "text-anchor": "middle" }, heatmap.xLabel));

	const description = `${heatmap.label} by ${heatmap.yLabel} and ${heatmap.xLabel}`;
	const figure = el("figure", { class: compact ? "tb-out-chart tb-out-chart-card tb-heatmap" : "tb-out-chart tb-heatmap" });
	const picture = svg("svg", { viewBox: `0 0 ${W} ${height}`, role: "img", "aria-label": description, preserveAspectRatio: "none" }, ...marks) as SVGSVGElement;
	figure.append(el("div", { class: "tb-plot" }, picture), table(heatmap, xs, ys, description));
	attachCellReadout(figure, picture, heatmap, xs, ys, { plot, cellW, cellH, height });
	adoptChartStyles(figure);
	adoptStyles(figure, "heatmap", () => HEATMAP_STYLES);
	return figure;
}

function table(heatmap: Heatmap, xs: string[], ys: string[], description: string): HTMLElement {
	const head = el("tr", {}, el("th", { scope: "col" }, `${heatmap.yLabel} by ${heatmap.xLabel}`), ...xs.map((x) => el("th", { scope: "col" }, x)));
	const body = ys.map((y, r) =>
		el(
			"tr",
			{ "data-i": r },
			el("th", { scope: "row" }, y),
			...xs.map((_, c) => {
				const v = heatmap.values[r]?.[c] ?? null;
				return el("td", {}, v === null ? "—" : format(v));
			}),
		),
	);
	return el(
		"details",
		{ class: "tb-chart-data" },
		el("summary", {}, "Show the data as a table"),
		el("table", {}, el("caption", {}, heatmap.unit ? `${description}, in ${heatmap.unit}` : description), el("thead", {}, head), el("tbody", {}, ...body)),
	);
}

/**
 * The readout for a heatmap. On cells the mark is the target, so it follows the cell under the pointer
 * rather than snapping to an x, and the keyboard moves through the grid in both directions.
 */
function attachCellReadout(
	figure: HTMLElement,
	plotSvg: SVGSVGElement,
	heatmap: Heatmap,
	xs: string[],
	ys: string[],
	g: { plot: { x: number; y: number; w: number; h: number }; cellW: number; cellH: number; height: number },
): void {
	const card = el("div", { class: "tb-readout", hidden: true, "aria-hidden": "true" });
	const live = el("p", { class: "tb-sr", role: "status", "aria-live": "polite" });
	figure.append(card, live);
	const plotBox = plotSvg.parentElement as HTMLElement;
	plotBox.setAttribute("tabindex", "0");
	plotBox.setAttribute("role", "group");
	plotBox.setAttribute("aria-roledescription", "heatmap");
	plotBox.setAttribute("aria-label", `${plotSvg.getAttribute("aria-label") ?? ""}. Arrow keys move between cells.`);

	let at: [number, number] | null = null;
	const show = (r: number, c: number) => {
		at = [r, c];
		for (const cell of plotSvg.querySelectorAll(".tb-cell")) {
			cell.classList.toggle("tb-hot", Number(cell.getAttribute("data-r")) === r && Number(cell.getAttribute("data-c")) === c);
		}
		const v = heatmap.values[r]?.[c] ?? null;
		const title = `${heatmap.yLabel} ${ys[r] ?? ""}, ${heatmap.xLabel} ${xs[c] ?? ""}`;
		const value = v === null ? "no value" : `${format(v)}${heatmap.unit ? ` ${heatmap.unit}` : ""}`;
		const heading = el("p", { class: "tb-readout-title" });
		heading.textContent = title;
		const strong = el("strong", {});
		strong.textContent = value;
		const name = el("span", {});
		name.textContent = heatmap.label;
		card.replaceChildren(heading, el("ul", { class: "tb-readout-rows" }, el("li", {}, strong, name)));
		card.hidden = false;
		live.textContent = `${title}: ${heatmap.label} ${value}`;
		const box = plotSvg.getBoundingClientRect();
		const frame = figure.getBoundingClientRect();
		const cx = g.plot.x + (c + 0.5) * g.cellW;
		const cy = g.plot.y + (r + 0.5) * g.cellH;
		card.style.left = `${Math.round(box.left - frame.left + cx * (box.width / W))}px`;
		card.style.top = `${Math.round(box.top - frame.top + cy * (box.height / g.height))}px`;
		card.toggleAttribute("data-flip", cx > g.plot.x + g.plot.w / 2);
	};
	const hide = () => {
		at = null;
		card.hidden = true;
		for (const cell of plotSvg.querySelectorAll(".tb-hot")) cell.classList.remove("tb-hot");
	};
	plotSvg.addEventListener("pointermove", (event) => {
		const cell = (event.target as Element).closest?.(".tb-cell");
		if (cell) show(Number(cell.getAttribute("data-r")), Number(cell.getAttribute("data-c")));
		else if (event.pointerType === "mouse") hide();
	});
	plotSvg.addEventListener("pointerleave", (event) => {
		if (event.pointerType === "mouse") hide();
	});
	plotBox.addEventListener("focus", () => {
		if (!at) show(0, 0);
	});
	plotBox.addEventListener("blur", hide);
	plotBox.addEventListener("keydown", (event) => {
		if (event.target !== plotBox || !at) return;
		const [r, c] = at;
		const key = (event as KeyboardEvent).key;
		const moves: Record<string, [number, number]> = {
			ArrowUp: [Math.max(0, r - 1), c],
			ArrowDown: [Math.min(ys.length - 1, r + 1), c],
			ArrowLeft: [r, Math.max(0, c - 1)],
			ArrowRight: [r, Math.min(xs.length - 1, c + 1)],
			Home: [r, 0],
			End: [r, xs.length - 1],
		};
		const next = moves[key];
		if (key === "Escape") {
			hide();
			event.preventDefault();
		} else if (next) {
			show(next[0], next[1]);
			event.preventDefault();
		}
	});
}
