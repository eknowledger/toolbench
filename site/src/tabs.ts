/**
 * The gallery cards' tabs, as the ARIA tabs pattern: Left and Right move between tabs and choose them,
 * Home and End go to the first and last, and only the chosen tab is in the Tab order.
 *
 * The Live panel is never hidden with `hidden`, only made invisible (see .card-live in gallery.css), so
 * the tool inside it stays mounted: the reader's inputs and the last result survive a look at the code.
 */
function select(tabs: HTMLButtonElement[], index: number, focus: boolean): void {
	for (const [k, tab] of tabs.entries()) {
		const on = k === index;
		tab.setAttribute("aria-selected", String(on));
		tab.tabIndex = on ? 0 : -1;
		const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
		if (!panel) continue;
		if (panel.classList.contains("card-live")) panel.toggleAttribute("data-away", !on);
		else panel.hidden = !on;
		if (on && focus) tab.focus();
	}
}

for (const list of document.querySelectorAll<HTMLElement>("[role='tablist'].card-tabs")) {
	const tabs = [...list.querySelectorAll<HTMLButtonElement>("[role='tab']")];
	for (const [k, tab] of tabs.entries()) {
		tab.addEventListener("click", () => select(tabs, k, false));
		tab.addEventListener("keydown", (event) => {
			const last = tabs.length - 1;
			const to =
				event.key === "ArrowRight" ? (k + 1) % tabs.length : event.key === "ArrowLeft" ? (k - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
			if (to < 0) return;
			event.preventDefault();
			select(tabs, to, true);
		});
	}
}

// A module, so its names stay its own.
export {};
