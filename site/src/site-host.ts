/**
 * The site's host stylesheet: what a custom property cannot say. Adopted into every tool's shadow
 * root after the runtime's own rules, and outside its layer, so these win.
 */
import type { RegistryEntry } from "@toolbench/runtime";
import { boot } from "./host.ts";

const STYLES = /* css */ `
/* The Run button carries the mark's triangle: the one shape on this site that means "this runs". */
.tb-run { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 700; border-radius: 8px; padding: 0.5rem 1rem; min-height: 40px; }
.tb-run::before { content: ""; width: 0.55em; height: 0.65em; background: currentColor; clip-path: polygon(0 0, 100% 50%, 0 100%); }
/* An amber focus ring is under 3:1 on white, so focus uses the darker amber the site uses for text. */
.tb-input:focus-visible, .tb-textarea:focus-visible, .tb-select:focus-visible, .tb-run:focus-visible,
.tb-facade-hint:focus-visible, .tb-sample:focus-visible, .tb-output:focus-visible, .tb-name a:focus-visible {
  outline: 3px solid var(--tb-accent-text); outline-offset: 2px;
}
.tb-name { font-size: 1.2rem; font-weight: 700; letter-spacing: -0.015em; }
.tb-label { color: var(--tb-fg); font-weight: 700; }
`;

export function bootSite(extra?: Record<string, RegistryEntry>): void {
	boot({ styles: STYLES, ...(extra ? { extra } : {}) });
}
