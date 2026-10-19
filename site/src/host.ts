/**
 * The site's whole integration with Toolbench, written the way any consumer would write it: the
 * published package names, a registry built from a directory glob, a worker for the tools that ask
 * for one, and a host stylesheet. Nothing here reaches into the runtime's internals.
 */
import { defineToolHost, RegistrySource, type HostStyles, type RegistryEntry } from "@toolbench/runtime";
import { registry } from "./registry.ts";
import "./theme.ts";
import "./copy.ts";

export type BootOptions = {
	/** The site's own sheet, applied to every tool after the runtime's. */
	styles?: string;
	/** More sheets for particular tools, by id. */
	perTool?: Record<string, string[]>;
	/** Extra tools for one page only, so other pages do not carry their manifests. */
	extra?: Record<string, RegistryEntry>;
	/** The host's highlighter, for code results and textareas that declare a `lang`. */
	highlight?: (source: string, lang: string) => Node;
};

/*
 * A page-owned figure (`controls="none"`) sits inside the page's own frame, so the tool's frame would be
 * a second border around the same chart.
 */
const COMMON = /* css */ `
:host([controls="none"]) .tb { border: 0; background: transparent; border-radius: 0; }
:host([controls="none"]) .tb-body { padding: 0; }
/* A graph narrower than its card sits in the middle rather than against the left edge, the way a figure would. */
.tb-graph-plot svg { margin-inline: auto; }
/* A gallery graph fits its card until the reader asks for full size, so the whole drawing is always in view.
   The runtime sizes the SVG inline, so only !important reaches it; the viewBox keeps the proportions. */
:host([data-fit]) .tb-graph-plot svg { max-width: 100% !important; height: auto !important; }
/* A graph wider than its card scrolls. macOS hides overlay scrollbars until a scroll starts, so without a
   drawn bar the right of the graph read as cut off rather than scrollable. */
.tb-graph-plot { scrollbar-width: thin; scrollbar-color: var(--tb-faint) transparent; padding-bottom: 6px; }
`;

export function boot({ styles = "", perTool, extra, highlight }: BootOptions = {}): void {
	// "*" applies to every tool, so a page's own "*" sheets join the site's rather than replacing them.
	const every = [COMMON + styles, ...(perTool?.["*"] ?? [])];
	const all: HostStyles = perTool ? { ...perTool, "*": every } : every;
	defineToolHost({
		source: new RegistrySource({ ...registry, ...extra }),
		// #region worker
		workerFactory: () => new Worker(new URL("./tool.worker.ts", import.meta.url), { type: "module" }),
		// #endregion
		// Relative, so the same pages work at / locally and under a sub-path on Pages.
		pageUrl: (id) => `./gallery.html#tool-${encodeURIComponent(id)}`,
		styles: all,
		...(highlight ? { highlight } : {}),
	});
}
