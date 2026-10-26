/**
 * What the gallery page adds to the site's host setup: a highlighter for code results and highlighted
 * textareas, and a host stylesheet for one tool. The gallery shows both regions below as code, so this
 * file is the example and the example cannot drift from it.
 */
import { tokens } from "../build/highlight.ts";

// #region highlight
// The runtime asks for a Node, never a string, so it never assigns innerHTML.
export function highlight(source: string, lang: string): Node {
	const out = document.createDocumentFragment();
	for (const [cls, text] of tokens(source, lang)) {
		if (!cls) {
			out.append(text);
			continue;
		}
		const span = document.createElement("span");
		span.className = `t-${cls}`;
		span.textContent = text;
		out.append(span);
	}
	return out;
}
// #endregion

/*
 * The highlighter's colours, inside every tool. Custom properties cross the shadow boundary, so these read
 * the page's own --code-* values and follow its theme.
 */
export const HIGHLIGHT_STYLES = /* css */ `
.t-c { color: var(--code-comment); font-style: italic; }
.t-s { color: var(--code-string); }
.t-n { color: var(--code-number); }
.t-k { color: var(--code-keyword); }
.t-p { color: var(--code-prop); }
`;

// #region styles
// One tool's result, restyled by role: the verdict drawn large, the stats as tiles.
export const perTool = {
	"styled-output": [
		`.tb-field[data-role="verdict"] { display: block; padding: 0.75rem 1rem; border-radius: var(--tb-radius); border: 2px solid var(--tb-border); }
.tb-field[data-role="verdict"][data-tone="bad"] { border-color: var(--tb-bad); }
.tb-field[data-role="verdict"][data-tone="good"] { border-color: var(--tb-good); }
.tb-field[data-role="verdict"] .tb-value { font-size: 1.4rem; font-weight: 700; }
[data-role="stats"] .tb-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.5rem; }
[data-role="stats"] .tb-field { grid-template-columns: 1fr; padding: 0.75rem; border: 1px solid var(--tb-border); border-radius: 8px; background: var(--tb-surface); }
[data-role="stats"] .tb-value { font-size: 1.5rem; font-weight: 700; }`,
	],
};
// #endregion

// #region wrap-styles
// A narrow layout that needs no guessing: the table scrolls, short tokens stay on one line, prose gets a width.
export const WRAP_STYLES = /* css */ `
@container (max-width: 34rem) {
  .tb-out-table table { width: max-content; min-width: 100%; }
  .tb-out-table [data-wrap="none"] { white-space: nowrap; }
  .tb-out-table [data-wrap="prose"] { min-width: 20ch; }
}
`;
// #endregion

// #region input-styles
// One input by role and one by id: a property set on a row reaches only that row's control.
export const INPUT_STYLES = /* css */ `
.tb-field-row[data-role="threshold"] { --tb-input-border: var(--tb-accent); --tb-input-bg: var(--tb-accent-bg); }
.tb-field-row[data-input="values"] { --tb-desc-fg: var(--tb-muted); }
.tb-field-row[data-role="advanced"] { padding-top: 0.625rem; border-top: 1px dashed var(--tb-border); }
`;
// #endregion
