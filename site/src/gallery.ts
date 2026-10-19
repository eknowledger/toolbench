import { bootSite } from "./site-host.ts";
import { fixtures } from "./fixtures.ts";
import { HIGHLIGHT_STYLES, highlight, perTool } from "./gallery-host.ts";
import "./tabs.ts";
import "./panels.ts";

bootSite({
	extra: fixtures,
	highlight,
	perTool: { "*": [HIGHLIGHT_STYLES], ...perTool },
});

type Host = HTMLElement & { values: Record<string, unknown>; run(): Promise<void>; reveal(id: string): Promise<boolean> };

/*
 * Examples that start from particular inputs, or show their answer straight away. The markup carries
 * `data-values` and `data-run`; the page does the rest through the element's public API.
 */
void customElements.whenDefined("tool-host").then(() => {
	for (const host of document.querySelectorAll<Host>("tool-host[data-values], tool-host[data-run]")) {
		// #region values
		// Fill the form the way typing would. It does not run the tool.
		if (host.dataset.values) host.values = JSON.parse(host.dataset.values) as Record<string, unknown>;
		// #endregion
		// #region run
		// Press Run once, on the reader's behalf, so the example opens with its answer.
		if (host.hasAttribute("data-run")) void host.run();
		// #endregion
	}
});

// #region reveal
const host = document.querySelector<Host>("#reveal-host");
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-reveal]")) {
	// Opens the part if `parts` hid it, scrolls to it and moves focus there.
	button.addEventListener("click", () => void host?.reveal(button.dataset.reveal ?? ""));
}
// #endregion

/*
 * A graph wider than its card is drawn shrunk to fit, with a button for the drawing at its own size, which
 * then scrolls. The button appears only when there is something to enlarge, and is measured again whenever
 * the card changes width, since collapsing the sidebar can make a graph fit.
 */
for (const button of document.querySelectorAll<HTMLButtonElement>(".graph-size")) {
	const graph = button.nextElementSibling as Host | null;
	if (!graph) continue;
	const measure = () => {
		const svg = graph.shadowRoot?.querySelector<SVGSVGElement>(".tb-graph-plot svg");
		const plot = svg?.parentElement;
		if (!svg || !plot) return;
		const natural = Number(svg.getAttribute("width"));
		const wider = natural > plot.clientWidth + 1;
		button.hidden = !wider && button.getAttribute("aria-pressed") === "false";
	};
	button.addEventListener("click", () => {
		const full = button.getAttribute("aria-pressed") !== "true";
		button.setAttribute("aria-pressed", String(full));
		button.textContent = full ? "Fit to card" : "Full size";
		graph.toggleAttribute("data-fit", !full);
		measure();
	});
	new ResizeObserver(measure).observe(graph);
	// The drawing arrives after the run resolves and the graph chunk loads, so watch the shadow root for it.
	const watch = () => {
		if (!graph.shadowRoot) return requestAnimationFrame(watch);
		new MutationObserver(measure).observe(graph.shadowRoot, { childList: true, subtree: true });
		measure();
	};
	watch();
}
