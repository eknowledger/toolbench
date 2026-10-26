/**
 * What every chart kind shares: the stylesheet and how a number is written. One module, so the series chart,
 * the heatmap and the pie (#121, #123) each fetch one small shared chunk alongside their own, and a page
 * drawing a heatmap never downloads the line and bar renderer.
 *
 * The chart's stylesheet, in a chart chunk rather than the runtime's.
 *
 * Every rule here styles something only a chart draws, and every tool page used to download them, about
 * 1 KB gzipped, whether or not it drew a chart. They now arrive with the renderer, and the first chart
 * drawn into a shadow root adopts them there. The series colour TOKENS stay in the runtime's sheet,
 * because a host themes with them before any chart exists.
 */
import { svg } from "../dom.ts";
import { adoptStyles } from "../styles.ts";

export const CHART_STYLES = /* css */ `
/* ── chart ────────────────────────────────────────────────────────────────────────────────── */
.tb-out-chart { margin: 0; }
.tb-out-chart svg { width: 100%; height: auto; display: block; overflow: visible; }
/* ⚠️ A chart is laid out at the width this box measures, one viewBox unit to one CSS pixel, so its text is
   the size this says at any width (#210). It used to be drawn into a 640-unit viewBox and scaled to fit,
   text and all: a tick was 4.6px on a 330px panel and 22px on a 1440px one. The label size is read from
   this box, so the layout reserves room for the text a host asked for. */
.tb-plot { font-size: var(--tb-chart-font, 0.75rem); max-width: var(--tb-chart-max-width, 100%); }
/* On a card, the same chart drawn narrower, so a card does not hand most of a landing page to one chart. */
.tb-out-chart-card .tb-plot { max-width: min(var(--tb-chart-max-width, 100%), var(--tb-chart-card-max, 52rem)); }
.tb-grid { stroke: var(--tb-border); stroke-width: 1; }
.tb-axis { stroke: var(--tb-faint); stroke-width: 1; }
.tb-tick, .tb-axis-label { fill: var(--tb-faint); font-family: var(--tb-mono); }
.tb-axis-label { font-family: var(--tb-font); }
.tb-annotation { stroke: var(--tb-accent); stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.8; }
.tb-annotation-label { fill: var(--tb-accent-text); font-family: var(--tb-mono); }
/* A threshold (#114): a dashed rule in the tone it names, so a limit never reads as a series even where
   its tone shares a series colour, and a label haloed in the surface colour, drawn over the data. */
.tb-threshold { stroke: var(--tb-muted); stroke-width: 1.25; stroke-dasharray: 6 4; }
.tb-threshold[data-tone="warn"] { stroke: var(--tb-warn); }
.tb-threshold[data-tone="bad"] { stroke: var(--tb-bad); }
.tb-threshold[data-tone="good"] { stroke: var(--tb-good); }
.tb-threshold-label { fill: var(--tb-muted); font-family: var(--tb-mono); stroke: var(--tb-bg); stroke-width: 3; paint-order: stroke; }
.tb-threshold-label[data-tone="warn"] { fill: var(--tb-warn); }
.tb-threshold-label[data-tone="bad"] { fill: var(--tb-bad); }
.tb-threshold-label[data-tone="good"] { fill: var(--tb-good); }
/* Each series class sets ONE custom property; the shape decides whether that is a stroke or a fill.
   The first version set stroke and fill together, which beat the line rule's "fill: none" on source
   order and drew every line as a filled blob. (No backticks in here: this is a template literal.) */
.tb-s1 { --c: var(--tb-s1); }
.tb-s2 { --c: var(--tb-s2); }
.tb-s3 { --c: var(--tb-s3); }
.tb-s4 { --c: var(--tb-s4); }
.tb-s5 { --c: var(--tb-s5); }
.tb-s6 { --c: var(--tb-s6); }
.tb-line { fill: none; stroke: var(--c); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.tb-area { stroke: none; fill: var(--c); opacity: 0.14; }
/* A box plot (#122): a pale box with an outline, the median in full colour, whiskers in the same ink. */
.tb-box { fill: var(--c); fill-opacity: 0.18; stroke: var(--c); stroke-width: 1.5; }
.tb-box.tb-hot { fill-opacity: 0.32; }
.tb-median { stroke: var(--c); stroke-width: 2.5; }
.tb-whisker { stroke: var(--c); stroke-width: 1.25; }
.tb-outlier { fill: var(--tb-bg); stroke: var(--c); stroke-width: 1.5; }
.tb-swatch-box { width: 0.75rem; height: 0.6rem; border-radius: 2px; flex: none; border: 1.5px solid var(--c, currentColor); background: color-mix(in oklab, var(--c, currentColor) 18%, transparent); }
/* A band (#119): a quiet fill, drawn first, so the lines over it carry the emphasis. */
.tb-band { stroke: none; fill: var(--c); opacity: 0.22; }
.tb-swatch-band { width: 0.75rem; height: 0.6rem; border-radius: 2px; flex: none; background: var(--c, currentColor); opacity: 0.45; }
/* Opaque, so a bar is the colour its legend swatch says it is. */
.tb-bar  { stroke: none; fill: var(--c); }
/* A surface-coloured edge between stacked segments, so neighbouring parts never merge into one bar. */
.tb-bar[data-stacked] { stroke: var(--tb-bg); stroke-width: 1.5; }
.tb-legend { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0.5rem 0 0; padding: 0; list-style: none; font-size: 0.78rem; color: var(--tb-muted); }
.tb-legend li { display: flex; align-items: center; gap: 0.375rem; }
.tb-swatch { width: 0.75rem; height: 0.1875rem; border-radius: 2px; background: var(--c, currentColor); }
/* Hollow, so markers at the same point nest rather than cover each other. */
.tb-marker { fill: var(--tb-bg); stroke: var(--c); stroke-width: 1.75; }
/* A bubble (#127): translucent so overlaps show, with a surface ring so each edge is found. */
.tb-bubble { fill: var(--c); fill-opacity: 0.5; stroke: var(--tb-bg); stroke-width: 1.5; }
.tb-bubble.tb-hot { fill-opacity: 0.8; stroke: var(--tb-fg); }
.tb-size-key { font-size: var(--tb-chart-font, 0.75rem); margin-top: 0.5rem; display: flex; align-items: flex-end; gap: 0.5rem; }
.tb-size-key svg { width: auto; height: auto; display: block; overflow: visible; }
.tb-size-title { margin: 0 0 0.25rem; font-size: 0.78rem; color: var(--tb-muted); }
.tb-size-ref { fill: none; stroke: var(--tb-muted); stroke-width: 1; }
/* The legend key for a marked series is its marker, drawn with the same six outlines as the plot. */
.tb-swatch-marker { width: 0.7rem; height: 0.7rem; flex: none; background: var(--c, currentColor); }
/* The readout (#112): a dashed crosshair under the data, the lifted marks, and a card beside the line. */
.tb-out-chart { position: relative; }
.tb-plot { outline: none; border-radius: 4px; }
.tb-plot:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 4px; }
.tb-crosshair { stroke: var(--tb-muted); stroke-width: 1; stroke-dasharray: 3 3; }
.tb-marker.tb-hot { stroke-width: 3; }
.tb-bar.tb-hot { stroke: var(--tb-fg); stroke-width: 1.5; }
.tb-readout {
  position: absolute; z-index: 2; pointer-events: none; transform: translate(12px, -50%);
  min-width: 9rem; max-width: 16rem; padding: 0.5rem 0.625rem;
  background: var(--tb-bg); color: var(--tb-fg); border: 1px solid var(--tb-border); border-radius: 8px;
  box-shadow: 0 6px 18px -8px rgb(0 0 0 / 0.35); font-size: 0.78rem; line-height: 1.35;
}
/* A row the readout is on, in the chart's data table or a linked table (#124): a wash and a rule, never colour alone. */
.tb-chart-data tr.tb-hot > * { background: var(--tb-accent-bg); }
.tb-chart-data tr.tb-hot > :first-child { box-shadow: inset 3px 0 0 var(--tb-accent); }
.tb-readout[data-flip] { transform: translate(calc(-100% - 12px), -50%); }
.tb-readout-title { margin: 0 0 0.25rem; color: var(--tb-muted); font-weight: 600; }
.tb-readout-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem; }
.tb-readout-rows li { display: flex; align-items: center; gap: 0.4rem; }
.tb-readout-rows strong { font-family: var(--tb-mono); font-weight: 600; }
.tb-readout-rows span:last-child { color: var(--tb-muted); }
.tb-swatch-marker[data-marker="0"] { clip-path: circle(50%); }
.tb-swatch-marker[data-marker="1"] { clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.tb-swatch-marker[data-marker="2"] { clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.tb-swatch-marker[data-marker="4"] { clip-path: polygon(0 0, 100% 0, 50% 100%); }
.tb-swatch-marker[data-marker="5"] { clip-path: polygon(35% 0, 65% 0, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0 65%, 0 35%, 35% 35%); }
/* A data table can be wider than its chart, so it scrolls; the ring is inset, as a scroller clips one outside (#194). */
.tb-chart-data { margin-top: 0.5rem; font-size: 0.8rem; overflow-x: auto; }
.tb-chart-data summary:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: -2px; }
/* 24px tall, the minimum target size (WCAG 2.5.8): at the text's own height it was 19px. */
.tb-chart-data summary { color: var(--tb-faint); cursor: pointer; min-height: 24px; line-height: 24px; }
.tb-chart-data table { margin-top: 0.5rem; }
`;

