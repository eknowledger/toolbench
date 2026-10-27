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
 *
 * ⚠️ Everything is inside `@layer toolbench`, and that is the guarantee STYLING.md makes to a host: any
 * rule a host adopts into the root outside a layer wins over every rule here, whatever its specificity.
 * Sheet order alone was not enough. A host sheet after this one still lost to `td[data-align="end"]`
 * when it wrote the natural `.tb-out-table td { text-align: start }`, so stacked table rows kept half
 * their cells pinned to the right edge.
 */
export const STYLES = /* css */ `
@layer toolbench {
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
  /* The accent as TEXT. A fill wants a bright accent and small text needs 4.5:1 on the surface, and for
     an amber no single value is both: #d97706 is 3.19:1 on white. Defaults to the accent, so a host that
     sets only --tb-accent sees no change. */
  --tb-accent-text: var(--tb-accent);
  /* Text ON an accent fill: the Run button's label, a marked byte. It was the surface colour, white on a
     light page, which is 3.18:1 on #d97706; a bright accent wants dark text instead, black being 9.78:1
     on #f59e0b. Defaults to the surface, so nothing changes unless a host sets it. */
  --tb-accent-ink: var(--tb-bg);
  /* The form's colours (#224), so one input can be recoloured through its row. Today's values by default. */
  --tb-input-bg: var(--tb-surface);
  --tb-input-border: var(--tb-border);
  --tb-input-fg: var(--tb-fg);
  --tb-desc-fg: var(--tb-faint);

  /* Series colours. A chart uses six, then they repeat: a chart needing seven is a chart needing a
     rethink. A graph's categories can name all eight, because seven teams in a dependency graph are not. */
  --tb-s1: #8a5a00; --tb-s2: #5b3fa8; --tb-s3: #0f6e6e;
  --tb-s4: #1f5aa8; --tb-s5: #a02a5e; --tb-s6: #2d6b32;
  --tb-s1: light-dark(#8a5a00, #e0b877);
  --tb-s2: light-dark(#5b3fa8, #c4a5f0);
  --tb-s3: light-dark(#0f6e6e, #7fd1d1);
  --tb-s4: light-dark(#1f5aa8, #8ec4f0);
  --tb-s5: light-dark(#a02a5e, #f0a5c0);
  --tb-s6: light-dark(#2d6b32, #8fd6a8);
  --tb-s7: #7a4e2d; --tb-s8: #4a5568;
  --tb-s7: light-dark(#7a4e2d, #e3b48f);
  --tb-s8: light-dark(#4a5568, #b9c3d1);

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
.tb-name a:hover, .tb-name a:focus-visible { color: var(--tb-accent-text); text-decoration: underline; }
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
.tb-desc { margin: 0; font-size: 0.78rem; color: var(--tb-desc-fg); }
/* Help text with markup (#217). Its blocks keep the one-line hint's tight rhythm rather than a page's. */
:is(div.tb-desc, .tb-details-body) > * { margin: 0; }
:is(div.tb-desc, .tb-details-body) > * + * { margin-top: 0.35rem; }
:is(.tb-desc, .tb-details-body) ul { padding-inline-start: 1.1rem; }
:is(.tb-desc, .tb-details-body) li + li { margin-top: 0.15rem; }
/* On one line, so code moves to the next line whole: 2026-10-25T14:30 broke after "2026-10-" at 390 (#203). Not
   an inline block, which did the same but left the full stop after it alone on the next line. Code in help is
   an identifier or a value; one longer than a phone's line belongs in a result. */
:is(.tb-desc, .tb-details-body) code { white-space: nowrap; font-family: var(--tb-mono); font-size: 0.95em; padding: 0 0.2em; border-radius: 4px; background: var(--tb-surface); border: 1px solid var(--tb-border); color: var(--tb-fg); }
:is(.tb-desc, .tb-details-body) strong { font-weight: 650; color: var(--tb-muted); }
/* A tone colours words the text already says, so colour is never the only carrier (WCAG 1.4.1), and the
   weight sets them apart for a reader who cannot tell the colours apart. Muted keeps the normal weight:
   in bold, a grey read as emphasis, the opposite of receding. */
:is(.tb-desc, .tb-details-body) [data-tone] { font-weight: 600; }
:is(.tb-desc, .tb-details-body) [data-tone="good"] { color: var(--tb-good); }
:is(.tb-desc, .tb-details-body) [data-tone="warn"] { color: var(--tb-warn); }
:is(.tb-desc, .tb-details-body) [data-tone="bad"] { color: var(--tb-bad); }
:is(.tb-desc, .tb-details-body) [data-tone="accent"] { color: var(--tb-accent-text); }
:is(.tb-desc, .tb-details-body) [data-tone="muted"] { color: var(--tb-faint); font-weight: inherit; }
/* An input's details (#215): a quiet disclosure under the hint, its marker drawn like .tb-disclose's. The
   summary is 24px tall for WCAG 2.5.8; the body is set off by a rule, not a box, so it reads as the hint's
   continuation. */
.tb-details { font-size: 0.78rem; color: var(--tb-desc-fg); }
.tb-details > summary { display: inline-flex; align-items: center; gap: 0.35rem; min-height: 24px; cursor: pointer; color: var(--tb-muted); list-style: none; border-radius: 6px; padding-inline-end: 0.25rem; }
.tb-details > summary::-webkit-details-marker { display: none; }
.tb-details > summary::before { content: ""; border-left: 4px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; transition: transform 120ms ease; }
.tb-details[open] > summary::before { transform: rotate(90deg); }
.tb-details > summary:hover { color: var(--tb-fg); }
.tb-details > summary:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
.tb-details-body { margin: 0.25rem 0 0.15rem; padding: 0.375rem 0 0.375rem 0.625rem; border-inline-start: 2px solid var(--tb-border); }
@media (prefers-reduced-motion: reduce) { .tb-details > summary::before { transition: none; } }
.tb-input, .tb-textarea, .tb-select {
  width: 100%;
  font: inherit;
  font-size: 0.9rem;
  color: var(--tb-input-fg);
  background: var(--tb-input-bg);
  border: 1px solid var(--tb-input-border);
  border-radius: 8px;
  padding: 0.4375rem 0.5625rem;
}
/* WebKit counts a select's clipped option text as overflow of .tb, which can then be scrolled (#194). */
.tb-select { contain: paint; }
.tb-textarea { font-family: var(--tb-mono); font-size: 0.82rem; resize: vertical; min-height: 4.5rem; }
/* A number, a date or time (#203): values a reader compares digit by digit. */
.tb-input:not([type="text"]) { font-family: var(--tb-mono); }
/* The output takes focus after a keyboard Run. Without it here it wore the browser's own blue ring (#99). */
.tb-input:focus-visible, .tb-textarea:focus-visible, .tb-select:focus-visible, .tb-run:focus-visible, .tb-reset:focus-visible, .tb-share:focus-visible, .tb-facade-hint:focus-visible, .tb-sample:focus-visible, .tb-output:focus-visible {
  outline: 2px solid var(--tb-accent);
  outline-offset: 2px;
}
.tb-input[aria-invalid="true"], .tb-textarea[aria-invalid="true"], .tb-select[aria-invalid="true"] { border-color: var(--tb-bad); }
.tb-toggle-row { display: flex; align-items: center; gap: 0.5rem; }
/* A slider takes the width and the number box keeps its own, so the value always shows beside the track. */
.tb-slider-row { display: flex; align-items: center; gap: 0.75rem; }
.tb-slider-row .tb-input { width: 7rem; flex: none; }
.tb-slider { flex: 1; min-width: 0; min-height: 24px; accent-color: var(--tb-accent); }
.tb-slider:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
.tb-actions { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
.tb-run, .tb-reset {
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--tb-accent-ink);
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

/* Reset (#208): Run's size and shape, outlined instead of filled, so the two read as a pair and the one
   that runs the tool still draws the eye. The border is inside the box, hence the 1px off Run's padding:
   without it Reset stood taller than Run beside it. */
.tb-reset { color: var(--tb-fg); background: none; border: 1px solid var(--tb-border); padding: calc(0.4375rem - 1px) 0.875rem; }
.tb-reset:hover { border-color: var(--tb-muted); }
/* The share button's rules live in its chunk (share.ts), adopted when it is wired (#227). */

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
.tb-sample:hover { border-color: var(--tb-accent); color: var(--tb-accent-text); }

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
  overflow-wrap: anywhere;
}
/* An empty status must take no room: after a run it is cleared, and a blank line above a result reads
   as a rendering bug. */
.tb-status:empty { display: none; }
.tb-output { display: grid; gap: 0.75rem; }
/* Grid items default to min-width: auto, so the widest result set the track: at 390px a six-column
   table made the tool 402px wide inside a 348px frame, and the card clipped the rest (#154). With
   this the table scrolls inside its own box.
   ⚠️ Every child too: a graph, code or a hex dump is not itself a scroller, so it grew and was clipped (#194). */
.tb-group, .tb-body > *, .tb-output > * { min-width: 0; }
.tb-output[data-state="running"] { opacity: 0.65; }
/* The form no longer matches what is on screen. Dimmed rather than cleared: the previous answer is
   still the last true one, and throwing it away loses the comparison the reader was making. */
.tb-output[data-stale] { opacity: 0.45; }

.tb-fields, .tb-field-group dl { margin: 0; display: grid; gap: 0.375rem; }
.tb-field { display: grid; grid-template-columns: minmax(6rem, 34%) 1fr; gap: 0.75rem; align-items: baseline; }
.tb-field dt { color: var(--tb-muted); font-size: 0.82rem; }
/* The face comes from .tb-mono, which the dd carries unless the field says mono: false (#209). The size
   stays here and outranks .tb-mono's 0.82rem, so an address and a sentence in one list share a size. */
.tb-field dd { margin: 0; font-size: 0.85rem; word-break: break-word; }
.tb-field[data-tone="bad"] dd .tb-value { color: var(--tb-bad); }
.tb-field[data-tone="warn"] dd .tb-value { color: var(--tb-warn); }
.tb-field[data-tone="good"] dd .tb-value { color: var(--tb-good); }
.tb-field[data-tone="muted"] dd .tb-value { color: var(--tb-faint); }
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

.tb-out-text p { margin: 0; overflow-wrap: anywhere; }
.tb-mono, .tb-out-text pre, .tb-out-code pre { font-family: var(--tb-mono); font-size: 0.82rem; }
.tb-out-text pre, .tb-out-code pre {
  margin: 0; padding: 0.625rem 0.75rem; overflow-x: auto;
  background: var(--tb-surface); border: 1px solid var(--tb-border); border-radius: 8px;
}
.tb-out-code code { font: inherit; }
/* The Copy action (#155): under the block, at the end, in the disclosure's quiet vocabulary so it does
   not compete with the result. 24px for WCAG 2.5.8. Sticky inside a table's scroller, or a wide table
   scrolled sideways would take the button out of view with it. */
.tb-copy-bar {
  display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem;
  margin-top: 0.375rem; position: sticky; inset-inline-start: 0;
}
.tb-copy {
  min-height: 24px; padding: 0.15rem 0.6rem;
  font: inherit; font-size: 0.78rem; color: var(--tb-muted);
  background: var(--tb-bg); border: 1px solid var(--tb-border); border-radius: 999px; cursor: pointer;
}
/* The table's root is its scroller, which clipped the focus ring's right and bottom edges. 4px is the ring. */
.tb-out-table .tb-copy-bar { padding: 0 4px 4px; }
.tb-copy:hover:enabled { color: var(--tb-fg); border-color: var(--tb-muted); }
.tb-copy:disabled { opacity: 0.6; cursor: default; }
.tb-copy:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
.tb-copy-note { font-size: 0.78rem; color: var(--tb-muted); }

/* Edge shadows while more scrolls (#214): local covers hide each at its end. Covers match the frame. */
.tb-out-table{overflow-x:auto;--tb-scroll-bg:var(--tb-bg);--s:color-mix(in oklab,var(--tb-fg) 28%,transparent);background:linear-gradient(90deg,var(--tb-scroll-bg) 40%,#0000) left/1.5rem 100% no-repeat local,linear-gradient(270deg,var(--tb-scroll-bg) 40%,#0000) right/1.5rem 100% no-repeat local,radial-gradient(farthest-side at 0,var(--s),#0000) left/.875rem 100% no-repeat,radial-gradient(farthest-side at 100%,var(--s),#0000) right/.875rem 100% no-repeat}
:host([mode="embed"]) .tb-out-table{--tb-scroll-bg:var(--tb-surface)}
.tb-out-table table, .tb-chart-data table { border-collapse: collapse; width: 100%; font-size: 0.84rem; }
.tb-out-table caption, .tb-chart-data caption { text-align: start; color: var(--tb-faint); font-size: 0.78rem; padding-bottom: 0.375rem; }
.tb-out-table th, .tb-out-table td, .tb-chart-data th, .tb-chart-data td {
  text-align: start; padding: 0.3125rem 0.5rem; border-bottom: 1px solid var(--tb-border);
}
.tb-out-table th { color: var(--tb-muted); font-size: 0.78rem; font-weight: 600; }
.tb-out-table td[data-align="end"], .tb-out-table th[data-align="end"] { text-align: end; }
/* A row header (#214) is the row's name. Before the tones, which reach it at equal specificity. */
.tb-out-table th[scope=row]{color:var(--tb-fg);font-size:inherit}
.tb-out-table th[scope=row][data-align=end]{text-align:end}
.tb-out-table tr > [data-tone="bad"] { color: var(--tb-bad); }
/* A row a chart's readout is on (#124), in a table linked to it: a wash and a rule, never colour alone. */
.tb-out-table tr.tb-hot > * { background: var(--tb-accent-bg); }
.tb-out-table tr.tb-hot > :first-child { box-shadow: inset 3px 0 0 var(--tb-accent); }
.tb-out-table tr > [data-tone="warn"] { color: var(--tb-warn); }
/* good matched a field value and was unstyled on a cell (#156); muted lets the routine cells recede. */
.tb-out-table tr > [data-tone="good"] { color: var(--tb-good); }
.tb-out-table tr > [data-tone="muted"] { color: var(--tb-faint); }
/* The narrow layout (#213, #214), only where data-wrap says which cells are prose. width, not only a floor,
   or prose ran on one line. :where so the linked-row wash still reaches a sticky row header. */
@container (max-width:34rem){
.tb-out-table table:has([data-wrap]){width:max-content;min-width:100%}
.tb-out-table table:has([data-wrap]) thead th,.tb-out-table [data-wrap=none]{white-space:nowrap}
.tb-out-table [data-wrap=prose]{min-width:20ch;width:26ch}
.tb-out-table table:has([data-wrap]) caption{position:sticky;inset-inline-start:0;max-width:calc(100cqi - 2rem)}
.tb-out-table :where(tbody th[scope=row],thead th[data-row-header]){position:sticky;inset-inline-start:0;z-index:1;background:var(--tb-scroll-bg);box-shadow:inset -1px 0 0 var(--tb-border)}
}

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
.tb-error-message { min-width: 0; overflow-wrap: anywhere; }
.tb-nowrap { white-space: nowrap; }
.tb-at { color: var(--tb-faint); font-family: var(--tb-mono); font-size: 0.78rem; }

.tb-unknown {
  padding: 0.75rem; border: 1px dashed var(--tb-border); border-radius: 8px;
  background: var(--tb-surface); font-size: 0.86rem;
}
.tb-unknown p { margin: 0.25rem 0 0; color: var(--tb-muted); }

/* The chart rules live in the chart chunk (render/chart-styles.ts), adopted when a chart is first drawn,
   so a tool page with no chart does not download them. */

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
.tb-byte[data-tone="normal"] { background: var(--tb-accent); color: var(--tb-accent-ink); }
.tb-byte[data-tone="good"]   { background: var(--tb-good); color: var(--tb-bg); }
.tb-byte[data-tone="warn"]   { background: var(--tb-warn); color: var(--tb-bg); }
.tb-byte[data-tone="bad"]    { background: var(--tb-bad); color: var(--tb-bg); }
/* An untoned range in the next series colour (#148), after the tone rules so it beats "normal" at equal
   specificity. The page colour as text: the light series are dark and the dark series light, and every
   pairing measured 5.58:1 or better in both themes. --_tb-range is private, not a theming token. */
.tb-out-bytes [data-series="1"] { --_tb-range: var(--tb-s1); }
.tb-out-bytes [data-series="2"] { --_tb-range: var(--tb-s2); }
.tb-out-bytes [data-series="3"] { --_tb-range: var(--tb-s3); }
.tb-out-bytes [data-series="4"] { --_tb-range: var(--tb-s4); }
.tb-out-bytes [data-series="5"] { --_tb-range: var(--tb-s5); }
.tb-out-bytes [data-series="6"] { --_tb-range: var(--tb-s6); }
.tb-byte[data-series] { background: var(--_tb-range); color: var(--tb-bg); }
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
.tb-bytes-legend li[data-series] .tb-bytes-swatch { background: var(--_tb-range); }

/* ── the facade: a card before it is activated ────────────────────────────────────────────── */
/* Ordinary content, clickable as a whole; the hint inside it is the button (#98, #105). */
.tb-facade { cursor: pointer; }
.tb-facade-hint {
  display: inline-flex; align-items: center; gap: 0.375rem;
  font-size: 0.8rem; font-weight: 600; color: var(--tb-accent-text);
}
/* The hint as a button: no button chrome, and a 24px target (WCAG 2.5.8). */
button.tb-facade-hint {
  font-family: inherit; background: none; border: 0; padding: 0; margin: 0;
  min-height: 24px; cursor: pointer;
  /* The card body is a grid, which would stretch the button, and its focus ring, across the card. */
  justify-self: start;
}
.tb-facade-hint::before {
  content: ""; width: 0; height: 0;
  border-left: 6px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent;
}
.tb-facade:hover .tb-facade-hint { text-decoration: underline; }

.tb-foot { display: flex; gap: 0.875rem; flex-wrap: wrap; padding: 0 1rem 0.875rem; font-size: 0.8rem; }
.tb-foot a { color: var(--tb-accent-text); text-decoration: none; }
.tb-foot a:hover { text-decoration: underline; }

/* Screen-reader-only, for the announcements that should not take space. */
.tb-sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}

@container (max-width: 30rem) {
  .tb-field { grid-template-columns: 1fr; gap: 0; }
}
}
`;

