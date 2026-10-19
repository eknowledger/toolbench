import { bootSite } from "./site-host.ts";
import { fixtures } from "./fixtures.ts";
import { HIGHLIGHT_STYLES, highlight, perTool } from "./gallery-host.ts";
import "./source.ts";

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
 * The example tools: one at a time, chosen by the URL's hash, so a tool's gallery link is shareable and
 * Back works. Without JavaScript every pane shows, one after another, which is a worse page but a whole one.
 */
const panes = [...document.querySelectorAll<HTMLElement>(".tool-pane")];
const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-pick]")];

function show(): void {
	const wanted = decodeURIComponent(location.hash.slice(1));
	const id = panes.some((p) => p.id === wanted) ? wanted : (panes[0]?.id ?? "");
	for (const pane of panes) pane.hidden = pane.id !== id;
	for (const link of links) {
		if (link.dataset.pick === id) link.setAttribute("aria-current", "true");
		else link.removeAttribute("aria-current");
	}
}

for (const link of links) {
	link.addEventListener("click", (event) => {
		// Switch panes without the jump to the anchor that a plain hash link would make.
		event.preventDefault();
		history.pushState(null, "", `#${link.dataset.pick}`);
		show();
	});
}
addEventListener("popstate", show);
show();
