/**
 * The chart renderer: an inline SVG line/area/bar chart with axes, a legend, annotations — and a
 * table.
 *
 * ⚠️ **The table is not optional.** A chart is an image of numbers; a screen reader gets nothing from
 * it, and neither does a text-only crawler. So every chart ships the same data as a visually-hidden
 * `<table>`, built from the same `Series[]`. It costs a dozen lines and it is the difference between
 * a chart being information and being decoration.
 *
 * Deliberately not a charting library. A library would be 40–200 KB for axis ticks and a tooltip,
 * and it would decide the look of every tool. This draws what the `Chart` type describes and stops.
 */
import type { Chart, Series } from "@toolbench/sdk";
import { el, svg } from "../dom.ts";
import type { RenderOptions } from "./index.ts";

const W = 640;
const H = 300;
/** `right` grows when a second axis needs room for its labels — otherwise they clip at the edge. */
const PAD = { top: 18, right: 20, rightWithAxis: 58, bottom: 44, left: 56 };

export function renderChart(chart: Chart, options: RenderOptions = {}): HTMLElement {
	const compact = options.compact === true;
	const left = chart.series.filter((s) => (s.axis ?? "left") === "left");
	const right = chart.series.filter((s) => s.axis === "right");
	const plot = {
		x: PAD.left,
		y: PAD.top,
		w: W - PAD.left - (right.length > 0 ? PAD.rightWithAxis : PAD.right),
		h: (compact ? 150 : H) - PAD.top - PAD.bottom,
	};

	const leftScale = scaleFor(left);
	const rightScale = right.length > 0 ? scaleFor(right) : undefined;
	const xScale = { min: Math.min(...chart.x), max: Math.max(...chart.x) };

	const px = (value: number) => plot.x + ((value - xScale.min) / span(xScale)) * plot.w;
	const py = (value: number, scale: Scale) => plot.y + plot.h - ((value - scale.min) / span(scale)) * plot.h;

	const marks: SVGElement[] = [];

	// Gridlines and y labels, from the left scale — a second axis gets ticks but not its own grid.
	const leftTicks = ticks(leftScale);
	const axisFormat = formatterFor(leftTicks);
	for (const tick of leftTicks) {
		const y = py(tick, leftScale);
		marks.push(svg("line", { class: "tb-grid", x1: plot.x, x2: plot.x + plot.w, y1: y, y2: y }));
		marks.push(svg("text", { class: "tb-tick", x: plot.x - 8, y: y + 4, "text-anchor": "end" }, axisFormat(tick)));
	}
	const xTicks = ticks(xScale, 5);
	const xFormat = formatterFor(xTicks);
	for (const tick of xTicks) {
		marks.push(svg("text", { class: "tb-tick", x: px(tick), y: plot.y + plot.h + 20, "text-anchor": "middle" }, xFormat(tick)));
	}
	if (rightScale) {
		const rightTicks = ticks(rightScale);
		const rightFormat = formatterFor(rightTicks);
		for (const tick of rightTicks) {
			marks.push(
				svg("text", { class: "tb-tick", x: plot.x + plot.w + 8, y: py(tick, rightScale) + 4, "text-anchor": "start" }, rightFormat(tick)),
			);
		}
	}

	// Annotations sit under the data: they are context, not the subject.
	for (const annotation of chart.annotations ?? []) {
		const x = px(annotation.x);
		marks.push(svg("line", { class: "tb-annotation", x1: x, x2: x, y1: plot.y, y2: plot.y + plot.h }));
		if (!compact) {
			// Flip the label inward near the right edge, or it runs off the chart — which is exactly
			// where "you are here" lands when a system is nearly saturated.
			const nearRight = x > plot.x + plot.w * 0.62;
			marks.push(
				svg(
					"text",
					{ class: "tb-annotation-label", x: nearRight ? x - 5 : x + 5, y: plot.y + 11, "text-anchor": nearRight ? "end" : "start" },
					annotation.label,
				),
			);
		}
	}

	chart.series.forEach((series, index) => {
		const scale = series.axis === "right" && rightScale ? rightScale : leftScale;
		marks.push(...drawSeries(series, index, chart.x, px, (v) => py(v, scale), plot));
	});

	// Axis lines last, so they sit above the gridlines.
	marks.push(svg("line", { class: "tb-axis", x1: plot.x, x2: plot.x, y1: plot.y, y2: plot.y + plot.h }));
	marks.push(svg("line", { class: "tb-axis", x1: plot.x, x2: plot.x + plot.w, y1: plot.y + plot.h, y2: plot.y + plot.h }));

	const axisLabels = compact
		? []
		: [
				svg("text", { class: "tb-axis-label", x: plot.x + plot.w / 2, y: (compact ? 150 : H) - 6, "text-anchor": "middle" }, withUnit(chart.xLabel, chart.xUnit)),
				svg(
					"text",
					{ class: "tb-axis-label", x: 12, y: plot.y + plot.h / 2, "text-anchor": "middle", transform: `rotate(-90 12 ${plot.y + plot.h / 2})` },
					withUnit(chart.yLabel, chart.yUnit),
				),
			];

	const figure = el("figure", { class: "tb-out-chart" });
	figure.append(
		svg(
			"svg",
			{
				viewBox: `0 0 ${W} ${compact ? 150 : H}`,
				role: "img",
				"aria-label": describe(chart),
				preserveAspectRatio: "none",
			},
			...marks,
			...axisLabels,
		),
	);
	/*
	 * ⚠️ The legend stays in compact mode, and only the axis titles go.
	 *
	 * Compact used to drop both, which is fine for one series and wrong for two: a card showing a chance of
	 * waiting and a mean wait as two coloured lines with no key is decoration, and a reader cannot tell
	 * which line is which or in what unit. The legend carries the label and the unit together, so it says
	 * more per pixel than either axis title. It costs one line of text.
	 */
	if (chart.series.length > 1) figure.append(legend(chart.series));
	// The same numbers, for anyone or anything that cannot see the picture.
	figure.append(dataTable(chart));
	return figure;
}