/**
 * Adopt the stylesheet into a shadow root.
 *
 * `adoptedStyleSheets` shares one parsed sheet across every instance on the page, which matters when
 * a page holds a dozen cards. The `<style>` fallback is for anything that lacks it.
 *
 * Safe to call on every paint: it changes nothing when the sheet is already in place.
 */
export function applyStyles(root: ShadowRoot): void {
	if ("adoptedStyleSheets" in root && typeof CSSStyleSheet === "function") {
		try {
			sheet ??= (() => {
				const s = new CSSStyleSheet();
				s.replaceSync(STYLES);
				return s;
			})();
			adopt(root, sheet);
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

/** Every sheet the runtime has adopted, which is how a host's sheets are told apart from ours. */
const ours = new WeakSet<CSSStyleSheet>();

/**
 * Put one of the runtime's sheets into `root`: the main sheet first, any other runtime sheet after the
 * runtime's own, and every sheet a host adopted after all of them, kept.
 *
 * ⚠️ Never assign a fresh list here. Assigning `[sheet]` deleted any sheet a host had adopted, and the
 * old guard, "only install while the list is empty", meant a host sheet that arrived first left the tool
 * drawn with none of the runtime's rules: only the host's sheet was in the list. Host
 * sheets go last so that a host rule wins over ours at equal specificity, which a chart sheet appended
 * after them would quietly undo.
 */
export function adopt(root: ShadowRoot, s: CSSStyleSheet): void {
	ours.add(s);
	const list = root.adoptedStyleSheets;
	const rest = list.filter((x) => x !== s);
	const runtime = rest.filter((x) => ours.has(x));
	setSheets(root, [...(s === sheet ? [s, ...runtime] : [...runtime, s]), ...rest.filter((x) => !ours.has(x))]);
}

// Only when something moved: this runs on every paint, and an equal list needs no new assignment.
function setSheets(root: ShadowRoot, next: CSSStyleSheet[]): void {
	const list = root.adoptedStyleSheets;
	if (next.length !== list.length || next.some((x, i) => x !== list[i])) root.adoptedStyleSheets = next;
}

/** One host stylesheet: a parsed sheet, or CSS text the runtime parses once and shares. */
export type HostSheet = CSSStyleSheet | string;

/**
 * The `styles` a host passes to `defineToolHost` or `setHostStyles`: one sheet, a list, or a map from
 * tool id to sheets, where `"*"` applies to every tool and comes before the tool's own.
 */
export type HostStyles = HostSheet | readonly HostSheet[] | { readonly [toolId: string]: HostSheet | readonly HostSheet[] };

const asList = (v: HostSheet | readonly HostSheet[] | undefined): HostSheet[] => (v === undefined ? [] : Array.isArray(v) ? [...v] : [v as HostSheet]);

/** The host sheets one tool gets, in order. */
export function hostSheetsFor(styles: HostStyles | undefined, toolId: string): HostSheet[] {
	if (styles === undefined || typeof styles === "string" || Array.isArray(styles)) return asList(styles as HostSheet | HostSheet[] | undefined);
	if (typeof CSSStyleSheet === "function" && styles instanceof CSSStyleSheet) return [styles];
	const map = styles as { readonly [toolId: string]: HostSheet | readonly HostSheet[] };
	return [...asList(map["*"]), ...asList(map[toolId])];
}

/** Sheets that came from the `styles` option, so a later call can replace them and nothing else. */
const given = new WeakSet<CSSStyleSheet>();
const parsed = new Map<string, CSSStyleSheet>();

/**
 * Put the host's `styles` into `root`, after every sheet already there, replacing the ones a previous
 * call put in. A sheet a page adopted by hand is left where it is.
 *
 * Where adopted sheets are unavailable, the runtime's own sheet is a `<style>` element, and so is each
 * of these, appended after it so the order, and so the cascade, is the same.
 */
export function applyHostStyles(root: ShadowRoot, wanted: readonly HostSheet[]): void {
	if (sheet && root.adoptedStyleSheets?.includes(sheet)) {
		const sheets = wanted.map((w) => {
			if (typeof w !== "string") return w;
			let s = parsed.get(w);
			if (!s) {
				s = new CSSStyleSheet();
				s.replaceSync(w);
				parsed.set(w, s);
			}
			return s;
		});
		for (const s of sheets) given.add(s);
		setSheets(root, [...root.adoptedStyleSheets.filter((x) => !given.has(x)), ...sheets]);
		return;
	}
	for (const old of root.querySelectorAll("style[data-tb-host]")) old.remove();
	for (const w of wanted) {
		const style = document.createElement("style");
		style.setAttribute("data-tb-host", "");
		style.textContent = typeof w === "string" ? w : [...w.cssRules].map((r) => r.cssText).join("\n");
		root.append(style);
	}
}

const sheets = new Map<string, CSSStyleSheet>();

/**
 * Adopt a named sheet into the shadow root `node` is drawn into, once per root: how a renderer in a chunk of
 * its own brings its rules (the chart kinds, the graph kind).
 *
 * ⚠️ Called on the next microtask, not inside the renderer: a renderer builds a detached figure and the host
 * inserts it afterwards, so only then does it have a root to adopt into. A microtask runs before the browser
 * paints, so the figure is never seen unstyled. It does assume the figure is attached by then, which the
 * element does synchronously; a caller that awaits between rendering and inserting must adopt again after.
 */
export function adoptStyles(node: Node, name: string, rules: () => string): void {
	// In the runtime's layer, like its main sheet, so a host's unlayered rule beats a chart's too.
	const css = () => `@layer toolbench{${rules()}}`;
	queueMicrotask(() => {
		const root = node.getRootNode();
		if (!(root instanceof ShadowRoot)) return;
		if ("adoptedStyleSheets" in root && typeof CSSStyleSheet === "function") {
			try {
				let sheet = sheets.get(name);
				if (!sheet) {
					sheet = new CSSStyleSheet();
					sheet.replaceSync(css());
					sheets.set(name, sheet);
				}
				// After the runtime's own sheet and before any host sheet, so a host rule still wins. See `adopt`.
				adopt(root, sheet);
				return;
			} catch {
				// Fall through, as the runtime's own sheet does.
			}
		}
		if (root.querySelector(`style[data-tb-sheet="${name}"]`)) return;
		const style = document.createElement("style");
		style.setAttribute("data-tb-sheet", name);
		style.textContent = css();
		root.append(style);
	});
}
