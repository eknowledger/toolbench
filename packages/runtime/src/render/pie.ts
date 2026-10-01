/**
 * The pie and the donut (#123): parts of a whole, when there are few parts and the whole is the point.
 *
 * A pie is easy to draw badly, so the failure modes are built out rather than documented:
 *
 *  - every slice is labelled with its share, on the slice where it fits and always in the key beside it,
 *    so no reader has to match colours to a legend;
 *  - slices are drawn in the order given, from 12 o'clock clockwise, so the tool sets the reading order;
 *  - at most six coloured slices: beyond that the smallest fold into "Other", and the caption says so,
 *    because more parts than that is a bar chart;
 *  - a negative value or a zero total draws a message, not a chart, because a share of either is undefined;
 *  - a surface-coloured gap between slices, so neighbours never merge.
 *
 * Its own chunk, sharing the chart stylesheet and number format with the other kinds.
 */
import type { Pie } from "@toolbench/sdk";
import { el, svg } from "../dom.ts";
import type { RenderOptions } from "./index.ts";
import { adoptChartStyles, adoptStyles, format } from "./plot-common.ts";

const W = 640;
const H = 260;
const MAX_SLICES = 6;

const PIE_STYLES = /* css */ `
.tb-slice { fill: var(--c); stroke: var(--tb-bg); stroke-width: 2; }
.tb-slice[data-tone="good"] { fill: var(--tb-good); }
.tb-slice[data-tone="warn"] { fill: var(--tb-warn); }
.tb-slice[data-tone="bad"] { fill: var(--tb-bad); }
.tb-slice.tb-hot { stroke: var(--tb-fg); }
.tb-slice-share { fill: var(--tb-bg); font-family: var(--tb-mono); font-size: 11px; font-weight: 600; pointer-events: none; }
.tb-pie-total { fill: var(--tb-fg); font-family: var(--tb-mono); font-size: 18px; font-weight: 600; }
.tb-pie-key { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; font-size: 0.82rem; }
.tb-pie-key li { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 0.5rem; }
.tb-pie-key .tb-share { font-family: var(--tb-mono); font-weight: 600; }
.tb-pie-key .tb-value { font-family: var(--tb-mono); color: var(--tb-muted); }
.tb-pie-key .tb-swatch-pie { width: 0.7rem; height: 0.7rem; border-radius: 2px; background: var(--c); }
.tb-pie-key [data-tone="good"] .tb-swatch-pie { background: var(--tb-good); }
.tb-pie-key [data-tone="warn"] .tb-swatch-pie { background: var(--tb-warn); }
.tb-pie-key [data-tone="bad"] .tb-swatch-pie { background: var(--tb-bad); }
.tb-pie-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(12rem, 0.9fr); gap: 1rem; align-items: center; }
.tb-pie-message { margin: 0; padding: 0.75rem; border: 1px dashed var(--tb-border); border-radius: 8px; color: var(--tb-muted); font-size: 0.86rem; }
`;

interface Slice {
	label: string;
	value: number;
	tone?: string;
	explode?: boolean;
	share: number;
}

