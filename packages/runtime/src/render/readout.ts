/**
 * The readout: what a chart says when a reader points at it or steps through it from the keyboard (#112).
 *
 * A reader could only read a chart off its gridlines, or open the data table and find the row. The readout
 * snaps to the nearest x, draws a crosshair there, lifts the marks at that x and shows a card of every
 * series' value, so a glance is enough.
 *
 * ⚠️ Keyboard parity is the feature, not a follow-up. The plot is one focusable element; the arrow keys
 * step through the x values and a live region reads each card out. A readout reachable only by a mouse
 * would be a chart that tells sighted mouse users more than everyone else.
 *
 * What the card says is the tool's: `readout.titles` replaces a heading, `series.notes` replaces a value.
 * Outputs are data, serialised across a worker and into seeds, so this is declarative rather than a
 * callback, and a seeded chart reads out exactly what a live one would.
 */
import type { Chart } from "@toolbench/sdk";
import { el, svg } from "../dom.ts";

export interface Geometry {
	/** x in data units to x in viewBox units. */
	px: (value: number) => number;
	/** A series' value to y in viewBox units, on the scale that series is drawn against. */
	py: (seriesIndex: number, value: number) => number;
	plot: { x: number; y: number; w: number; h: number };
	width: number;
	height: number;
	format: (value: number) => string;
	/** The legend key element for a series, cloned into the card so the card and the legend agree. */
	key: (seriesIndex: number) => HTMLElement;
}

