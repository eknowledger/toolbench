/**
 * The treemap (#129): a hierarchy of sizes as nested rectangles, each rectangle's area its value.
 *
 * Squarified (Bruls, Huizing and van Wijk), so rectangles stay close to square and two of them can be
 * compared by eye; a slice-and-dice layout makes long slivers nobody can compare. Top-level groups take the
 * series colours and their children lighter steps of the same hue, so grouping reads without a legend. A
 * label is drawn only where it fits; every node is in the readout and the data table, so a rectangle too
 * small for its name loses nothing. At most three levels are drawn, deeper ones fold into their parent.
 *
 * Its own chunk, sharing the chart stylesheet and number format with the other kinds.
 */
import type { Treemap, TreemapNode } from "@toolbench/sdk";
import { el, svg } from "../dom.ts";
import type { RenderOptions } from "./index.ts";
import { adoptChartStyles, adoptStyles, format } from "./plot-common.ts";

const W = 640;
const H = 360;
const MAX_DEPTH = 3;

const TREEMAP_STYLES = /* css */ `
.tb-tile { fill: color-mix(in oklab, var(--c) calc(100% - var(--d) * 28%), var(--tb-bg)); stroke: var(--tb-bg); stroke-width: 2; }
.tb-tile[data-tone="good"] { --c: var(--tb-good); }
.tb-tile[data-tone="warn"] { --c: var(--tb-warn); }
.tb-tile[data-tone="bad"] { --c: var(--tb-bad); }
.tb-tile.tb-hot { stroke: var(--tb-fg); }
/* Text in the surface colour on the two strongest steps, in the text colour on the palest: in both themes the
   first two steps are far from the surface and the third is near it, so this keeps every label legible. */
.tb-tile-label { fill: var(--tb-bg); font-family: var(--tb-font); font-size: 11px; font-weight: 600; pointer-events: none; }
.tb-tile-value { fill: var(--tb-bg); font-family: var(--tb-mono); font-size: 10px; pointer-events: none; }
.tb-tile-label[data-depth="3"], .tb-tile-value[data-depth="3"] { fill: var(--tb-fg); }
.tb-tree-row th { font-weight: 400; }
`;

