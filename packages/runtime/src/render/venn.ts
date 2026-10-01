/**
 * The Venn diagram (#130): how two or three sets overlap, honest about what circles can draw.
 *
 *  - Two sets are exact: each circle's area is its set's size, and the distance between them is solved so
 *    the lens between them has the overlap's area.
 *  - Three sets cannot in general be drawn exactly with circles. Each pair is placed at the distance that
 *    makes its own overlap right, and the third circle as close to both as the triangle allows. Every region
 *    is labelled with its count, so the numbers carry the reading, and the caption says the areas are
 *    approximate.
 *  - More than three sets, or numbers that cannot be true (an overlap larger than a set), draw a message.
 *
 * Its own chunk, sharing the chart stylesheet and number format with the other kinds.
 */
import type { Venn } from "@toolbench/sdk";
import { el, svg } from "../dom.ts";
import type { RenderOptions } from "./index.ts";
import { adoptChartStyles, adoptStyles, format } from "./plot-common.ts";

const W = 640;
const H = 320;

const VENN_STYLES = /* css */ `
.tb-venn-circle { fill: var(--c); fill-opacity: 0.22; stroke: var(--c); stroke-width: 2; }
.tb-venn-count { fill: var(--tb-fg); font-family: var(--tb-mono); font-size: 12px; font-weight: 600; stroke: var(--tb-bg); stroke-width: 3; paint-order: stroke; pointer-events: none; }
.tb-venn-set { fill: var(--tb-muted); font-family: var(--tb-font); font-size: 12px; font-weight: 600; pointer-events: none; }
.tb-venn-message { margin: 0; padding: 0.75rem; border: 1px dashed var(--tb-border); border-radius: 8px; color: var(--tb-muted); font-size: 0.86rem; }
`;

/** The area of the lens two circles of radii r1, r2 make with their centres d apart. */
function lens(r1: number, r2: number, d: number): number {
	if (d >= r1 + r2) return 0;
	if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
	const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
	const b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
	const c = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
	return a + b - c;
}