// Re-exported so the chart kinds keep importing it from here; it lives in styles.ts since the graph kind shares it.
export { adoptStyles };

/** Adopt the chart sheet into the shadow root a chart was just drawn into, once per root. See `adoptStyles`. */
export function adoptChartStyles(node: Node): void {
	adoptStyles(node, "chart", () => CHART_STYLES);
}

/**
 * How a chart writes a number, shared by every chart kind so a value reads the same in a line chart, a
 * heatmap and a pie.
 */
export function format(value: number): string {
	if (!Number.isFinite(value)) return "n/a";
	const abs = Math.abs(value);
	// A whole number is written whole: frame 6, not frame 6.00, in the readout and the data table alike.
	if (Number.isInteger(value) && abs < 1000) return String(value);
	if (abs >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
	if (abs >= 10) return value.toFixed(abs % 1 === 0 ? 0 : 1);
	if (abs >= 1) return value.toFixed(2);
	if (abs === 0) return "0";
	return value.toPrecision(2);
}

/**
 * What a chart is laid out for: its width and its label size in CSS pixels, whether it is narrow, and how far
 * its labels' text reaches above and below their baseline, measured in the face the page actually has.
 */
export interface Fit {
	width: number;
	font: number;
	narrow: boolean;
	ascent: number;
	descent: number;
	/** The widest of the label faces' average character, in em: what `textWidth` and `cut` reserve. */
	char: number;
}

/** A label's height, and the shift from its baseline that centres it on a line drawn at the baseline's y. */
export const lineOf = (fit: Fit) => fit.ascent + fit.descent;
export const middleOf = (fit: Fit) => (fit.ascent - fit.descent) / 2;

/** Below this a chart takes its narrow layout: fewer ticks, labels above horizontal bars, a key under a pie. */
export const NARROW = 480;

/** The width and type size a chart is first drawn at, before it is on the page and can be measured. */
const FIRST: Fit = { width: 640, font: 12, narrow: false, ascent: 11.2, descent: 2.9, char: 0.62 };

/**
 * ⚠️ How far a label's box reaches above and below its baseline, and how wide its characters run, measured,
 * never assumed from the size.
 *
 * Both were constants in em, which held for the macOS faces and not for the Linux ones. In CI a treemap
 * tile's value overlapped its own name, because the faces there have a taller box at the same size, and at
 * 16px a semibold tile name ran out of its tile, because they are wider. Noteworthy, whose box is 1.6em,
 * did the first on macOS. A label of each face, and a semibold one, is measured in the plot, where the
 * chart's own rules style it.
 */
const SAMPLE = "Recognition Synthesis 0123456789 k$";
function metrics(plot: HTMLElement, font: number): { ascent: number; descent: number; char: number } {
	const probe = svg("svg", { "aria-hidden": "true", style: "position:absolute;width:0;height:0;overflow:visible;visibility:hidden" }) as SVGSVGElement;
	// Numbers on their own too: a face whose digits are wider than its letters set a tick into the axis title.
	const texts = [SAMPLE, "0123456789"].flatMap((text) => [
		svg("text", { class: "tb-tick", x: 0, y: 0 }, text),
		svg("text", { class: "tb-axis-label", x: 0, y: 0 }, text),
		svg("text", { class: "tb-axis-label", x: 0, y: 0, style: "font-weight:600" }, text),
	]) as SVGTextElement[];
	probe.append(...texts);
	plot.append(probe);
	let ascent = 0;
	let descent = 0;
	let char = 0;
	for (const t of texts) {
		const box = t.getBBox();
		ascent = Math.max(ascent, -box.y);
		descent = Math.max(descent, box.y + box.height);
		char = Math.max(char, box.width / (t.textContent ?? "").length / font);
	}
	probe.remove();
	// Nothing measured, as in a document that is not rendering: the defaults' proportions.
	return ascent > 0 ? { ascent, descent, char } : { ascent: font * 0.93, descent: font * 0.24, char: FIRST.char };
}

/*
 * ⚠️ The character width of the drawing in progress. Set by `fitted` immediately before it calls a chart's
 * draw, which is synchronous, so every `textWidth` and `cut` in that drawing reads its own measurement.
 */
let char = FIRST.char;

/** About how wide a label is, in pixels, from the measured width of the faces' characters. */
export const textWidth = (text: string, font: number): number => text.length * font * char;

/** A label cut to `room` pixels, with an ellipsis, since the whole text is in the data table and the readout. */
export function cut(text: string, room: number, font: number): string {
	const fits = Math.max(1, Math.floor(room / (font * char)));
	return text.length > fits ? `${text.slice(0, Math.max(1, fits - 1))}…` : text;
}

/**
 * Every n-th of a run of labels, the smallest n at which no two neighbours touch. `at` is each label's centre
 * along the axis, `size` its extent along it.
 */
export function thin<T>(items: T[], at: (item: T) => number, size: (item: T) => number, gap = 6): T[] {
	for (let every = 1; every <= items.length; every++) {
		const kept = items.filter((_, i) => i % every === 0);
		if (kept.every((item, i) => i === 0 || Math.abs(at(item) - at(kept[i - 1] as T)) >= (size(item) + size(kept[i - 1] as T)) / 2 + gap)) return kept;
	}
	return items.slice(0, 1);
}

/**
 * A chart drawn for the width it is given, and drawn again whenever that width changes.
 *
 * The first drawing is at 640 pixels, because nothing has been measured yet. Once the figure is on the page a
 * ResizeObserver reads the plot box and its type size, and the chart is laid out again for them. Its first
 * notification arrives before the first paint, so a reader never sees the guess. The new figure replaces the
 * old one whole, carrying over an open data table and the keyboard focus, so every listener belongs to one
 * drawing and a redraw cannot leave a second readout behind.
 */
export function fitted(draw: (fit: Fit) => HTMLElement): HTMLElement {
	char = FIRST.char;
	let figure = draw(FIRST);
	let at = FIRST;
	/*
	 * ⚠️ The attributes the drawing set, so the ones the caller added after it are carried to the next one.
	 * `render` names every part's root with `data-kind`, `data-role` and `data-part`, and a host styles by
	 * them: a redrawn figure without them lost its host CSS, and the width check could not find it drawn.
	 */
	let own = new Set(figure.getAttributeNames());
	if (typeof ResizeObserver !== "function") return figure;
	const plotOf = (f: HTMLElement) => (f.querySelector(".tb-plot") as HTMLElement | null) ?? f;
	// ⚠️ Not given up on before it has been on the page: a figure is drawn before it is inserted, and an early notification would end it.
	let shown = false;
	const observer = new ResizeObserver(() => {
		if (!figure.isConnected) return shown ? observer.disconnect() : undefined;
		shown = true;
		const plot = plotOf(figure);
		const width = Math.floor(plot.clientWidth);
		const font = Number.parseFloat(getComputedStyle(plot).fontSize) || FIRST.font;
		// The figure's width, not the plot's, decides narrow: a pie's plot shares a row with its key until it is narrow.
		const narrow = figure.clientWidth < NARROW;
		if (width <= 0) return;
		const m = metrics(plot, font);
		const same = (a: number, b: number) => Math.abs(a - b) < 0.01;
		/*
		 * Measured and found to need nothing: this drawing is the one a reader keeps, so it says so (#236). A
		 * script that points at a chart, or measures one, waits for `data-fitted` rather than counting frames:
		 * three frames were not enough on a loaded CI runner, and a test then pressed keys on a drawing that
		 * was about to be replaced.
		 */
		if (width === at.width && font === at.font && narrow === at.narrow && same(m.ascent, at.ascent) && same(m.descent, at.descent) && same(m.char, at.char)) {
			figure.setAttribute("data-fitted", "");
			return;
		}
		at = { width, font, narrow, ...m };
		char = at.char;
		const next = draw(at);
		const drawn = new Set(next.getAttributeNames());
		// Not `data-fitted`: the new drawing has not been measured yet.
		for (const name of figure.getAttributeNames()) if (!own.has(name) && name !== "data-fitted") next.setAttribute(name, figure.getAttribute(name) ?? "");
		own = drawn;
		const open = figure.querySelector("details.tb-chart-data")?.hasAttribute("open");
		if (open) next.querySelector("details.tb-chart-data")?.setAttribute("open", "");
		const root = figure.getRootNode() as Document | ShadowRoot;
		const focused = root.activeElement === plot;
		observer.disconnect();
		figure.replaceWith(next);
		figure = next;
		if (focused) plotOf(next).focus({ preventScroll: true });
		/*
		 * ⚠️ Observed from the next frame, not from inside this callback. The new figure sits at the depth of
		 * the old one, and a target first observed during delivery at a depth not deeper than the last is left
		 * undelivered: Chrome then reports "ResizeObserver loop completed with undelivered notifications" as a
		 * page error. Seen in CI on Linux; the first notification in the next frame reports the size anyway.
		 */
		requestAnimationFrame(() => {
			if (figure !== next) return;
			observer.observe(plotOf(next));
			observer.observe(next);
		});
	});
	observer.observe(plotOf(figure));
	observer.observe(figure);
	return figure;
}