interface Laid {
	node: TreemapNode;
	value: number;
	path: string[];
	depth: number;
	group: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

/** A node's value: its children's sum when it has children, whatever it says itself. */
function valueOf(node: TreemapNode): number {
	if (node.children && node.children.length > 0) return node.children.reduce((sum, c) => sum + valueOf(c), 0);
	return Math.max(0, node.value ?? 0);
}

/** Every branch whose own value disagrees with its children's sum, for the caption to own up to. */
function mismatches(node: TreemapNode): number {
	const here = node.children && node.children.length > 0 && node.value !== undefined && Math.abs(node.value - valueOf(node)) > 1e-9 ? 1 : 0;
	return here + (node.children ?? []).reduce((sum, c) => sum + mismatches(c), 0);
}

/** The aspect ratio of the worst rectangle a row of these areas would make along a side of length `side`. */
function worst(row: number[], side: number): number {
	const sum = row.reduce((a, b) => a + b, 0);
	const max = Math.max(...row);
	const min = Math.min(...row);
	return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/** Squarified layout of `areas` (already scaled to the rectangle's area, largest first) into a rectangle. */
function squarify(areas: number[], rect: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number }[] {
	const out: { x: number; y: number; w: number; h: number }[] = [];
	let { x, y, w, h } = rect;
	let row: number[] = [];
	const place = (items: number[]) => {
		const sum = items.reduce((a, b) => a + b, 0);
		if (w >= h) {
			const width = h > 0 ? sum / h : 0;
			let yy = y;
			for (const a of items) {
				const hh = width > 0 ? a / width : 0;
				out.push({ x, y: yy, w: width, h: hh });
				yy += hh;
			}
			x += width;
			w -= width;
		} else {
			const height = w > 0 ? sum / w : 0;
			let xx = x;
			for (const a of items) {
				const ww = height > 0 ? a / height : 0;
				out.push({ x: xx, y, w: ww, h: height });
				xx += ww;
			}
			y += height;
			h -= height;
		}
	};
	for (const area of areas) {
		const side = Math.min(w, h);
		if (row.length === 0 || worst([...row, area], side) <= worst(row, side)) row.push(area);
		else {
			place(row);
			row = [area];
		}
	}
	if (row.length > 0) place(row);
	return out;
}

/** Lay out a node's children inside its rectangle, recursively, to MAX_DEPTH. */
function lay(node: TreemapNode, rect: { x: number; y: number; w: number; h: number }, path: string[], depth: number, group: number, into: Laid[]): void {
	const children = (node.children ?? []).filter((c) => valueOf(c) > 0);
	const total = children.reduce((sum, c) => sum + valueOf(c), 0);
	if (children.length === 0 || total === 0 || depth > MAX_DEPTH) return;
	const ordered = [...children].sort((a, b) => valueOf(b) - valueOf(a));
	const area = rect.w * rect.h;
	const rects = squarify(
		ordered.map((c) => (valueOf(c) / total) * area),
		rect,
	);
	ordered.forEach((child, i) => {
		const r = rects[i];
		if (!r) return;
		const g = depth === 1 ? (node.children ?? []).indexOf(child) : group;
		const laid: Laid = { node: child, value: valueOf(child), path: [...path, child.label], depth, group: g, ...r };
		into.push(laid);
		// A group's children sit inside it under a strip for its name, when there is room for one.
		const strip = child.children && child.children.length > 0 && r.h > 40 && r.w > 60 ? 15 : 0;
		lay(child, { x: r.x + 2, y: r.y + strip + 2, w: Math.max(0, r.w - 4), h: Math.max(0, r.h - strip - 4) }, laid.path, depth + 1, g, into);
	});
}

export function renderTreemap(treemap: Treemap, options: RenderOptions = {}): HTMLElement {
	const compact = (options.cardChart ?? options.compact) === true;
	const unit = treemap.unit ? ` ${treemap.unit}` : "";
	const total = valueOf(treemap.root);
	const laid: Laid[] = [];
	lay(treemap.root, { x: 0, y: 0, w: W, h: H }, [], 1, 0, laid);

	const marks: SVGElement[] = [];
	laid.forEach((t, i) => {
		marks.push(
			svg("rect", {
				class: `tb-tile tb-s${(t.group % 6) + 1}`,
				"data-i": i,
				...(t.node.tone ? { "data-tone": t.node.tone } : {}),
				style: `--d: ${t.depth - 1}`,
				x: t.x,
				y: t.y,
				width: Math.max(0, t.w),
				height: Math.max(0, t.h),
			}),
		);
		// A name where it fits, and its value under it where that fits too.
		const fits = t.w > Math.min(t.node.label.length, 18) * 6.4 + 10 && t.h > 18;
		if (!fits) return;
		const name = t.node.label.length > 18 ? `${t.node.label.slice(0, 17)}…` : t.node.label;
		marks.push(svg("text", { class: "tb-tile-label", "data-depth": t.depth, x: t.x + 5, y: t.y + 13 }, name));
		if (t.h > 32 && !(t.node.children && t.node.children.length > 0)) {
			marks.push(svg("text", { class: "tb-tile-value", "data-depth": t.depth, x: t.x + 5, y: t.y + 26 }, `${format(t.value)}${unit}`));
		}
	});

	const off = mismatches(treemap.root);
	const figure = el("figure", { class: compact ? "tb-out-chart tb-out-chart-card tb-treemap" : "tb-out-chart tb-treemap" });
	const picture = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${treemap.label}, ${format(total)}${unit} in all`, preserveAspectRatio: "none" }, ...marks) as SVGSVGElement;
	figure.append(
		el("div", { class: "tb-plot" }, picture),
		table(treemap, laid, total, unit, off > 0 ? `${off} group${off === 1 ? "'s" : "s'"} own value differed from the sum of its parts; the parts are drawn` : undefined),
	);
	attachTileReadout(figure, picture, treemap, laid, total, unit);
	adoptChartStyles(figure);
	adoptStyles(figure, "treemap", () => TREEMAP_STYLES);
	return figure;
}

const share = (v: number, total: number) => (total > 0 ? `${((v / total) * 100).toFixed(v / total < 0.0995 ? 1 : 0)}%` : "—");

function table(treemap: Treemap, laid: Laid[], total: number, unit: string, note: string | undefined): HTMLElement {
	// The hierarchy in reading order, each row indented by its depth.
	const ordered = [...laid].sort((a, b) => a.path.join("\u0000").localeCompare(b.path.join("\u0000")));
	const head = el("tr", {}, el("th", { scope: "col" }, "Part"), el("th", { scope: "col" }, `Value${unit ? ` (${unit.trim()})` : ""}`), el("th", { scope: "col" }, "Share"));
	const rows = ordered.map((t) => {
		const name = el("th", { scope: "row", style: `padding-inline-start: ${(t.depth - 1) * 1.1 + 0.5}rem` });
		name.textContent = t.node.label;
		return el("tr", { class: "tb-tree-row" }, name, el("td", {}, format(t.value)), el("td", {}, share(t.value, total)));
	});
	return el(
		"details",
		{ class: "tb-chart-data" },
		el("summary", {}, "Show the data as a table"),
		el("table", {}, el("caption", {}, note ? `${treemap.label}. ${note}.` : treemap.label), el("thead", {}, head), el("tbody", {}, ...rows)),
	);
}

/** On tiles the mark is the target. The keyboard steps through the deepest tiles in reading order. */
function attachTileReadout(figure: HTMLElement, plotSvg: SVGSVGElement, treemap: Treemap, laid: Laid[], total: number, unit: string): void {
	const card = el("div", { class: "tb-readout", hidden: true, "aria-hidden": "true" });
	const live = el("p", { class: "tb-sr", role: "status", "aria-live": "polite" });
	figure.append(card, live);
	const plotBox = plotSvg.parentElement as HTMLElement;
	plotBox.setAttribute("tabindex", "0");
	plotBox.setAttribute("role", "group");
	plotBox.setAttribute("aria-roledescription", "treemap");
	plotBox.setAttribute("aria-label", `${treemap.label}. Arrow keys read each part.`);
	const leaves = laid.map((t, i) => ({ t, i })).filter(({ t }) => !t.node.children || t.node.children.length === 0 || t.depth === MAX_DEPTH);
	let current = -1;
	const show = (i: number, at?: { x: number; y: number }) => {
		const t = laid[i];
		if (!t) return;
		for (const tile of plotSvg.querySelectorAll(".tb-tile")) tile.classList.toggle("tb-hot", Number(tile.getAttribute("data-i")) === i);
		const heading = el("p", { class: "tb-readout-title" });
		heading.textContent = t.path.join(" / ");
		const strong = el("strong", {});
		strong.textContent = share(t.value, total);
		const value = el("span", {});
		value.textContent = `${format(t.value)}${unit}`;
		card.replaceChildren(heading, el("ul", { class: "tb-readout-rows" }, el("li", {}, strong, value)));
		card.hidden = false;
		live.textContent = `${t.path.join(", ")}: ${format(t.value)}${unit}, ${share(t.value, total)}`;
		const box = plotSvg.getBoundingClientRect();
		const frame = figure.getBoundingClientRect();
		const cx = (t.x + t.w / 2) * (box.width / W);
		const cy = (t.y + t.h / 2) * (box.height / H);
		card.style.left = `${Math.round((at?.x ?? box.left + cx) - frame.left)}px`;
		card.style.top = `${Math.round((at?.y ?? box.top + cy) - frame.top)}px`;
		card.toggleAttribute("data-flip", (at ? at.x - box.left : cx) > box.width / 2);
	};
	const hide = () => {
		current = -1;
		card.hidden = true;
		for (const tile of plotSvg.querySelectorAll(".tb-hot")) tile.classList.remove("tb-hot");
	};
	plotSvg.addEventListener("pointermove", (event) => {
		// Tiles are drawn parents first, so the topmost tile under the pointer, the event's own target, is the deepest.
		const hits = (event.composedPath() as Element[]).filter((e) => e instanceof Element && e.classList?.contains("tb-tile"));
		const tile = hits[0];
		if (tile) show(Number(tile.getAttribute("data-i")), { x: event.clientX, y: event.clientY });
		else if (event.pointerType === "mouse") hide();
	});
	plotSvg.addEventListener("pointerleave", (event) => {
		if (event.pointerType === "mouse") hide();
	});
	plotBox.addEventListener("focus", () => {
		if (current < 0 && leaves[0]) {
			current = 0;
			show(leaves[0].i);
		}
	});
	plotBox.addEventListener("blur", hide);
	plotBox.addEventListener("keydown", (event) => {
		if (event.target !== plotBox) return;
		const key = (event as KeyboardEvent).key;
		const last = leaves.length - 1;
		const next =
			key === "ArrowRight" || key === "ArrowDown" ? Math.min(last, current + 1) : key === "ArrowLeft" || key === "ArrowUp" ? Math.max(0, current - 1) : key === "Home" ? 0 : key === "End" ? last : undefined;
		if (key === "Escape") {
			hide();
			event.preventDefault();
		} else if (next !== undefined) {
			current = next;
			const leaf = leaves[next];
			if (leaf) show(leaf.i);
			event.preventDefault();
		}
	});
}
