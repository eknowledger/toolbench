import { bootSite } from "./site-host.ts";
import { fixtures } from "./fixtures.ts";
import { HIGHLIGHT_STYLES, highlight, perTool } from "./gallery-host.ts";
import "./tabs.ts";
import "./panels.ts";
import { followSections } from "./spy.ts";

bootSite({
	extra: fixtures,
	highlight,
	perTool: { "*": [HIGHLIGHT_STYLES], ...perTool },
});

followSections(".gallery-nav", ".gallery-main [id]");

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

// #region events
const log = document.querySelector("#events-log");
for (const type of ["tool-input", "tool-run"]) {
	// Both bubble out of the shadow root, so the listener could as well be on `document`.
	document.querySelector("#events-host")?.addEventListener(type, (event) => {
		const { detail } = event as CustomEvent<Record<string, unknown>>;
		if (log) log.textContent = `${type} ${JSON.stringify(detail, null, 1).replace(/\s*\n\s*/g, " ")}`;
	});
}
// #endregion

// #region reveal
const host = document.querySelector<Host>("#reveal-host");
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-reveal]")) {
	// Opens the part if `parts` hid it, scrolls to it and moves focus there.
	button.addEventListener("click", () => void host?.reveal(button.dataset.reveal ?? ""));
}
// #endregion


