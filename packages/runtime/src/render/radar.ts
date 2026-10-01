/**
 * The radar chart (#128): a profile across several measures, one spoke each, every series a closed shape.
 *
 * Radar charts are easy to misread, so the drawing keeps to what reads: every spoke starts at zero, on one
 * shared scale unless an axis gives its own `max`; rings are labelled on the first spoke; fills are light so
 * overlapping shapes stay readable; every vertex carries a marker; at most four series are drawn. A `null`
 * breaks a shape at its spoke rather than pulling it to the centre, which would claim a value of zero.
 *
 * Its own chunk, sharing the chart stylesheet and number format with the other kinds.
 */
import type { Radar } from "@toolbench/sdk";
import { el, svg } from "../dom.ts";
import type { RenderOptions } from "./index.ts";
import { adoptChartStyles, adoptStyles, format } from "./plot-common.ts";

const W = 640;
const H = 340;
const MAX_SERIES = 4;

const RADAR_STYLES = /* css */ `
.tb-radar-shape { fill: var(--c); fill-opacity: 0.12; stroke: none; }
.tb-radar-line { fill: none; stroke: var(--c); stroke-width: 2; stroke-linejoin: round; }
.tb-radar-dot { fill: var(--tb-bg); stroke: var(--c); stroke-width: 1.75; }
.tb-radar-dot.tb-hot { stroke-width: 3; }
.tb-radar-ring, .tb-radar-spoke { fill: none; stroke: var(--tb-border); stroke-width: 1; }
.tb-radar-spoke.tb-hot { stroke: var(--tb-muted); stroke-dasharray: 3 3; }
.tb-radar-axis { fill: var(--tb-muted); font-family: var(--tb-font); font-size: 11px; }
.tb-radar-ring-label { fill: var(--tb-faint); font-family: var(--tb-mono); font-size: 10px; stroke: var(--tb-bg); stroke-width: 3; paint-order: stroke; }
`;

/** A "nice" ceiling for the shared scale: 1, 2 or 5 times a power of ten at or above the largest value. */
function ceiling(max: number): number {
	if (max <= 0) return 1;
	const power = 10 ** Math.floor(Math.log10(max));
	return ([1, 2, 5, 10].find((m) => m * power >= max) ?? 10) * power;
}