export function renderPie(pie: Pie, options: RenderOptions = {}): HTMLElement {
	const compact = (options.cardChart ?? options.compact) === true;
	const unit = pie.unit ? ` ${pie.unit}` : "";
	const figure = el("figure", { class: compact ? "tb-out-chart tb-out-chart-card tb-pie" : "tb-out-chart tb-pie" });
	adoptChartStyles(figure);
	adoptStyles(figure, "pie", () => PIE_STYLES);

	const total = pie.slices.reduce((sum, s) => sum + s.value, 0);
	if (pie.slices.some((s) => !Number.isFinite(s.value) || s.value < 0) || total <= 0) {
		const message = el("p", { class: "tb-pie-message" });
		message.textContent = `${pie.label}: a share needs positive values that add up to more than zero, so this is not drawn as a pie.`;
		figure.append(message, table(pie.slices.map((s) => ({ ...s, share: Number.NaN })), pie, unit, undefined));
		return figure;
	}

	// More than six parts fold into "Other": the smallest go, the rest keep the order the tool gave them.
	let slices: Slice[] = pie.slices.map((s) => ({ ...s, share: s.value / total }));
	let folded = 0;
	if (slices.length > MAX_SLICES) {
		const keep = new Set([...slices].sort((a, b) => b.value - a.value).slice(0, MAX_SLICES - 1));
		const rest = slices.filter((s) => !keep.has(s));
		folded = rest.length;
		const other = rest.reduce((sum, s) => sum + s.value, 0);
		slices = [...slices.filter((s) => keep.has(s)), { label: "Other", value: other, share: other / total }];
	}

	const cx = 150;
	const cy = H / 2;
	// Room for an exploded slice to move out without leaving the picture.
	const r = slices.some((s) => s.explode === true) ? 104 : 112;
	const inner = pie.donut ? 68 : 0;
	const marks: SVGElement[] = [];
	let angle = -Math.PI / 2;
	slices.forEach((slice, i) => {
		const sweep = slice.share * Math.PI * 2;
		const end = angle + sweep;
		const point = (radius: number, a: number) => `${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`;
		const large = sweep > Math.PI ? 1 : 0;
		// A whole circle cannot be one arc, so a single slice of 100% is drawn as two halves.
		const d =
			slice.share >= 0.9999
				? inner > 0
					? `M${point(r, angle)}A${r},${r} 0 1 1 ${point(r, angle + Math.PI)}A${r},${r} 0 1 1 ${point(r, angle)}M${point(inner, angle)}A${inner},${inner} 0 1 0 ${point(inner, angle + Math.PI)}A${inner},${inner} 0 1 0 ${point(inner, angle)}Z`
					: `M${point(r, angle)}A${r},${r} 0 1 1 ${point(r, angle + Math.PI)}A${r},${r} 0 1 1 ${point(r, angle)}Z`
				: inner > 0
					? `M${point(r, angle)}A${r},${r} 0 ${large} 1 ${point(r, end)}L${point(inner, end)}A${inner},${inner} 0 ${large} 0 ${point(inner, angle)}Z`
					: `M${cx},${cy}L${point(r, angle)}A${r},${r} 0 ${large} 1 ${point(r, end)}Z`;
		/*
		 * An exploded slice (#126) moves out along its bisector by a fixed 8% of the radius, label and all.
		 * Fixed rather than configurable, because a slice pulled further out reads as larger still.
		 */
		const mid = angle + sweep / 2;
		const push = slice.explode === true ? r * 0.08 : 0;
		const shift = push > 0 ? `translate(${(push * Math.cos(mid)).toFixed(2)} ${(push * Math.sin(mid)).toFixed(2)})` : undefined;
		marks.push(
			svg("path", {
				class: `tb-slice tb-s${(i % 6) + 1}`,
				"data-i": i,
				...(slice.tone ? { "data-tone": slice.tone } : {}),
				...(shift ? { transform: shift, "data-exploded": "" } : {}),
				"fill-rule": "evenodd",
				d,
			}),
		);
		// The share on the slice where it fits; the key beside the pie always has it.
		if (sweep > 0.42) {
			const at = (inner + r) / 2 + push;
			marks.push(
				svg(
					"text",
					{ class: "tb-slice-share", x: cx + at * Math.cos(mid), y: cy + at * Math.sin(mid) + 4, "text-anchor": "middle" },
					percent(slice.share),
				),
			);
		}
		angle = end;
	});
	if (pie.donut && pie.total) marks.push(svg("text", { class: "tb-pie-total", x: cx, y: cy + 6, "text-anchor": "middle" }, pie.total));

	const description = `${pie.label}: ${slices.map((s) => `${s.label} ${percent(s.share)}`).join(", ")}`;
	const picture = svg("svg", { viewBox: `0 0 300 ${H}`, role: "img", "aria-label": description, preserveAspectRatio: "xMidYMid meet" }, ...marks) as SVGSVGElement;
	const key = el(
		"ul",
		{ class: "tb-pie-key" },
		...slices.map((slice, i) => {
			const name = el("span", {});
			name.textContent = slice.label;
			const share = el("span", { class: "tb-share" });
			share.textContent = percent(slice.share);
			const value = el("span", { class: "tb-value" });
			value.textContent = `${format(slice.value)}${unit}`;
			return el("li", { class: `tb-s${(i % 6) + 1}`, ...(slice.tone ? { "data-tone": slice.tone } : {}) }, el("span", { class: "tb-swatch-pie", "aria-hidden": "true" }), name, share, value);
		}),
	);
	figure.append(
		el("div", { class: "tb-pie-body" }, el("div", { class: "tb-plot" }, picture), key),
		table(slices, pie, unit, folded > 0 ? `${folded} smallest parts folded into Other` : undefined),
	);
	attachSliceReadout(figure, picture, slices, pie, unit);
	return figure;
}

