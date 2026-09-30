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

/**
 * A chart, and the same chart whether it is on a card or a page.
 *
 * ⚠️ There used to be a "compact" chart: half the height, no axis titles, no annotation labels. It was a
 * bad trade in every direction. The plot area dropped from 238 units to 88, which squashes a curve that
 * falls from 74% to nothing into an unreadable band; the axis titles are the only thing saying what the
 * numbers are; and the annotation label is the "you are here" that gives the picture a point.
 *
 * None of it was needed, because the geometry is a viewBox scaled to the available width. A chart on a
 * narrow card is already smaller than one on a page, proportionally, with its aspect ratio intact. Halving
 * the height on top of that was solving a problem the SVG had already solved, and charging three
 * legibility failures for it.
 *
 * What compact still changes is the SIZE, and only the size: the same drawing, capped narrower so a card
 * does not hand most of a landing page to one chart. Capping the width and letting the height follow the
 * viewBox is what keeps the aspect ratio, which is the part that was broken before.
 */
export function renderChart(chart: Chart, options: RenderOptions = {}): HTMLElement {
	const compact = (options.cardChart ?? options.compact) === true;
	const left = chart.series.filter((s) => (s.axis ?? "left") === "left");
	const right = chart.series.filter((s) => s.axis === "right");
	const plot = {
		x: PAD.left,
		y: PAD.top,
		w: W - PAD.left - (right.length > 0 ? PAD.rightWithAxis : PAD.right),
		h: H - PAD.top - PAD.bottom,
	};

	const leftScale = niceScale(scaleFor(left));
	const rightScale = right.length > 0 ? niceScale(scaleFor(right)) : undefined;
	/*
	 * ⚠️ A bar chart needs half a slot of padding at each end, and without it the first bar is drawn
	 * across the y axis.
	 *
	 * Bars are centred on their x position (`px(x) - width / 2` in `drawSeries`), and an unpadded domain
	 * maps the first x to exactly `plot.x`. So half of the first bar lands left of the axis and half of
	 * the last one hangs off the right edge. It is visible rather than clipped because the stylesheet sets
	 * `overflow: visible` on the svg, which it needs for labels.
	 *
	 * A histogram makes it unmissable, since its x values are bin CENTRES rather than edges: the first
	 * centre is `min + binWidth / 2` and it still landed on the axis. Reported against the histogram tool,
	 * but it is the renderer: any `bar` series had it.
	 *
	 * Padding by half the spacing between positions makes each bar's slot exactly `plot.w / n`, so bars
	 * sit inside their own share of the plot. Line and area series keep the tight domain, because a line
	 * genuinely starts at its first point and padding it would put a gap before the data.
	 */
	const xMin = Math.min(...chart.x);
	const xMax = Math.max(...chart.x);
	const bars = chart.series.some((series) => series.shape === "bar");
	// One bar has no spacing to measure, so fall back to its own magnitude, and to 1 for a bar at zero.
	const slot = chart.x.length > 1 ? (xMax - xMin) / (chart.x.length - 1) : Math.abs(xMax) || 1;
	const xScale = bars ? { min: xMin - slot / 2, max: xMax + slot / 2 } : { min: xMin, max: xMax };

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
	const xTicks = xTicksFor(chart.x, xScale, bars);
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

	/*
	 * ⚠️ Bar series share a slot, so each needs its own place in it. Drawn at the full slot width, a second
	 * bar series lands exactly on top of the first, and at the bars' opacity the two blend into a colour the
	 * legend does not show: violet over teal read as a light cyan in the dark theme. Splitting the slot
	 * puts series i of k in the i-th of k sub-slots.
	 */
	const barSeries = chart.series.filter((series) => series.shape === "bar");
	chart.series.forEach((series, index) => {
		const scale = series.axis === "right" && rightScale ? rightScale : leftScale;
		const group = { index: barSeries.indexOf(series), count: barSeries.length };
		marks.push(...drawSeries(series, index, chart.x, px, (v) => py(v, scale), plot, group, py(clamp(0, scale), scale)));
	});

	// Axis lines last, so they sit above the gridlines.
	marks.push(svg("line", { class: "tb-axis", x1: plot.x, x2: plot.x, y1: plot.y, y2: plot.y + plot.h }));
	marks.push(svg("line", { class: "tb-axis", x1: plot.x, x2: plot.x + plot.w, y1: plot.y + plot.h, y2: plot.y + plot.h }));

	const axisLabels = [
		svg("text", { class: "tb-axis-label", x: plot.x + plot.w / 2, y: H - 6, "text-anchor": "middle" }, withUnit(chart.xLabel, chart.xUnit)),
		svg(
			"text",
			{ class: "tb-axis-label", x: 12, y: plot.y + plot.h / 2, "text-anchor": "middle", transform: `rotate(-90 12 ${plot.y + plot.h / 2})` },
			withUnit(chart.yLabel, chart.yUnit),
		),
	];

	const figure = el("figure", { class: compact ? "tb-out-chart tb-out-chart-card" : "tb-out-chart" });
	figure.append(
		svg(
			"svg",
			{
				viewBox: `0 0 ${W} ${H}`,
				role: "img",
				"aria-label": describe(chart),
				preserveAspectRatio: "none",
			},
			...marks,
			...axisLabels,
		),
	);
	// Two coloured lines with no key is decoration: a reader cannot tell which is which or in what unit.
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
	/*
	 * ⚠️ A flat series must not be padded across zero. This used to return `min - 1 .. max + 1`, so a series
	 * of zeros got an axis from -1 to 1, and every zero was drawn as a bar from the middle of the plot down
	 * to the floor: a row of solid bars reading as negative values, for data that was all zero.
	 */
	if (min === max) {
		if (min === 0) return { min: 0, max: 1 };
		return min > 0 ? { min: 0, max } : { min, max: 0 };
	}
	// Include zero when the data is close to it: a bar chart floating above zero misleads.
	const lo = min > 0 && min < (max - min) * 0.5 ? 0 : min;
	return { min: lo, max };
}

