/**
 * The styling page: STYLING.md's four example sheets, applied through `styles` to real tool output.
 *
 * It exists so the styling contract is exercised in CI rather than only described. Every rule below is
 * copied from STYLING.md; if one has to change for this page to look right, the document is wrong.
 */
import { defineToolHost, setHostStyles, type HostStyles } from "@toolbench/runtime";
import { source } from "./boot.ts";

const verdict = `
.tb-field[data-role="verdict"] { display: block; padding: 0.75rem 1rem; border-radius: var(--tb-radius); border: 1px solid var(--tb-border); }
.tb-field[data-role="verdict"][data-tone="bad"]  { background: color-mix(in oklab, var(--tb-bad) 12%, transparent);  border-color: var(--tb-bad); }
.tb-field[data-role="verdict"][data-tone="good"] { background: color-mix(in oklab, var(--tb-good) 12%, transparent); border-color: var(--tb-good); }
.tb-field[data-role="verdict"] dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
.tb-field[data-role="verdict"] .tb-value { font-family: var(--tb-font); font-size: 1.35rem; font-weight: 650; }
`;

const stats = `
[data-role="stats"] .tb-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.5rem; }
[data-role="stats"] .tb-field { grid-template-columns: 1fr; gap: 0.25rem; padding: 0.75rem; border: 1px solid var(--tb-border); border-radius: 8px; background: var(--tb-surface); }
[data-role="stats"] .tb-value { font-size: 1.5rem; font-family: var(--tb-font); font-weight: 650; }
[data-role="stats"] .tb-note { display: block; margin: 0; }
`;

const bordered = `
.tb-out-table table { border: 1px solid var(--tb-border); }
.tb-out-table th, .tb-out-table td { border: 1px solid var(--tb-border); }
`;

const stacked = `
@container (max-width: 30rem) {
  .tb-out-table thead { display: none; }
  .tb-out-table tr { display: grid; padding: 0.5rem 0; border-bottom: 1px solid var(--tb-border); }
  .tb-out-table td { border: 0; text-align: start; }
  .tb-out-table td[data-label]::before { content: attr(data-label); display: block; font-size: 0.72rem; color: var(--tb-muted); font-family: var(--tb-font); }
}
`;

/** A parsed sheet as well as strings, so both forms `styles` accepts are on the page. */
function parse(css: string): CSSStyleSheet {
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(css);
	return sheet;
}

/*
 * The per-tool form, so the browser tests can tell the shared sheets from one tool's own: the table
 * sheets reach every tool, the verdict and stats sheets only the fixture that names those parts.
 */
const styles: HostStyles = {
	"*": [parse(bordered), stacked],
	"styled-output": [verdict, parse(stats)],
};

// Defined a second time, after boot.ts, so the `styles` option itself is what applies the sheets here.
defineToolHost({ source, pageUrl: (id) => `./tool.html?id=${encodeURIComponent(id)}`, styles });

// The second audit answers with every limit in place, so the good tone of the verdict is on screen too.
const fixed = document.getElementById("audit-fixed") as (HTMLElement & { values: Record<string, boolean> }) | null;
if (fixed) fixed.values = { fixed: true };

// The links a page would write to point at one part (#147). A real page would read its own fragment.
for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-reveal]")) {
	link.addEventListener("click", (event) => {
		event.preventDefault();
		const host = document.getElementById(link.dataset.reveal ?? "") as (HTMLElement & { reveal(id: string): Promise<boolean> }) | null;
		void host?.reveal(link.dataset.part ?? "");
	});
}

const toggle = document.getElementById("toggle-styles");
let on = true;
toggle?.addEventListener("click", () => {
	on = !on;
	setHostStyles(on ? styles : undefined);
	toggle.setAttribute("aria-pressed", String(on));
	toggle.textContent = on ? "Host styles on" : "Host styles off";
});
