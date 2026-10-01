/**
 * The chart's stylesheet, in the chart chunk rather than the runtime's.
 *
 * Every rule here styles something only a chart draws, and every tool page used to download them, about
 * 1 KB gzipped, whether or not it drew a chart. They now arrive with the renderer, and the first chart
 * drawn into a shadow root adopts them there. The series colour TOKENS stay in the runtime's sheet,
 * because a host themes with them before any chart exists.
 */
export const CHART_STYLES = /* css */ `
/* ── chart ────────────────────────────────────────────────────────────────────────────────── */
.tb-out-chart { margin: 0; }
.tb-out-chart svg { width: 100%; height: auto; display: block; overflow: visible; }
/* On a card, the same chart drawn smaller. Capping the width lets the viewBox set the height, so the
   aspect ratio is untouched: a chart that is half as wide is half as tall, not squashed. */
.tb-out-chart-card svg { max-width: var(--tb-chart-card-max, 52rem); }
/* ⚠️ Text inside a viewBox scales with the box, so the labels only need help when the box is SMALLER than
   the 640-unit viewBox. Above that they scale up and are fine; below it a 10px label renders at 6px and is
   past reading. 42rem is where a card's chart, minus the body's padding, crosses 640px. Gated on the card's
   own width rather than the viewport, since the same card is a full-width lead and a third of a rail. */
@container (max-width: 42rem) {
  .tb-out-chart-card .tb-tick { font-size: 15px; }
  .tb-out-chart-card .tb-axis-label { font-size: 16px; }
  .tb-out-chart-card .tb-annotation-label { font-size: 15px; }
}
.tb-grid { stroke: var(--tb-border); stroke-width: 1; }
.tb-axis { stroke: var(--tb-faint); stroke-width: 1; }
.tb-tick, .tb-axis-label { fill: var(--tb-faint); font-family: var(--tb-mono); font-size: 10px; }
.tb-axis-label { font-family: var(--tb-font); font-size: 11px; }
.tb-annotation { stroke: var(--tb-accent); stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.8; }
.tb-annotation-label { fill: var(--tb-accent-text); font-family: var(--tb-mono); font-size: 10px; }
/* A threshold (#114): a dashed rule in the tone it names, so a limit never reads as a series even where
   its tone shares a series colour, and a label haloed in the surface colour, drawn over the data. */
.tb-threshold { stroke: var(--tb-muted); stroke-width: 1.25; stroke-dasharray: 6 4; }
.tb-threshold[data-tone="warn"] { stroke: var(--tb-warn); }
.tb-threshold[data-tone="bad"] { stroke: var(--tb-bad); }
.tb-threshold[data-tone="good"] { stroke: var(--tb-good); }
.tb-threshold-label { fill: var(--tb-muted); font-family: var(--tb-mono); font-size: 10px; stroke: var(--tb-bg); stroke-width: 3; paint-order: stroke; }
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
.tb-chart-data { margin-top: 0.5rem; font-size: 0.8rem; }
/* 24px tall, the minimum target size (WCAG 2.5.8): at the text's own height it was 19px. */
.tb-chart-data summary { color: var(--tb-faint); cursor: pointer; min-height: 24px; line-height: 24px; }
.tb-chart-data table { margin-top: 0.5rem; }
`;

let sheet: CSSStyleSheet | undefined;

/**
 * Adopt the chart sheet into the shadow root a chart was just drawn into, once per root.
 *
 * ⚠️ Called on the next microtask, not inside `renderChart`: the renderer builds a detached figure and
 * the host inserts it afterwards, so only then does it have a root to adopt into. A microtask runs before
 * the browser paints, so the chart is never seen unstyled.
 */
export function adoptChartStyles(node: Node): void {
	queueMicrotask(() => {
		const root = node.getRootNode();
		if (!(root instanceof ShadowRoot)) return;
		if ("adoptedStyleSheets" in root && typeof CSSStyleSheet === "function") {
			try {
				sheet ??= (() => {
					const s = new CSSStyleSheet();
					s.replaceSync(CHART_STYLES);
					return s;
				})();
				if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
				return;
			} catch {
				// Fall through, as the runtime's own sheet does.
			}
		}
		if (root.querySelector("style[data-tb-chart]")) return;
		const style = document.createElement("style");
		style.setAttribute("data-tb-chart", "");
		style.textContent = CHART_STYLES;
		root.append(style);
	});
}