/**
 * A step a reader can count in: 1, 2 or 5 times a power of ten, the smallest that fits `count` intervals.
 *
 * Dividing the range into equal parts gave axes reading 0, 118, 235, 353, 470 for data from 50 to 470,
 * and frame numbers of 4.8 and 12.4. A reader reads values off a chart by the gridlines, and those are
 * gridlines nobody can read a value off.
 */
function niceStep(range: number, count: number): number {
	const raw = range / count;
	const power = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 5, 10].find((m) => m * power >= raw - 1e-9) ?? 10;
	return step * power;
}

/** Widen a scale to whole steps, so the top and bottom gridlines are tick values rather than the data's extremes. */
function niceScale(scale: Scale, count = 5): Scale {
	const step = niceStep(span(scale), count);
	return { min: Math.floor(scale.min / step + 1e-9) * step, max: Math.ceil(scale.max / step - 1e-9) * step };
}

function ticks(scale: Scale, count = 5): number[] {
	const step = niceStep(span(scale), count);
	const first = Math.ceil(scale.min / step - 1e-9) * step;
	const out: number[] = [];
	for (let value = first; value <= scale.max + step * 1e-9; value += step) out.push(Number(value.toPrecision(12)));
	return out;
}

/**
 * The x ticks. The x domain is not widened like the y scale: a line genuinely starts at its first point,
 * and a bar chart's domain is already padded by half a slot.
 *
 * ⚠️ When every x is a whole number, so is every tick. Frame 4.8 does not exist, and neither does the
 * padded edge of a bar chart at 0.5: ticks there label the space between bars rather than any bar.
 *
 * ⚠️ A bar chart's ticks sit on bars. Its x values are categories (bins, frames), so a tick between two
 * of them names nothing: a histogram with bins centred on 3, 5, 7 ... read "5, 10, 15", and 10 is the gap
 * between two bars. The step is therefore a whole multiple of the bars' own spacing, and the ticks are
 * data positions, at round values where there are any.
 */
function xTicksFor(xs: number[], scale: Scale, bars: boolean): number[] {
	if (xs.length === 0) return [];
	const lo = Math.min(...xs);
	const hi = Math.max(...xs);
	if (bars) {
		const sorted = [...new Set(xs)].sort((a, b) => a - b);
		const gaps = sorted.slice(1).map((x, i) => x - (sorted[i] as number));
		const spacing = gaps.length > 0 ? Math.min(...gaps) : 1;
		const multiple = niceStep(Math.max(spacing, (hi - lo) / 5), 1) / spacing;
		const step = spacing * Math.max(1, Math.ceil(multiple - 1e-9));
		const on = (x: number, origin: number) => Math.abs(((x - origin) / step) % 1) < 1e-9 || Math.abs(((x - origin) / step) % 1) > 1 - 1e-9;
		const round = sorted.filter((x) => on(x, 0));
		return round.length > 0 ? round : sorted.filter((x) => on(x, lo));
	}
	if (!xs.every((x) => Number.isInteger(x))) return ticks(scale, 5);
	const step = Math.max(1, niceStep(Math.max(1, hi - lo), 5));
	const out: number[] = [];
	for (let value = Math.ceil(lo / step) * step; value <= hi; value += step) out.push(value);
	return out;
}

