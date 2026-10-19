/**
 * The runtime for a docs page that embeds a tool. Loaded only by those pages, so a page of prose pays
 * for no runtime at all.
 */
import { examples } from "./examples.ts";
import { bootSite } from "./site-host.ts";

bootSite({ extra: examples });

// An embedded example opens with its answer: the page presses Run once, through the element's public API.
void customElements.whenDefined("tool-host").then(() => {
	for (const host of document.querySelectorAll<HTMLElement & { run(): Promise<void> }>("tool-host[data-run]")) void host.run();
});
