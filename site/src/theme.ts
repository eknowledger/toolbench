/**
 * Light and dark. The page follows the system until the reader picks one, and the pick is remembered.
 *
 * ⚠️ It sets `color-scheme`, not only an attribute. Every colour on the site, and every `--tb-*` token
 * the tools read, is a `light-dark()` pair, and `light-dark()` resolves against the used colour scheme.
 * A host that toggles only a class gets tools that stay light on a dark page.
 */
const KEY = "tb-site-theme";
type Theme = "light" | "dark";

const system = matchMedia("(prefers-color-scheme: dark)");

function stored(): Theme | null {
	try {
		const value = localStorage.getItem(KEY);
		return value === "light" || value === "dark" ? value : null;
	} catch {
		return null;
	}
}

function effective(): Theme {
	return stored() ?? (system.matches ? "dark" : "light");
}

function apply(theme: Theme | null): void {
	const root = document.documentElement;
	if (theme) {
		root.dataset.theme = theme;
		root.style.colorScheme = theme;
	} else {
		delete root.dataset.theme;
		root.style.colorScheme = "";
	}
	for (const button of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
		const next = effective() === "dark" ? "light" : "dark";
		button.setAttribute("aria-label", `Use the ${next} theme`);
		button.dataset.next = next;
	}
}

apply(stored());
system.addEventListener("change", () => apply(stored()));
document.addEventListener("click", (event) => {
	const button = (event.target as Element | null)?.closest?.("[data-theme-toggle]");
	if (!button) return;
	const next: Theme = effective() === "dark" ? "light" : "dark";
	try {
		localStorage.setItem(KEY, next);
	} catch {
		/* Private mode: the choice lasts for this page only. */
	}
	apply(next);
});

// A module, so its names stay its own.
export {};