export function renderRadar(radar: Radar, options: RenderOptions = {}): HTMLElement {
	const compact = (options.cardChart ?? options.compact) === true;
	const unit = radar.unit ? ` ${radar.unit}` : "";
	const series = radar.series.slice(0, MAX_SERIES);
	const left = radar.series.length - series.length;
	const n = Math.max(3, radar.axes.length);
	const cx = 220;
	const cy = H / 2;
	const R = 120;
	const values = series.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v)));
	const shared = ceiling(Math.max(0, ...values));
	const ownScales = radar.axes.some((a) => a.max !== undefined);
	const maxOf = (k: number) => radar.axes[k]?.max ?? shared;
	const angle = (k: number) => -Math.PI / 2 + (k * 2 * Math.PI) / n;
	const at = (k: number, v: number) => {
		const r = (Math.max(0, Math.min(v, maxOf(k))) / maxOf(k)) * R;
		return { x: cx + r * Math.cos(angle(k)), y: cy + r * Math.sin(angle(k)) };
	};

	const marks: SVGElement[] = [];
	const onTop: SVGElement[] = [];
	/*
	 * Rings on round values: five steps when a fifth of the scale is a round number (10 gives 2, 4 ... 10),
	 * four otherwise (20 gives 5, 10, 15, 20). Labelled on the first spoke, over the shapes with a halo; as
	 * a percent of each axis's own max when the axes have their own.
	 */
	const fifth = shared / 5;
	const roundFifth = [1, 2, 5].some((m) => Math.abs(fifth / 10 ** Math.floor(Math.log10(fifth)) - m) < 1e-9);
	const steps = ownScales ? 4 : roundFifth ? 5 : 4;
	for (let i = 1; i <= steps; i++) {
		const f = i / steps;
		const ring = radar.axes.map((_, k) => {
			const r = f * R;
			return `${(cx + r * Math.cos(angle(k))).toFixed(2)},${(cy + r * Math.sin(angle(k))).toFixed(2)}`;
		});
		marks.push(svg("polygon", { class: "tb-radar-ring", points: ring.join(" ") }));
		onTop.push(svg("text", { class: "tb-radar-ring-label", x: cx + 4, y: cy - f * R + 11, "text-anchor": "start" }, ownScales ? `${f * 100}%` : format(f * shared)));
	}
	radar.axes.forEach((axis, k) => {
		const end = { x: cx + R * Math.cos(angle(k)), y: cy + R * Math.sin(angle(k)) };
		marks.push(svg("line", { class: "tb-radar-spoke", "data-k": k, x1: cx, y1: cy, x2: end.x, y2: end.y }));
		const lx = cx + (R + 14) * Math.cos(angle(k));
		const ly = cy + (R + 14) * Math.sin(angle(k)) + 4;
		const anchor = Math.abs(Math.cos(angle(k))) < 0.2 ? "middle" : Math.cos(angle(k)) > 0 ? "start" : "end";
		marks.push(svg("text", { class: "tb-radar-axis", x: lx, y: ly, "text-anchor": anchor }, axis.max !== undefined ? `${axis.label} (of ${format(axis.max)})` : axis.label));
	});

	series.forEach((s, i) => {
		const cls = `tb-s${(i % 6) + 1}`;
		const points = radar.axes.map((_, k) => {
			const v = s.values[k];
			return v === null || v === undefined || !Number.isFinite(v) ? null : at(k, v);
		});
		const whole = points.every((p) => p !== null);
		if (whole) {
			marks.push(svg("polygon", { class: `tb-radar-shape ${cls}`, points: (points as { x: number; y: number }[]).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") }));
		}
		// The outline, broken at a null: each run of present values, closing back to the start only when whole.
		const runs: string[] = [];
		let run: string[] = [];
		const order = whole ? [...points, points[0]] : points;
		for (const p of order) {
			if (p === null || p === undefined) {
				if (run.length > 1) runs.push(run.join(" "));
				run = [];
				continue;
			}
			run.push(`${run.length === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`);
		}
		if (run.length > 1) runs.push(run.join(" "));
		for (const d of runs) marks.push(svg("path", { class: `tb-radar-line ${cls}`, d }));
		points.forEach((p, k) => {
			if (p) marks.push(svg("circle", { class: `tb-radar-dot ${cls}`, "data-k": k, cx: p.x, cy: p.y, r: 3.5 }));
		});
	});

	marks.push(...onTop);
	const description = `${radar.label}: ${series.map((s) => s.label).join(", ")} across ${radar.axes.map((a) => a.label).join(", ")}`;
	const figure = el("figure", { class: compact ? "tb-out-chart tb-out-chart-card tb-radar" : "tb-out-chart tb-radar" });
	const picture = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": description, preserveAspectRatio: "xMidYMid meet" }, ...marks) as SVGSVGElement;
	const legend = el(
		"ul",
		{ class: "tb-legend" },
		...series.map((s, i) => {
			const name = el("span", {});
			name.textContent = radar.unit ? `${s.label} (${radar.unit})` : s.label;
			return el("li", {}, el("span", { class: `tb-swatch-marker tb-s${(i % 6) + 1}`, "data-marker": "0", "aria-hidden": "true" }), name);
		}),
	);
	figure.append(el("div", { class: "tb-plot" }, picture), legend, table(radar, series, unit, left > 0 ? `${left} series not drawn: more than ${MAX_SERIES} overlap past reading` : undefined));
	attachSpokeReadout(figure, picture, radar, series, unit, { cx, cy, n, angle });
	adoptChartStyles(figure);
	adoptStyles(figure, "radar", () => RADAR_STYLES);
	return figure;
}

function table(radar: Radar, series: Radar["series"], unit: string, note: string | undefined): HTMLElement {
	const head = el("tr", {}, el("th", { scope: "col" }, "Axis"), ...series.map((s) => el("th", { scope: "col" }, unit ? `${s.label} (${unit.trim()})` : s.label)));
	const rows = radar.axes.map((axis, k) =>
		el("tr", { "data-i": k }, el("th", { scope: "row" }, axis.label), ...series.map((s) => el("td", {}, s.values[k] === null || s.values[k] === undefined ? "—" : format(s.values[k] as number)))),
	);
	return el(
		"details",
		{ class: "tb-chart-data" },
		el("summary", {}, "Show the data as a table"),
		el("table", {}, el("caption", {}, note ? `${radar.label}. ${note}.` : radar.label), el("thead", {}, head), el("tbody", {}, ...rows)),
	);
}

/** The readout steps spoke by spoke, listing every series there; the pointer picks the spoke nearest its angle. */
function attachSpokeReadout(
	figure: HTMLElement,
	plotSvg: SVGSVGElement,
	radar: Radar,
	series: Radar["series"],
	unit: string,
	g: { cx: number; cy: number; n: number; angle: (k: number) => number },
): void {
	const card = el("div", { class: "tb-readout", hidden: true, "aria-hidden": "true" });
	const live = el("p", { class: "tb-sr", role: "status", "aria-live": "polite" });
	figure.append(card, live);
	const plotBox = plotSvg.parentElement as HTMLElement;
	plotBox.setAttribute("tabindex", "0");
	plotBox.setAttribute("role", "group");
	plotBox.setAttribute("aria-roledescription", "radar chart");
	plotBox.setAttribute("aria-label", `${radar.label}. Arrow keys read each axis.`);
	let current = -1;
	const show = (k: number) => {
		const axis = radar.axes[k];
		if (!axis) return;
		current = k;
		for (const mark of plotSvg.querySelectorAll("[data-k]")) mark.classList.toggle("tb-hot", Number(mark.getAttribute("data-k")) === k);
		const heading = el("p", { class: "tb-readout-title" });
		heading.textContent = axis.label;
		const spoken: string[] = [];
		const list = el(
			"ul",
			{ class: "tb-readout-rows" },
			...series.map((s, i) => {
				const v = s.values[k];
				const text = v === null || v === undefined ? "no value" : `${format(v)}${unit}`;
				spoken.push(`${s.label} ${text}`);
				const strong = el("strong", {});
				strong.textContent = text;
				const name = el("span", {});
				name.textContent = s.label;
				return el("li", {}, el("span", { class: `tb-swatch-marker tb-s${(i % 6) + 1}`, "data-marker": "0", "aria-hidden": "true" }), strong, name);
			}),
		);
		card.replaceChildren(heading, list);
		card.hidden = false;
		live.textContent = `${axis.label}: ${spoken.join(", ")}`;
		const box = plotSvg.getBoundingClientRect();
		const frame = figure.getBoundingClientRect();
		const scale = box.width / W;
		const px = g.cx + 130 * Math.cos(g.angle(k));
		const py = g.cy + 130 * Math.sin(g.angle(k));
		card.style.left = `${Math.round(box.left - frame.left + px * scale)}px`;
		card.style.top = `${Math.round(box.top - frame.top + py * scale)}px`;
		card.toggleAttribute("data-flip", Math.cos(g.angle(k)) < -0.2);
	};
	const hide = () => {
		current = -1;
		card.hidden = true;
		for (const mark of plotSvg.querySelectorAll(".tb-hot")) mark.classList.remove("tb-hot");
	};
	plotSvg.addEventListener("pointermove", (event) => {
		const box = plotSvg.getBoundingClientRect();
		const scale = box.width / W;
		const x = (event.clientX - box.left) / scale - g.cx;
		const y = (event.clientY - box.top) / scale - g.cy;
		if (Math.hypot(x, y) > 150) {
			if (event.pointerType === "mouse") hide();
			return;
		}
		// The spoke nearest the pointer's angle, measured clockwise from 12 o'clock as the spokes are.
		const turn = (Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
		show(Math.round(turn / ((2 * Math.PI) / g.n)) % g.n);
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
		const next =
			key === "ArrowRight" || key === "ArrowDown"
				? (current + 1) % radar.axes.length
				: key === "ArrowLeft" || key === "ArrowUp"
					? (current - 1 + radar.axes.length) % radar.axes.length
					: key === "Home"
						? 0
						: key === "End"
							? radar.axes.length - 1
							: undefined;
		if (key === "Escape") {
			hide();
			event.preventDefault();
		} else if (next !== undefined) {
			show(next);
			event.preventDefault();
		}
	});
}