/** One way to write a share everywhere it appears: a decimal below 10%, where a whole number says too little. */
const percent = (share: number) => {
	if (!Number.isFinite(share)) return "—";
	const pct = share * 100;
	return `${pct < 9.95 ? pct.toFixed(1) : Math.round(pct)}%`;
};

function table(slices: Slice[], pie: Pie, unit: string, note: string | undefined): HTMLElement {
	const head = el("tr", {}, el("th", { scope: "col" }, "Part"), el("th", { scope: "col" }, `Value${unit ? ` (${unit.trim()})` : ""}`), el("th", { scope: "col" }, "Share"));
	const rows = slices.map((s, i) => el("tr", { "data-i": i }, el("th", { scope: "row" }, s.label), el("td", {}, format(s.value)), el("td", {}, percent(s.share))));
	return el(
		"details",
		{ class: "tb-chart-data" },
		el("summary", {}, "Show the data as a table"),
		el("table", {}, el("caption", {}, note ? `${pie.label}. ${note}.` : pie.label), el("thead", {}, head), el("tbody", {}, ...rows)),
	);
}

/** On slices the mark is the target: the readout follows the slice under the pointer, and the arrows step round. */
function attachSliceReadout(figure: HTMLElement, plotSvg: SVGSVGElement, slices: Slice[], pie: Pie, unit: string): void {
	const card = el("div", { class: "tb-readout", hidden: true, "aria-hidden": "true" });
	const live = el("p", { class: "tb-sr", role: "status", "aria-live": "polite" });
	figure.append(card, live);
	const plotBox = plotSvg.parentElement as HTMLElement;
	plotBox.setAttribute("tabindex", "0");
	plotBox.setAttribute("role", "group");
	plotBox.setAttribute("aria-roledescription", pie.donut ? "donut chart" : "pie chart");
	plotBox.setAttribute("aria-label", `${pie.label}. Arrow keys read each part.`);
	let current = -1;
	const show = (i: number, at?: { x: number; y: number }) => {
		const slice = slices[i];
		if (!slice) return;
		current = i;
		for (const path of plotSvg.querySelectorAll(".tb-slice")) path.classList.toggle("tb-hot", Number(path.getAttribute("data-i")) === i);
		const heading = el("p", { class: "tb-readout-title" });
		heading.textContent = slice.label;
		const strong = el("strong", {});
		strong.textContent = percent(slice.share);
		const value = el("span", {});
		value.textContent = `${format(slice.value)}${unit}`;
		card.replaceChildren(heading, el("ul", { class: "tb-readout-rows" }, el("li", {}, strong, value)));
		card.hidden = false;
		live.textContent = `${slice.label}: ${percent(slice.share)}, ${format(slice.value)}${unit}`;
		const box = plotSvg.getBoundingClientRect();
		const frame = figure.getBoundingClientRect();
		card.style.left = `${Math.round((at?.x ?? box.right) - frame.left)}px`;
		card.style.top = `${Math.round((at?.y ?? box.top + box.height / 2) - frame.top)}px`;
		card.removeAttribute("data-flip");
	};
	const hide = () => {
		current = -1;
		card.hidden = true;
		for (const path of plotSvg.querySelectorAll(".tb-hot")) path.classList.remove("tb-hot");
	};
	plotSvg.addEventListener("pointermove", (event) => {
		const path = (event.target as Element).closest?.(".tb-slice");
		if (path) show(Number(path.getAttribute("data-i")), { x: event.clientX, y: event.clientY });
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
		const last = slices.length - 1;
		const next =
			key === "ArrowRight" || key === "ArrowDown"
				? Math.min(last, current + 1)
				: key === "ArrowLeft" || key === "ArrowUp"
					? Math.max(0, current - 1)
					: key === "Home"
						? 0
						: key === "End"
							? last
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
