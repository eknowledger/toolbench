/**
 * A three-state theme control: light, auto, dark.
 *
 * It exists for two reasons, and the second matters more than the convenience.
 *
 * **1. Theming cannot be verified by hand without it.** The runtime's whole styling story is that it
 * follows the page, and until now the only way to check that was to change an OS setting.
 *
 * **2. ⚠️ It exercises the shape a REAL host has, which is not the shape that trivially works.**
 * A real site toggles a CSS class: Tailwind's `dark:`, Fuwari, and nearly every theme do exactly that.
 * The runtime's default tokens use `light-dark()`, which resolves against the used `color-scheme` and
 * knows nothing about a class. So a host that toggles `.dark` and stops there gets tools rendering
 * light on a dark page, and it reads as a bug in the framework rather than a missing line in the host.
 *
 * This control therefore sets BOTH: the class, because a host needs one for its own chrome, and
 * `color-scheme`, because that is the line that actually reaches the tools. If you are integrating
 * Toolbench into a site that already has a class-based toggle, the fix is the one line below.
 */
type Mode = "light" | "auto" | "dark";

const KEY = "toolbench-bench-theme";
const MODES: Mode[] = ["light", "auto", "dark"];

function stored(): Mode {
	const value = localStorage.getItem(KEY);
	return MODES.includes(value as Mode) ? (value as Mode) : "auto";
}

function apply(mode: Mode): void {
	const root = document.documentElement;
	root.dataset.themeMode = mode;

	const dark = mode === "dark" || (mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
	// What a host uses to style its own chrome. On its own it does NOT reach the tools.
	root.classList.toggle("dark", dark);
	/*
	 * ⚠️ THIS is the line that reaches the tools. `light-dark()` resolves against the used colour
	 * scheme, so without it every `--tb-*` default stays on its light value no matter what the class
	 * says. `light dark` for auto means "follow the system"; an explicit value pins it.
	 */
	root.style.colorScheme = mode === "auto" ? "light dark" : mode;
}

export function installThemeControl(): void {
	/*
	 * ⚠️ Idempotent, because more than one entry point calls it: gallery.ts imports boot.ts, so a bare
	 * call ran twice and installed two controls that then disagreed about which was checked. Same
	 * reasoning as defineToolHost refusing to redefine its element.
	 */
	if (document.querySelector(".theme-switch")) return;
	apply(stored());
	// An explicit choice wins, but `auto` has to keep tracking the system while the page is open.
	matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
		if (stored() === "auto") apply("auto");
	});

	const header = document.querySelector("header.top");
	if (!header) return;

	const group = document.createElement("div");
	group.className = "theme-switch";
	// A radiogroup rather than three buttons: the three options are one choice, and a screen reader
	// should hear it that way.
	group.setAttribute("role", "radiogroup");
	group.setAttribute("aria-label", "Colour theme");

	const sync = () => {
		const current = stored();
		for (const button of group.querySelectorAll("button")) {
			button.setAttribute("aria-checked", String(button.dataset.mode === current));
		}
	};

	for (const mode of MODES) {
		const button = document.createElement("button");
		button.type = "button";
		button.dataset.mode = mode;
		button.setAttribute("role", "radio");
		button.textContent = mode;
		button.addEventListener("click", () => {
			localStorage.setItem(KEY, mode);
			apply(mode);
			sync();
		});
		group.append(button);
	}
	sync();
	header.append(group);
}