interface Scale {
	min: number;
	max: number;
}

const span = (scale: Scale) => (scale.max - scale.min === 0 ? 1 : scale.max - scale.min);

function scaleFor(series: Series[]): Scale {
	const values = series.flatMap((s) => s.points.filter((p): p is number => p !== null));
	if (values.length === 0) return { min: 0, max: 1 };
	const min = Math.min(...values);
	const max = Math.max(...values);
	if (min === max) return { min: min - 1, max: max + 1 };
	// Include zero when the data is close to it: a bar chart floating above zero misleads.
	const lo = min > 0 && min < (max - min) * 0.5 ? 0 : min;
	return { min: lo, max };
}

function ticks(scale: Scale, count = 4): number[] {
	const step = span(scale) / count;
	return Array.from({ length: count + 1 }, (_, i) => scale.min + step * i);
}

function drawSeries(
	series: Series,
	index: number,
	xs: number[],
	px: (v: number) => number,
	py: (v: number) => number,
	plot: { x: number; y: number; w: number; h: number },
): SVGElement[] {
	const cls = `tb-s${(index % 6) + 1}`;
	const shape = series.shape ?? "line";

	if (shape === "bar") {
		const width = Math.max(1, (plot.w / Math.max(1, xs.length)) * 0.7);
		return series.points.flatMap((point, i) => {
			const x = xs[i];
			if (point === null || x === undefined) return [];
			const y = py(point);
			return [
				svg("rect", {
					class: `tb-bar ${cls}`,
					x: px(x) - width / 2,
					y,
					width,
					height: Math.max(0, plot.y + plot.h - y),
				}),
			];
		});
	}

	/*
	 * `null` breaks the line rather than drawing through it. A gap in a measurement is information,
	 * and a chart that interpolates across it is quietly lying.
	 */
	const segments: string[] = [];
	let current: string[] = [];
	series.points.forEach((point, i) => {
		const x = xs[i];
		if (point === null || x === undefined) {
			if (current.length > 1) segments.push(current.join(" "));
			current = [];
			return;
		}
		current.push(`${current.length === 0 ? "M" : "L"}${px(x).toFixed(2)},${py(point).toFixed(2)}`);
	});
	if (current.length > 1) segments.push(current.join(" "));

	const marks: SVGElement[] = [];
	if (shape === "area" && segments.length > 0) {
		const first = xs[0];
		const last = xs[xs.length - 1];
		if (first !== undefined && last !== undefined) {
			marks.push(
				svg("path", {
					class: `tb-area ${cls}`,
					d: `${segments[0]} L${px(last).toFixed(2)},${(plot.y + plot.h).toFixed(2)} L${px(first).toFixed(2)},${(plot.y + plot.h).toFixed(2)} Z`,
				}),
			);
		}
	}
	for (const d of segments) marks.push(svg("path", { class: `tb-line ${cls}`, d }));
	return marks;
}