export function attachReadout(figure: HTMLElement, plotSvg: SVGSVGElement, chart: Chart, g: Geometry): void {
	const mode = chart.readout?.mode ?? "x";
	if (mode === "none" || chart.x.length === 0) return;
	const crosshair = chart.readout?.crosshair ?? "x";

	const vLine = svg("line", { class: "tb-crosshair", y1: g.plot.y, y2: g.plot.y + g.plot.h, visibility: "hidden" });
	const hLine = svg("line", { class: "tb-crosshair", x1: g.plot.x, x2: g.plot.x + g.plot.w, visibility: "hidden" });
	// Under the data, so the crosshair never covers the value it points at.
	plotSvg.insertBefore(hLine, plotSvg.firstChild);
	plotSvg.insertBefore(vLine, plotSvg.firstChild);

	const card = el("div", { class: "tb-readout", hidden: true, "aria-hidden": "true" });
	// The spoken copy of the card. Separate, because the card is re-positioned constantly and a live
	// region that moves is still announced, but one that is re-created is not.
	const live = el("p", { class: "tb-sr", role: "status", "aria-live": "polite" });
	figure.append(card, live);

	/*
	 * The plot is a focusable group, named by the chart's own description. `img` stays on the svg: it is
	 * still one picture, and the group is what a keyboard user lands on and operates.
	 */
	const plotBox = plotSvg.parentElement as HTMLElement;
	plotBox.setAttribute("tabindex", "0");
	plotBox.setAttribute("role", "group");
	plotBox.setAttribute("aria-roledescription", "chart");
	plotBox.setAttribute("aria-label", `${plotSvg.getAttribute("aria-label") ?? ""}. Arrow keys read each value.`);

	let current = -1;
	const xs = chart.x;
	const nearestIndex = (vbX: number) => {
		let best = 0;
		let bestDistance = Number.POSITIVE_INFINITY;
		xs.forEach((x, i) => {
			const d = Math.abs(g.px(x) - vbX);
			if (d < bestDistance) {
				bestDistance = d;
				best = i;
			}
		});
		return best;
	};

	const lift = (index: number) => {
		for (const mark of plotSvg.querySelectorAll("[data-i]")) {
			mark.classList.toggle("tb-hot", Number(mark.getAttribute("data-i")) === index);
		}
	};

	const show = (index: number, pointerY?: number) => {
		current = index;
		const x = xs[index] as number;
		const cx = g.px(x);
		const rows: { series: number; y: number }[] = [];
		chart.series.forEach((series, s) => {
			const value = series.points[index];
			if (value !== null && value !== undefined) rows.push({ series: s, y: g.py(s, value) });
		});
		/*
		 * `point` mode keeps only the series nearest the pointer. From the keyboard there is no pointer, so
		 * it keeps the first series with a value, which is where a reader stepping along would expect it.
		 */
		const shown =
			mode === "point" && rows.length > 0
				? [rows.reduce((a, b) => (pointerY !== undefined && Math.abs(b.y - pointerY) < Math.abs(a.y - pointerY) ? b : a))]
				: rows;

		vLine.setAttribute("x1", String(cx));
		vLine.setAttribute("x2", String(cx));
		vLine.setAttribute("visibility", crosshair === "x" || crosshair === "both" ? "visible" : "hidden");
		const nearest = shown[0];
		if (nearest && (crosshair === "y" || crosshair === "both")) {
			hLine.setAttribute("y1", String(nearest.y));
			hLine.setAttribute("y2", String(nearest.y));
			hLine.setAttribute("visibility", "visible");
		} else {
			hLine.setAttribute("visibility", "hidden");
		}
		lift(index);

		const title = chart.readout?.titles?.[index] ?? `${chart.xLabel} ${g.format(x)}${chart.xUnit ? ` ${chart.xUnit}` : ""}`;
		// textContent throughout: series labels and notes are tool output, and tool output is not markup.
		const heading = el("p", { class: "tb-readout-title" });
		heading.textContent = title;
		const list = el("ul", { class: "tb-readout-rows" });
		const spoken: string[] = [];
		for (const row of shown) {
			const series = chart.series[row.series];
			if (!series) continue;
			const value = series.points[index] as number;
			const text = series.notes?.[index] ?? `${g.format(value)}${series.unit ? ` ${series.unit}` : ""}`;
			const strong = el("strong", {});
			strong.textContent = text;
			const name = el("span", {});
			name.textContent = series.label;
			list.append(el("li", {}, g.key(row.series), strong, name));
			spoken.push(`${series.label} ${text}`);
		}
		if (shown.length === 0) {
			const none = el("li", {});
			none.textContent = "no value";
			list.append(none);
			spoken.push("no value");
		}
		card.replaceChildren(heading, list);
		card.hidden = false;
		live.textContent = `${title}: ${spoken.join(", ")}`;

		/*
		 * Place the card beside the crosshair, inside the figure. It flips to the left of the line past the
		 * middle of the plot, so near the right edge it stays on screen rather than overflowing the host.
		 */
		const box = plotSvg.getBoundingClientRect();
		const frame = figure.getBoundingClientRect();
		const scale = box.width / g.width;
		const left = box.left - frame.left + cx * scale;
		const top = box.top - frame.top + (nearest ? nearest.y : g.plot.y + g.plot.h / 2) * (box.height / g.height);
		const flip = cx > g.plot.x + g.plot.w / 2;
		card.style.left = `${Math.round(left)}px`;
		card.style.top = `${Math.round(top)}px`;
		card.toggleAttribute("data-flip", flip);
	};

	const hide = () => {
		current = -1;
		card.hidden = true;
		vLine.setAttribute("visibility", "hidden");
		hLine.setAttribute("visibility", "hidden");
		lift(-1);
	};

	const toViewBox = (event: PointerEvent) => {
		const box = plotSvg.getBoundingClientRect();
		return {
			x: ((event.clientX - box.left) / box.width) * g.width,
			y: ((event.clientY - box.top) / box.height) * g.height,
		};
	};
	const inPlot = (p: { x: number; y: number }) => p.x >= g.plot.x - 8 && p.x <= g.plot.x + g.plot.w + 8 && p.y >= g.plot.y && p.y <= g.plot.y + g.plot.h;

	plotSvg.addEventListener("pointermove", (event) => {
		const p = toViewBox(event);
		if (inPlot(p)) show(nearestIndex(p.x), p.y);
		else if (event.pointerType === "mouse") hide();
	});
	// A touch has no hover: a tap shows the card, and it stays until a tap lands somewhere else.
	plotSvg.addEventListener("pointerdown", (event) => {
		const p = toViewBox(event);
		if (inPlot(p)) show(nearestIndex(p.x), p.y);
	});
	plotSvg.addEventListener("pointerleave", (event) => {
		if (event.pointerType === "mouse") hide();
	});
	/*
	 * ⚠️ A document listener, so it outlives its chart: every run redraws the chart, and each drawing
	 * would leave one behind. It removes itself the first time it finds its chart gone.
	 */
	const doc = figure.ownerDocument;
	const outside = (event: PointerEvent) => {
		if (!figure.isConnected) return doc.removeEventListener("pointerdown", outside);
		if (current >= 0 && !event.composedPath().includes(plotSvg)) hide();
	};
	doc.addEventListener("pointerdown", outside);

	plotBox.addEventListener("focus", () => {
		if (current < 0) show(0);
	});
	plotBox.addEventListener("blur", hide);
	plotBox.addEventListener("keydown", (event) => {
		const key = (event as KeyboardEvent).key;
		if (event.target !== plotBox) return;
		const last = xs.length - 1;
		const next =
			key === "ArrowRight" ? Math.min(last, current + 1)
			: key === "ArrowLeft" ? Math.max(0, current - 1)
			: key === "Home" ? 0
			: key === "End" ? last
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
