/**
 * Collapsible sidebars: the docs' navigation and contents, and the gallery's index. Each has one
 * button, a real <button> with `aria-expanded`, so the keyboard reaches it and a screen reader hears the
 * state change. A collapsed panel shrinks to a rail holding only its button, and the middle column takes
 * the space.
 *
 * The choice is remembered across pages in localStorage. The page's inline head script applies it as a
 * `data-hide-<panel>` attribute before first paint, so a collapsed sidebar does not flash open and shut.
 */
const KEY = "tb-site-panels";
const root = document.documentElement;

function saved(): Record<string, boolean> {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
	} catch {
		return {};
	}
}

function sync(name: string): void {
	const open = !root.hasAttribute(`data-hide-${name}`);
	for (const b of document.querySelectorAll<HTMLButtonElement>(`[data-panel-toggle="${name}"]`)) b.setAttribute("aria-expanded", String(open));
}

const names = new Set([...document.querySelectorAll<HTMLElement>("[data-panel-toggle]")].map((b) => b.dataset.panelToggle ?? ""));
for (const name of names) sync(name);

document.addEventListener("click", (event) => {
	const button = (event.target as Element | null)?.closest?.<HTMLButtonElement>("[data-panel-toggle]");
	const name = button?.dataset.panelToggle;
	if (!button || !name) return;
	const open = root.hasAttribute(`data-hide-${name}`);
	root.toggleAttribute(`data-hide-${name}`, !open);
	const state = saved();
	state[name] = open;
	try {
		localStorage.setItem(KEY, JSON.stringify(state));
	} catch {
		/* Private mode: the choice lasts for this page only. */
	}
	sync(name);
});

// A module, so its names stay its own.
export {};