function legend(series: Series[]): HTMLElement {
	return el(
		"ul",
		{ class: "tb-legend" },
		...series.map((s, i) =>
			el(
				"li",
				{},
				el("span", { class: `tb-swatch tb-s${(i % 6) + 1}`, "aria-hidden": "true" }),
				withUnit(s.label, s.unit),
			),
		),
	);
}

function dataTable(chart: Chart): HTMLElement {
	const head = el(
		"tr",
		{},
		el("th", { scope: "col" }, withUnit(chart.xLabel, chart.xUnit)),
		...chart.series.map((s) => el("th", { scope: "col" }, withUnit(s.label, s.unit))),
	);
	const rows = chart.x.map((x, i) =>
		el(
			"tr",
			{},
			el("th", { scope: "row" }, format(x)),
			...chart.series.map((s) => {
				const point = s.points[i];
				return el("td", {}, point === null || point === undefined ? "—" : format(point));
			}),
		),
	);
	return el(
		"details",
		{ class: "tb-chart-data" },
		el("summary", {}, "Show the data as a table"),
		el("table", {}, el("caption", {}, describe(chart)), el("thead", {}, head), el("tbody", {}, ...rows)),
	);
}

function describe(chart: Chart): string {
	const names = chart.series.map((s) => s.label).join(", ");
	return `${withUnit(chart.yLabel, chart.yUnit)} against ${withUnit(chart.xLabel, chart.xUnit)}: ${names}`;
}

const withUnit = (label: string, unit?: string) => (unit ? `${label} (${unit})` : label);

/**
 * One formatter per axis, chosen from the tick spacing.
 *
 * Formatting each value independently gave an axis reading "20, 15, 10, 5.00, 0" — the same quantity
 * written three ways. The number of decimals is a property of the axis, not of the value.
 */
function formatterFor(values: number[]): (value: number) => string {
	const finite = values.filter((v) => Number.isFinite(v));
	const step = finite.length > 1 ? Math.abs((finite[1] as number) - (finite[0] as number)) : Math.abs(finite[0] ?? 1);
	const digits = step >= 10 ? 0 : step >= 1 ? 1 : step >= 0.1 ? 2 : 3;
	return (value) => {
		if (!Number.isFinite(value)) return "—";
		if (Math.abs(value) >= 10000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
		return value.toFixed(digits);
	};
}

function format(value: number): string {
	if (!Number.isFinite(value)) return "—";
	const abs = Math.abs(value);
	if (abs >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
	if (abs >= 10) return value.toFixed(abs % 1 === 0 ? 0 : 1);
	if (abs >= 1) return value.toFixed(2);
	if (abs === 0) return "0";
	return value.toPrecision(2);
}
