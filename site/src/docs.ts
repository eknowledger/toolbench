// The docs pages run no tool, so they do not load the runtime: the theme switch, copy buttons, and this.
import "./theme.ts";
import "./copy.ts";

/*
 * "On this page" follows the reader: the link for the section in view is marked `aria-current`, so it is
 * announced as well as shown. A section is "in view" from the moment its heading passes the top third of
 * the window until the next heading does, which is what IntersectionObserver reports with this margin.
 */
const links = new Map<string, HTMLAnchorElement>();
for (const a of document.querySelectorAll<HTMLAnchorElement>(".docs-toc a[href^='#']")) links.set(decodeURIComponent(a.hash.slice(1)), a);
const headings = [...document.querySelectorAll<HTMLElement>(".prose h2[id], .prose h3[id]")].filter((h) => links.has(h.id));
const above = new Set<string>();

function mark(): void {
	// The current section is the last heading that has passed the line.
	const current = [...headings].reverse().find((h) => above.has(h.id)) ?? headings[0];
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
	const observer = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				const id = (e.target as HTMLElement).id;
				// Above the line once it has left through the top, or is sitting across it.
				if (e.isIntersecting || e.boundingClientRect.top < (e.rootBounds?.top ?? 0)) above.add(id);
				else above.delete(id);
			}
			mark();
		},
		{ rootMargin: "0px 0px -66% 0px", threshold: [0, 1] },
	);
	for (const h of headings) observer.observe(h);
	mark();
}
