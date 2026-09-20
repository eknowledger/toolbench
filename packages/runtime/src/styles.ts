/**
 * The stylesheet, inside a shadow root.
 *
 * Two consequences of that choice, and both are the point:
 *
 *  - **The host's CSS cannot reach in, and ours cannot leak out.** A tool looks the same in a
 *    Tailwind site, a Bootstrap site and a hand-written page, and it cannot break any of them.
 *  - **Theming is therefore explicit.** Every colour, radius and font here reads a custom property
 *    with a sensible default. Custom properties *do* cross the shadow boundary, so a host themes the
 *    whole thing by setting a dozen variables on `tool-host` — and needs to know nothing else.
 *
 * The defaults follow the page: `light-dark()` picks per the host's colour scheme, so a tool does not
 * glow white inside a dark site before anyone has configured anything.
 */
export const STYLES = /* css */ `
:host {
  /* ── Theming surface. A host overrides any of these on tool-host, and that is the whole API. ── */
  /* Light values first, as a plain fallback: a browser without light-dark() would otherwise drop the
     whole declaration and inherit whatever the page had, which looks broken rather than plain. The
     second declaration wins wherever the function is supported. */
  --tb-bg:        #ffffff;
  --tb-fg:        #1a1c22;
  --tb-muted:     #5c6270;
  --tb-faint:     #767d8c;
  --tb-border:    #e2e5ea;
  --tb-surface:   #f7f8fa;
  --tb-accent:    #8a5a00;
  --tb-accent-bg: #fff6e6;
  --tb-bad:       #a3242c;
  --tb-warn:      #8a5a00;
  --tb-good:      #1c6b3c;
  --tb-bg:        light-dark(#ffffff, #16171d);
  --tb-fg:        light-dark(#1a1c22, #e7e9ee);
  --tb-muted:     light-dark(#5c6270, #9aa1b1);
  --tb-faint:     light-dark(#767d8c, #7c8494);
  --tb-border:    light-dark(#e2e5ea, #2b2e38);
  --tb-surface:   light-dark(#f7f8fa, #1c1e26);
  --tb-accent:    light-dark(#8a5a00, #f0b040);
  --tb-accent-bg: light-dark(#fff6e6, #2a2113);
  --tb-bad:       light-dark(#a3242c, #f08b8b);
  --tb-warn:      light-dark(#8a5a00, #e5b567);
  --tb-good:      light-dark(#1c6b3c, #74c98d);
  --tb-radius:    10px;
  --tb-font:      system-ui, -apple-system, "Segoe UI", sans-serif;
  --tb-mono:      ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  --tb-gap:       0.75rem;
  /* A host styles the deprecated/retired marker by setting these on tool-host. Shadow CSS
     cannot be reached from outside, so the tokens are the hook. */
  --tb-mark-fg:   var(--tb-warn);
  --tb-mark-bg:   var(--tb-accent-bg);

  /* Series colours. Six, then they repeat — a chart needing seven is a chart needing a rethink. */
  --tb-s1: #8a5a00; --tb-s2: #5b3fa8; --tb-s3: #0f6e6e;
  --tb-s4: #1f5aa8; --tb-s5: #a02a5e; --tb-s6: #2d6b32;
  --tb-s1: light-dark(#8a5a00, #e0b877);
  --tb-s2: light-dark(#5b3fa8, #c4a5f0);
  --tb-s3: light-dark(#0f6e6e, #7fd1d1);
  --tb-s4: light-dark(#1f5aa8, #8ec4f0);
  --tb-s5: light-dark(#a02a5e, #f0a5c0);
  --tb-s6: light-dark(#2d6b32, #8fd6a8);

  display: block;
  color: var(--tb-fg);
  font-family: var(--tb-font);
  font-size: 15px;
  line-height: 1.5;
  container-type: inline-size;
}
:host([hidden]) { display: none; }
* { box-sizing: border-box; }

.tb {
  background: var(--tb-bg);
  border: 1px solid var(--tb-border);
  border-radius: var(--tb-radius);
  overflow: hidden;
  /* A query container, so a chart can size its labels against the CARD rather than the viewport. */
  container-type: inline-size;
}
/* Embedded in prose: no frame competing with the surrounding text. */
:host([mode="embed"]) .tb { border-radius: var(--tb-radius); background: var(--tb-surface); }

.tb-head { padding: 0.875rem 1rem 0; }
.tb-name { margin: 0; font-size: 1.05rem; font-weight: 650; letter-spacing: -0.01em; }
.tb-name a {
  color: inherit;
  text-decoration: none;
  /* WCAG 2.5.8: the text metrics alone are about 20px tall. A little block padding
     and a 24px floor grow the hit target into the head's existing room. Applies
     for every mode that uses a title link, not only compact. */
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding-block: 2px;
}
.tb-name a:hover, .tb-name a:focus-visible { color: var(--tb-accent); text-decoration: underline; }
.tb-blurb { margin: 0.25rem 0 0; color: var(--tb-muted); font-size: 0.9rem; }
.tb-title { display: flex; align-items: center; flex-wrap: wrap; gap: 0.4rem 0.55rem; }
.tb-mark {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  color: var(--tb-mark-fg);
  background: var(--tb-mark-bg);
  border: 1px solid var(--tb-mark-fg);
}
.tb-retired { margin: 0; color: var(--tb-muted); font-size: 0.9rem; }

.tb-body { padding: 0.875rem 1rem 1rem; display: grid; gap: var(--tb-gap); }

/* ── the form ─────────────────────────────────────────────────────────────────────────────── */
.tb-form { display: grid; gap: 0.625rem; margin: 0; border: 0; padding: 0; }
.tb-field-row { display: grid; gap: 0.25rem; }
.tb-label { font-size: 0.82rem; font-weight: 600; color: var(--tb-muted); }
.tb-unit { font-weight: 400; color: var(--tb-faint); }
.tb-desc { margin: 0; font-size: 0.78rem; color: var(--tb-faint); }
.tb-input, .tb-textarea, .tb-select {
  width: 100%;
  font: inherit;
  font-size: 0.9rem;
  color: var(--tb-fg);
  background: var(--tb-surface);
  border: 1px solid var(--tb-border);
  border-radius: 8px;
  padding: 0.4375rem 0.5625rem;
}
.tb-textarea { font-family: var(--tb-mono); font-size: 0.82rem; resize: vertical; min-height: 4.5rem; }
.tb-input[type="number"] { font-family: var(--tb-mono); }
.tb-input:focus-visible, .tb-textarea:focus-visible, .tb-select:focus-visible, .tb-run:focus-visible, .tb-facade:focus-visible, .tb-sample:focus-visible {
  outline: 2px solid var(--tb-accent);
  outline-offset: 2px;
}
.tb-input[aria-invalid="true"], .tb-textarea[aria-invalid="true"] { border-color: var(--tb-bad); }
.tb-toggle-row { display: flex; align-items: center; gap: 0.5rem; }
.tb-actions { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
.tb-run {
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--tb-bg);
  background: var(--tb-accent);
  border: 0;
  border-radius: 8px;
  padding: 0.4375rem 0.875rem;
  cursor: pointer;
}
.tb-run[disabled] { opacity: 0.5; cursor: default; }
/* Set while a result is stale, so the button that resolves it is the thing that draws the eye.
   A ring is the :focus-visible vocabulary on this same button. After a sample click the pill
   keeps focus and Run asks to be pressed, so two rings on screen read as two foci. A fill is a
   different language, and it is paint, so prefers-reduced-motion still sees it.
   The fill moves AWAY from the page behind it, darker on white and paler on near-black, so it
   gains contrast against the surface. Disabled goes the other way, toward the background, which
   is what keeps the two apart.
   ⚠️ Do not set outline or box-shadow here. Equal specificity would hide :focus-visible, and
   a halo is the same family as the focus ring regardless of how it is drawn. */
.tb-run[data-attention] {
  /* Light value first, as a plain fallback, matching the tokens at the top of this file: without
     it a browser that has color-mix but not light-dark() drops the declaration and shows no cue
     at all, which is the one outcome worse than a ring. */
  background: color-mix(in oklab, var(--tb-accent) 70%, black);
  background: light-dark(
    color-mix(in oklab, var(--tb-accent) 70%, black),
    color-mix(in oklab, var(--tb-accent) 62%, white)
  );
}

/* Quieter than the filled accent of .tb-run on purpose: a sample fills the form, it does not run the
   tool. No margin: the .tb-body grid already spaces its children. */
.tb-samples { display: flex; align-items: center; flex-wrap: wrap; gap: 0.375rem; }
.tb-samples-label { font-size: 0.82rem; font-weight: 600; color: var(--tb-muted); }
.tb-sample {
  font: inherit;
  font-size: 0.78rem;
  padding: 0.2rem 0.55rem;
  color: var(--tb-fg);
  background: var(--tb-surface);
  border: 1px solid var(--tb-border);
  border-radius: 999px;
  cursor: pointer;
}
.tb-sample:hover { border-color: var(--tb-accent); color: var(--tb-accent); }

.tb-progress[hidden] { display: none; }
.tb-progress {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--tb-border);
  overflow: hidden;
  min-width: 4rem;
}
.tb-progress > i { display: block; height: 100%; background: var(--tb-accent); transition: width 0.12s linear; }
@media (prefers-reduced-motion: reduce) {
  .tb-progress > i { transition: none; }
}

/* ── status and output ────────────────────────────────────────────────────────────────────── */
.tb-status {
  margin: 0;
  font-size: 0.78rem;
  color: var(--tb-faint);
  font-family: var(--tb-mono);
  min-height: 1.2em;
}
/* An empty status must take no room: after a run it is cleared, and a blank line above a result reads
   as a rendering bug. */
.tb-status:empty { display: none; }
.tb-output { display: grid; gap: 0.75rem; }
.tb-output[data-state="running"] { opacity: 0.65; }
/* The form no longer matches what is on screen. Dimmed rather than cleared: the previous answer is
   still the last true one, and throwing it away loses the comparison the reader was making. */
.tb-output[data-stale] { opacity: 0.45; }

.tb-fields, .tb-field-group dl { margin: 0; display: grid; gap: 0.375rem; }
.tb-field { display: grid; grid-template-columns: minmax(6rem, 34%) 1fr; gap: 0.75rem; align-items: baseline; }
.tb-field dt { color: var(--tb-muted); font-size: 0.82rem; }
.tb-field dd { margin: 0; font-family: var(--tb-mono); font-size: 0.85rem; word-break: break-word; }
.tb-field[data-tone="bad"] dd .tb-value { color: var(--tb-bad); }
.tb-field[data-tone="warn"] dd .tb-value { color: var(--tb-warn); }
.tb-field[data-tone="good"] dd .tb-value { color: var(--tb-good); }
.tb-note { color: var(--tb-faint); margin-left: 0.5ch; }
.tb-field-group h4 { margin: 0.5rem 0 0.25rem; font-size: 0.75rem; text-transform: none; color: var(--tb-faint); font-weight: 600; }
.tb-more { margin: 0; font-size: 0.78rem; color: var(--tb-faint); }

/* The disclosure that replaces .tb-more when a host asks for more="expand".
   Matched to .tb-more's size and colour on purpose: it sits where that line sat, and a truncation
   notice that suddenly became a loud button would redraw the reader's eye to the least interesting
   part of the result.
   min-height is 24px for WCAG 2.5.8, and it is the reason for the padding rather than the text
   metrics: at 0.78rem the label alone is about 15px tall, which is the same miss #64 fixed on the
   card title link. */
.tb-disclose {
  display: inline-flex; align-items: center; gap: 0.4rem;
  min-height: 24px; padding: 0.15rem 0.5rem 0.15rem 0.35rem;
  font: inherit; font-size: 0.78rem; color: var(--tb-faint);
  background: none; border: 1px solid transparent; border-radius: 999px; cursor: pointer;
}
.tb-disclose::before {
  content: ""; width: 0; height: 0;
  border-left: 4px solid currentColor;
  border-top: 4px solid transparent; border-bottom: 4px solid transparent;
  transition: transform 120ms ease;
}
.tb-disclose[aria-expanded="true"]::before { transform: rotate(90deg); }
.tb-disclose:hover { color: var(--tb-fg); border-color: var(--tb-border); }
.tb-disclose:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
/* The marker is decoration. A reader who has asked for less motion gets the state from the label
   and from aria-expanded, both of which say it outright. */
@media (prefers-reduced-motion: reduce) { .tb-disclose::before { transition: none; } }

.tb-out-text p { margin: 0; }
.tb-mono, .tb-out-text pre, .tb-out-code pre { font-family: var(--tb-mono); font-size: 0.82rem; }
.tb-out-text pre, .tb-out-code pre {
  margin: 0; padding: 0.625rem 0.75rem; overflow-x: auto;
  background: var(--tb-surface); border: 1px solid var(--tb-border); border-radius: 8px;
}
.tb-out-code code { font: inherit; }

.tb-out-table { overflow-x: auto; }
.tb-out-table table, .tb-chart-data table { border-collapse: collapse; width: 100%; font-size: 0.84rem; }
.tb-out-table caption, .tb-chart-data caption { text-align: start; color: var(--tb-faint); font-size: 0.78rem; padding-bottom: 0.375rem; }
.tb-out-table th, .tb-out-table td, .tb-chart-data th, .tb-chart-data td {
  text-align: start; padding: 0.3125rem 0.5rem; border-bottom: 1px solid var(--tb-border);
}
.tb-out-table th { color: var(--tb-muted); font-size: 0.78rem; font-weight: 600; }
.tb-out-table td[data-align="end"], .tb-out-table th[data-align="end"] { text-align: end; }
.tb-out-table td[data-tone="bad"] { color: var(--tb-bad); }
.tb-out-table td[data-tone="warn"] { color: var(--tb-warn); }

.tb-out-error {
  display: flex; gap: 0.5rem; align-items: baseline;
  padding: 0.5rem 0.6875rem;
  background: #fdf2f2;
  background: light-dark(#fdf2f2, #2a1a1c);
  border: 1px solid var(--tb-bad);
  border-radius: 8px;
  font-size: 0.86rem;
}
.tb-error-icon {
  flex: 0 0 auto; width: 1.05rem; height: 1.05rem; border-radius: 50%;
  background: var(--tb-bad); color: var(--tb-bg);
  font-size: 0.72rem; font-weight: 700; line-height: 1.05rem; text-align: center;
}
.tb-at { color: var(--tb-faint); font-family: var(--tb-mono); font-size: 0.78rem; }

.tb-unknown {
  padding: 0.75rem; border: 1px dashed var(--tb-border); border-radius: 8px;
  background: var(--tb-surface); font-size: 0.86rem;
}
.tb-unknown p { margin: 0.25rem 0 0; color: var(--tb-muted); }

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
.tb-annotation-label { fill: var(--tb-accent); font-family: var(--tb-mono); font-size: 10px; }
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
.tb-bar  { stroke: none; fill: var(--c); opacity: 0.85; }
.tb-legend { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0.5rem 0 0; padding: 0; list-style: none; font-size: 0.78rem; color: var(--tb-muted); }
.tb-legend li { display: flex; align-items: center; gap: 0.375rem; }
.tb-swatch { width: 0.75rem; height: 0.1875rem; border-radius: 2px; background: var(--c, currentColor); }
.tb-chart-data { margin-top: 0.5rem; font-size: 0.8rem; }
.tb-chart-data summary { color: var(--tb-faint); cursor: pointer; }
.tb-chart-data table { margin-top: 0.5rem; }

/* ── bytes ────────────────────────────────────────────────────────────────────────────────── */
.tb-out-bytes { margin: 0; }
.tb-bytes-caption { color: var(--tb-faint); font-size: 0.78rem; padding-bottom: 0.375rem; }
.tb-bytes-grid {
  font-family: var(--tb-mono); font-size: 0.78rem; line-height: 1.6;
  background: var(--tb-surface); border: 1px solid var(--tb-border); border-radius: 8px;
  padding: 0.5rem 0.625rem; overflow-x: auto;
}
/* ⚠️ ONE grid for the whole dump, with the rows as display:contents.
   Each row being its own grid was the first version, and the columns then sized per row: a final row
   with three bytes had a narrower hex column, so its ASCII gutter sat several characters left of the
   row above. A hex dump whose columns shift is not a hex dump. */
.tb-bytes-grid-inner { display: grid; grid-template-columns: auto auto auto; gap: 0 0.875rem; justify-content: start; }
.tb-bytes-row { display: contents; }
.tb-bytes-offset, .tb-bytes-hex, .tb-bytes-ascii { white-space: pre; }
.tb-bytes-offset { color: var(--tb-faint); }
.tb-bytes-hex .tb-byte + .tb-byte { margin-left: 0.5ch; }
.tb-bytes-ascii { color: var(--tb-muted); }
/* Tone marks a byte's range. The background carries it rather than the text colour, because two hex
   digits are too small a target to read a colour from.
   ⚠️ The normal tone gets a SOLID accent, not the wash. The wash (--tb-accent-bg) was the first choice and
   it is nearly the surface colour: every two and three-byte highlight was invisible, and only the one
   range that happened to carry a tone showed up at all. */
.tb-byte[data-tone] { border-radius: 2px; }
.tb-byte[data-tone="normal"] { background: var(--tb-accent); color: var(--tb-bg); }
.tb-byte[data-tone="good"]   { background: var(--tb-good); color: var(--tb-bg); }
.tb-byte[data-tone="warn"]   { background: var(--tb-warn); color: var(--tb-bg); }
.tb-byte[data-tone="bad"]    { background: var(--tb-bad); color: var(--tb-bg); }
.tb-bytes-legend {
  display: flex; flex-wrap: wrap; gap: 0.75rem;
  margin: 0.5rem 0 0; padding: 0; list-style: none;
  font-size: 0.78rem; color: var(--tb-muted);
}
.tb-bytes-legend li { display: flex; align-items: center; gap: 0.375rem; }
.tb-bytes-swatch { width: 0.75rem; height: 0.75rem; border-radius: 2px; background: var(--tb-accent); }
.tb-bytes-legend li[data-tone="good"] .tb-bytes-swatch { background: var(--tb-good); }
.tb-bytes-legend li[data-tone="warn"] .tb-bytes-swatch { background: var(--tb-warn); }
.tb-bytes-legend li[data-tone="bad"]  .tb-bytes-swatch { background: var(--tb-bad); }

/* ── the facade: a card before it is activated ────────────────────────────────────────────── */
.tb-facade {
  display: block; width: 100%; text-align: start;
  font: inherit; color: inherit; background: none; border: 0; padding: 0;
  cursor: pointer;
}
.tb-facade-hint {
  display: inline-flex; align-items: center; gap: 0.375rem;
  font-size: 0.8rem; font-weight: 600; color: var(--tb-accent);
}
.tb-facade-hint::before {
  content: ""; width: 0; height: 0;
  border-left: 6px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent;
}
.tb-facade:hover .tb-facade-hint { text-decoration: underline; }

.tb-foot { display: flex; gap: 0.875rem; flex-wrap: wrap; padding: 0 1rem 0.875rem; font-size: 0.8rem; }
.tb-foot a { color: var(--tb-accent); text-decoration: none; }
.tb-foot a:hover { text-decoration: underline; }

/* Screen-reader-only, for the announcements that should not take space. */
.tb-sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}

@container (max-width: 30rem) {
  .tb-field { grid-template-columns: 1fr; gap: 0; }
}
`;

/**
 * Adopt the stylesheet into a shadow root.
 *
 * `adoptedStyleSheets` shares one parsed sheet across every instance on the page, which matters when
 * a page holds a dozen cards. The `<style>` fallback is for anything that lacks it.
 */
export function applyStyles(root: ShadowRoot): void {
	if ("adoptedStyleSheets" in root && typeof CSSStyleSheet === "function") {
		try {
			sheet ??= (() => {
				const s = new CSSStyleSheet();
				s.replaceSync(STYLES);
				return s;
			})();
			root.adoptedStyleSheets = [sheet];
			return;
		} catch {
			// Fall through: some environments expose the API and refuse construction.
		}
	}
	const style = document.createElement("style");
	style.textContent = STYLES;
	root.append(style);
}

let sheet: CSSStyleSheet | undefined;