const clamp = (value: number, scale: Scale) => Math.min(scale.max, Math.max(scale.min, value));

function drawSeries(
	series: Series,
	index: number,
	xs: number[],
	px: (v: number) => number,
	py: (v: number) => number,
	plot: { x: number; y: number; w: number; h: number },
	group: { index: number; count: number },
	zero: number,
): SVGElement[] {
	const cls = `tb-s${(index % 6) + 1}`;
	const shape = series.shape ?? "line";

	if (shape === "bar") {
		const slot = (plot.w / Math.max(1, xs.length)) * 0.7;
		const count = Math.max(1, group.count);
		const width = Math.max(1, slot / count);
		const offset = -slot / 2 + Math.max(0, group.index) * width;
		return series.points.flatMap((point, i) => {
			const x = xs[i];
			if (point === null || x === undefined) return [];
			/*
			 * ⚠️ From zero, not from the floor of the plot. A bar used to run from its value down to the bottom
			 * edge, which is only zero when the scale starts there: on a scale from -40 to 40 a bar of 10 was
			 * drawn 50 tall, and a bar of -10 pointed down from -10 instead of up to zero.
			 */
			const y = py(point);
			return [
				svg("rect", {
					class: `tb-bar ${cls}`,
					x: px(x) + offset,
					y: Math.min(y, zero),
					width,
					height: Math.abs(zero - y),
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
	const dots = shape === "points" || series.markers === true;
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
	if (shape !== "points") for (const d of segments) marks.push(svg("path", { class: `tb-line ${cls}`, d }));
	/*
	 * A marker per value, for an x of separate items. Each series gets its own SHAPE as well as its
	 * colour, so two series with equal values are still two things on screen: with lines alone the later
	 * one covered the earlier completely, and a legend entry pointed at nothing (#111).
	 *
	 * ⚠️ Hollow, not filled. Solid shapes at the same point cover each other just as lines did: three
	 * series agreeing on frames 1 to 4 showed only the last one's triangles. Outlines nest instead, so a
	 * circle inside a diamond inside a triangle reads as three series that agree.
	 */
	if (dots) {
		series.points.forEach((point, i) => {
			const x = xs[i];
			if (point === null || x === undefined) return;
			marks.push(svg("path", { class: `tb-marker ${cls}`, d: markerPath(index, px(x), py(point)) }));
		});
	}
	return marks;
}

/** Six marker shapes, in series order, each about 8 units across: circle, diamond, triangle, square, down-triangle, cross. */
function markerPath(index: number, x: number, y: number): string {
	const r = 4;
	const at = (dx: number, dy: number) => `${(x + dx).toFixed(2)},${(y + dy).toFixed(2)}`;
	switch (index % 6) {
		case 0:
			return `M${at(-r, 0)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
		case 1:
			return `M${at(0, -r - 1)}L${at(r + 1, 0)}L${at(0, r + 1)}L${at(-r - 1, 0)}Z`;
		case 2:
			return `M${at(0, -r - 1)}L${at(r + 1, r)}L${at(-r - 1, r)}Z`;
		case 3:
			return `M${at(-r + 0.5, -r + 0.5)}h${2 * r - 1}v${2 * r - 1}h${-2 * r + 1}Z`;
		case 4:
			return `M${at(0, r + 1)}L${at(r + 1, -r)}L${at(-r - 1, -r)}Z`;
		default:
			return `M${at(-1.5, -r - 0.5)}h3v${r - 1}h${r - 1}v3h${1 - r}v${r - 1}h-3v${1 - r}h${1 - r}v-3h${r - 1}Z`;
	}
}

function legend(series: Series[]): HTMLElement {
	return el(
		"ul",
		{ class: "tb-legend" },
		...series.map((s, i) =>
			el(
				"li",
				{},
				// A series drawn with markers is keyed by its marker, since the shape is what tells it apart.
				s.shape === "points" || s.markers === true
					? el("span", { class: `tb-swatch-marker tb-s${(i % 6) + 1}`, "data-marker": String(i % 6), "aria-hidden": "true" })
					: el("span", { class: `tb-swatch tb-s${(i % 6) + 1}`, "aria-hidden": "true" }),
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
	// Whole-number ticks print as whole numbers: a frame axis reading "5.0, 10.0" suggests frames in between.
	const whole = finite.length > 0 && finite.every((v) => Number.isInteger(v));
	const digits = whole ? 0 : step >= 10 ? 0 : step >= 1 ? 1 : step >= 0.1 ? 2 : 3;
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
