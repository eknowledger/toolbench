/*
 * A sidebar follows the reader: the link for the section in view is marked `aria-current`, so it is
 * announced as well as shown. One module for "On this page" and the gallery's list, so the two cannot drift
 * into marking the current section differently.
 *
 * The current section is the last heading above the line a third of the way down the window. Read from the
 * headings' positions, because a jump (Home, a link) can move a heading from above the line to below it
 * without crossing an observed band, and then no observer entry reports it.
 */
export function followSections(navSelector: string, headingSelector: string): void {
	const nav = document.querySelector<HTMLElement>(navSelector);
	if (!nav) return;
	const links = new Map<string, HTMLAnchorElement>();
	for (const a of nav.querySelectorAll<HTMLAnchorElement>("a[href^='#']")) links.set(decodeURIComponent(a.hash.slice(1)), a);
	const headings = [...document.querySelectorAll<HTMLElement>(headingSelector)].filter((h) => links.has(h.id));
	if (!headings.length) return;

	const mark = () => {
		const line = innerHeight / 3;
		const current = [...headings].reverse().find((h) => h.getBoundingClientRect().top <= line) ?? headings[0];
		for (const [id, a] of links) {
			if (id !== current?.id) {
				a.removeAttribute("aria-current");
				continue;
			}
			a.setAttribute("aria-current", "true");
			// Keep the marked link inside the list's own scroll box, without moving the page.
			if (nav.scrollHeight > nav.clientHeight) {
				const top = a.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
				if (top < nav.scrollTop || top > nav.scrollTop + nav.clientHeight - a.offsetHeight) nav.scrollTop = top - nav.clientHeight / 3;
			}
		}
	};

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