/** The centre distance at which two circles' lens has area `target`, by bisection: lens area falls as d grows. */
function distanceFor(r1: number, r2: number, target: number): number {
	let lo = Math.abs(r1 - r2);
	let hi = r1 + r2;
	if (target <= 0) return hi;
	if (target >= Math.PI * Math.min(r1, r2) ** 2) return lo;
	for (let i = 0; i < 60; i++) {
		const mid = (lo + hi) / 2;
		if (lens(r1, r2, mid) > target) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

/** The size of the overlap of exactly these set indices, as the tool gave it, or undefined. */
function overlapOf(venn: Venn, sets: number[]): number | undefined {
	const key = [...sets].sort().join(",");
	return venn.overlaps.find((o) => [...o.sets].sort().join(",") === key)?.size;
}

interface Region {
	members: number[];
	count: number;
	name: string;
}

/** Every region, with its count of things in exactly those sets, or a reason the numbers cannot be drawn. */
function regions(venn: Venn): Region[] | string {
	const n = venn.sets.length;
	const size = (i: number) => venn.sets[i]?.size ?? 0;
	const pair = (i: number, j: number) => overlapOf(venn, [i, j]) ?? 0;
	const triple = n === 3 ? (overlapOf(venn, [0, 1, 2]) ?? 0) : 0;
	for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (pair(i, j) > Math.min(size(i), size(j))) return `the overlap of ${venn.sets[i]?.label} and ${venn.sets[j]?.label} is larger than one of them`;
	const label = (members: number[]) => {
		const inside = members.map((i) => venn.sets[i]?.label ?? "").join(" and ");
		const outside = venn.sets.map((_, i) => i).filter((i) => !members.includes(i)).map((i) => venn.sets[i]?.label ?? "");
		return outside.length > 0 ? `${inside}, not ${outside.join(" or ")}` : members.length > 1 ? `All of ${inside}` : inside;
	};
	const out: Region[] = [];
	if (n === 2) {
		out.push({ members: [0], count: size(0) - pair(0, 1), name: label([0]) });
		out.push({ members: [1], count: size(1) - pair(0, 1), name: label([1]) });
		out.push({ members: [0, 1], count: pair(0, 1), name: label([0, 1]) });
	} else {
		for (const i of [0, 1, 2]) {
			const [j, k] = [0, 1, 2].filter((x) => x !== i) as [number, number];
			out.push({ members: [i], count: size(i) - pair(i, j) - pair(i, k) + triple, name: label([i]) });
		}
		for (const [i, j] of [
			[0, 1],
			[0, 2],
			[1, 2],
		] as [number, number][]) {
			out.push({ members: [i, j], count: pair(i, j) - triple, name: label([i, j]) });
		}
		out.push({ members: [0, 1, 2], count: triple, name: label([0, 1, 2]) });
	}
	const bad = out.find((r) => r.count < 0);
	if (bad) return `the numbers give "${bad.name}" a count of ${bad.count}, which no set of things can have`;
	return out;
}

export function renderVenn(venn: Venn, options: RenderOptions = {}): HTMLElement {
	const compact = (options.cardChart ?? options.compact) === true;
	const unit = venn.unit ? ` ${venn.unit}` : "";
	const figure = el("figure", { class: compact ? "tb-out-chart tb-out-chart-card tb-venn" : "tb-out-chart tb-venn" });
	adoptChartStyles(figure);
	adoptStyles(figure, "venn", () => VENN_STYLES);
	const message = (text: string) => {
		const p = el("p", { class: "tb-venn-message" });
		p.textContent = `${venn.label}: ${text}, so it is not drawn as a Venn diagram.`;
		figure.append(p);
		return figure;
	};
	if (venn.sets.length < 2 || venn.sets.length > 3) return message(`a Venn diagram reads with two or three sets, and this has ${venn.sets.length}; a table or an upset plot says it better`);
	if (venn.sets.some((s) => !(s.size > 0))) return message("every set needs a size above zero");
	const found = regions(venn);
	if (typeof found === "string") return message(found);

	// Radii from areas, then centres: two exactly, the third by triangulation from its two pair distances.
	const radii = venn.sets.map((s) => Math.sqrt(s.size / Math.PI));
	const d01 = distanceFor(radii[0] as number, radii[1] as number, overlapOf(venn, [0, 1]) ?? 0);
	const centres: { x: number; y: number }[] = [
		{ x: 0, y: 0 },
		{ x: d01, y: 0 },
	];
	if (venn.sets.length === 3) {
		const d02 = distanceFor(radii[0] as number, radii[2] as number, overlapOf(venn, [0, 2]) ?? 0);
		const d12 = distanceFor(radii[1] as number, radii[2] as number, overlapOf(venn, [1, 2]) ?? 0);
		// Law of cosines; when the three distances cannot make a triangle, the nearest that can.
		const cos = Math.max(-1, Math.min(1, (d01 * d01 + d02 * d02 - d12 * d12) / (2 * d01 * d02 || 1)));
		centres.push({ x: d02 * cos, y: d02 * Math.sqrt(1 - cos * cos) });
	}
	// Fit everything into the picture, leaving room above for the set names.
	const minX = Math.min(...centres.map((c, i) => c.x - (radii[i] as number)));
	const maxX = Math.max(...centres.map((c, i) => c.x + (radii[i] as number)));
	const minY = Math.min(...centres.map((c, i) => c.y - (radii[i] as number)));
	const maxY = Math.max(...centres.map((c, i) => c.y + (radii[i] as number)));
	const scale = Math.min((W - 240) / (maxX - minX), (H - 70) / (maxY - minY));
	const ox = (W - (maxX - minX) * scale) / 2 - minX * scale;
	const oy = 35 + (H - 70 - (maxY - minY) * scale) / 2 - minY * scale;
	const circles = centres.map((c, i) => ({ x: ox + c.x * scale, y: oy + c.y * scale, r: (radii[i] as number) * scale }));
	const inside = (x: number, y: number) => circles.map((c, i) => ((x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r ? i : -1)).filter((i) => i >= 0);

	/*
	 * Where to label each region: the middle of the grid points that fall in exactly that region. Sampling is
	 * crude and always lands inside the region, which a formula for three-circle centroids would not promise.
	 */
	const sums = found.map(() => ({ x: 0, y: 0, n: 0 }));
	for (let gx = 0; gx < W; gx += 4) {
		for (let gy = 0; gy < H; gy += 4) {
			const key = inside(gx, gy).join(",");
			const r = found.findIndex((f) => f.members.join(",") === key);
			const sum = sums[r];
			if (sum) {
				sum.x += gx;
				sum.y += gy;
				sum.n += 1;
			}
		}
	}

	const marks: SVGElement[] = [];
	circles.forEach((c, i) => marks.push(svg("circle", { class: `tb-venn-circle tb-s${i + 1}`, cx: c.x, cy: c.y, r: c.r })));
	found.forEach((region, r) => {
		const sum = sums[r];
		if (!sum || sum.n === 0) return;
		marks.push(svg("text", { class: "tb-venn-count", x: sum.x / sum.n, y: sum.y / sum.n + 4, "text-anchor": "middle" }, format(region.count)));
	});
	/*
	 * Each set's name goes outside the diagram, on the line from the middle of all the centres through its own
	 * circle's centre. Above each circle, where the first version put them, buries a name inside the others
	 * whenever a circle sits below them.
	 */
	const mid = { x: circles.reduce((a, c) => a + c.x, 0) / circles.length, y: circles.reduce((a, c) => a + c.y, 0) / circles.length };
	venn.sets.forEach((set, i) => {
		const c = circles[i];
		if (!c) return;
		let dx = c.x - mid.x;
		let dy = c.y - mid.y;
		const len = Math.hypot(dx, dy);
		if (len < 1e-6) [dx, dy] = [0, -1];
		else [dx, dy] = [dx / len, dy / len];
		const x = c.x + dx * (c.r + 14);
		const y = c.y + dy * (c.r + 14) + 4;
		const anchor = Math.abs(dx) < 0.35 ? "middle" : dx > 0 ? "start" : "end";
		marks.push(svg("text", { class: "tb-venn-set", x, y: Math.min(H - 4, Math.max(14, y)), "text-anchor": anchor }, `${set.label} (${format(set.size)})`));
	});

	const approximate = venn.sets.length === 3;
	const description = `${venn.label}: ${found.map((f) => `${f.name} ${format(f.count)}`).join(", ")}`;
	const picture = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": description, preserveAspectRatio: "xMidYMid meet" }, ...marks) as SVGSVGElement;
	const head = el("tr", {}, el("th", { scope: "col" }, "Region"), el("th", { scope: "col" }, `Count${unit ? ` (${unit.trim()})` : ""}`));
	const rows = found.map((f) => {
		const name = el("th", { scope: "row" });
		name.textContent = f.name;
		return el("tr", {}, name, el("td", {}, format(f.count)));
	});
	const caption = approximate ? `${venn.label}. Three circles cannot in general show every overlap exactly, so the areas are approximate; the counts are exact.` : venn.label;
	figure.append(
		el("div", { class: "tb-plot" }, picture),
		el("details", { class: "tb-chart-data" }, el("summary", {}, "Show the data as a table"), el("table", {}, el("caption", {}, caption), el("thead", {}, head), el("tbody", {}, ...rows))),
	);
	attachRegionReadout(figure, picture, venn, found, inside, sums, unit);
	return figure;
}

/** The readout names the region under the pointer, and the keyboard steps through every region. */
function attachRegionReadout(
	figure: HTMLElement,
	plotSvg: SVGSVGElement,
	venn: Venn,
	found: Region[],
	inside: (x: number, y: number) => number[],
	sums: { x: number; y: number; n: number }[],
	unit: string,
): void {
	const card = el("div", { class: "tb-readout", hidden: true, "aria-hidden": "true" });
	const live = el("p", { class: "tb-sr", role: "status", "aria-live": "polite" });
	figure.append(card, live);
	const plotBox = plotSvg.parentElement as HTMLElement;
	plotBox.setAttribute("tabindex", "0");
	plotBox.setAttribute("role", "group");
	plotBox.setAttribute("aria-roledescription", "Venn diagram");
	plotBox.setAttribute("aria-label", `${venn.label}. Arrow keys read each region.`);
	let current = -1;
	const show = (r: number, at?: { x: number; y: number }) => {
		const region = found[r];
		if (!region) return;
		current = r;
		const heading = el("p", { class: "tb-readout-title" });
		heading.textContent = region.name;
		const strong = el("strong", {});
		strong.textContent = `${format(region.count)}${unit}`;
		card.replaceChildren(heading, el("ul", { class: "tb-readout-rows" }, el("li", {}, strong)));
		card.hidden = false;
		live.textContent = `${region.name}: ${format(region.count)}${unit}`;
		const box = plotSvg.getBoundingClientRect();
		const frame = figure.getBoundingClientRect();
		const sum = sums[r];
		const k = box.width / W;
		const x = at?.x ?? box.left + ((sum?.x ?? 0) / Math.max(1, sum?.n ?? 1)) * k;
		const y = at?.y ?? box.top + ((sum?.y ?? 0) / Math.max(1, sum?.n ?? 1)) * k;
		card.style.left = `${Math.round(x - frame.left)}px`;
		card.style.top = `${Math.round(y - frame.top)}px`;
		card.toggleAttribute("data-flip", x - box.left > box.width / 2);
	};
	const hide = () => {
		current = -1;
		card.hidden = true;
	};
	plotSvg.addEventListener("pointermove", (event) => {
		const box = plotSvg.getBoundingClientRect();
		const k = box.width / W;
		const key = inside((event.clientX - box.left) / k, (event.clientY - box.top) / k).join(",");
		const r = found.findIndex((f) => f.members.join(",") === key);
		if (r >= 0) show(r, { x: event.clientX, y: event.clientY });
		else if (event.pointerType === "mouse") hide();
	});
	plotSvg.addEventListener("pointerleave", (event) => {
		if (event.pointerType === "mouse") hide();
	});
	plotBox.addEventListener("focus", () => {
		if (current < 0) show(0);
	});
	plotBox.addEventListener("blur", hide);
	plotBox.addEventListener("keydown", (event) => {
		if (event.target !== plotBox) return;
		const key = (event as KeyboardEvent).key;
		const last = found.length - 1;
		const next =
			key === "ArrowRight" || key === "ArrowDown" ? Math.min(last, current + 1) : key === "ArrowLeft" || key === "ArrowUp" ? Math.max(0, current - 1) : key === "Home" ? 0 : key === "End" ? last : undefined;
		if (key === "Escape") {
			hide();
			event.preventDefault();
		} else if (next !== undefined) {
			show(next);
			event.preventDefault();
		}
	});
}
