import { bootSite } from "./site-host.ts";
import "./source.ts";

bootSite();

/*
 * One tool at a time, chosen by the URL's hash, so a tool's gallery link is shareable and Back works.
 * Without JavaScript every pane shows, one after another, which is a worse page but a complete one.
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
