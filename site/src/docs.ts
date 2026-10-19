// The docs pages run no tool, so they do not load the runtime: the theme switch, copy buttons, and this.
import "./theme.ts";
import "./copy.ts";
import "./panels.ts";

// A page that embeds a live tool loads the runtime; every other docs page stays without it.
if (document.querySelector("tool-host")) void import("./docs-tools.ts");

/*
 * "On this page" follows the reader: the link for the section in view is marked `aria-current`, so it is
 * announced as well as shown. A section is "in view" from the moment its heading passes the top third of
 * the window until the next heading does, which is what IntersectionObserver reports with this margin.
 */
const links = new Map<string, HTMLAnchorElement>();
for (const a of document.querySelectorAll<HTMLAnchorElement>(".docs-toc a[href^='#']")) links.set(decodeURIComponent(a.hash.slice(1)), a);
const headings = [...document.querySelectorAll<HTMLElement>(".prose h2[id], .prose h3[id]")].filter((h) => links.has(h.id));

function mark(): void {
	// The current section is the last heading above the line a third of the way down the window. Read
	// from the headings' positions, because a jump (Home, a link) can move a heading from above the line
	// to below it without crossing the observed band, and then no observer entry reports it.
	const line = innerHeight / 3;
	const current = [...headings].reverse().find((h) => h.getBoundingClientRect().top <= line) ?? headings[0];
	for (const [id, a] of links) {
		if (id === current?.id) {
			a.setAttribute("aria-current", "true");
			// Keep the marked link inside the list's own scroll box, without moving the page.
			const box = a.closest<HTMLElement>(".docs-toc");
			if (box && box.scrollHeight > box.clientHeight) {
				const top = a.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
				if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - a.offsetHeight) box.scrollTop = top - box.clientHeight / 3;
			}
		} else a.removeAttribute("aria-current");
	}
}

if (headings.length) {
	// The observer says when a heading crosses the band; a scroll that jumps is caught by the frame check.
	const observer = new IntersectionObserver(() => mark(), { rootMargin: "0px 0px -66% 0px", threshold: [0, 1] });
	for (const h of headings) observer.observe(h);
	let queued = false;
	addEventListener(
		"scroll",
		() => {
			if (queued) return;
			queued = true;
			requestAnimationFrame(() => {
				queued = false;
				mark();
			});
		},
		{ passive: true },
	);
	mark();
}
