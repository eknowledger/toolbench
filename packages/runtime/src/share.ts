/**
 * The share button (#227): drawing it, and what pressing it does.
 *
 * Its own chunk, fetched while a tool that draws the button activates, so a page of cards, or one that
 * turned sharing off, does not pay for it. Reading a link on load stays in boot, because a tool has to
 * open with a link's values before anything awaits; drawing the button, writing a link and the clipboard
 * are here.
 */
import type { InputValues, Manifest } from "@toolbench/sdk";
import { el, svg } from "./dom.ts";
import type { ToolHostConfig } from "./element.ts";
import { adoptStyles } from "./styles.ts";
import { shareableInputs } from "./values.ts";

/*
 * The button's rules, here rather than in the runtime's sheet: a 28px icon in the Copy button's quiet
 * vocabulary, at the end of the title or the Run row.
 */
const STYLES = /* css */ `
.tb-share-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; }
.tb-share-bar { display: flex; align-items: center; gap: 0.5rem; margin-inline-start: auto; }
.tb-share {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 0.375rem;
  min-width: 28px; height: 28px; padding: 0 5px; font: inherit; font-size: 0.78rem; color: var(--tb-muted);
  background: var(--tb-bg); border: 1px solid var(--tb-border); border-radius: 8px; cursor: pointer;
}
.tb-share svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.tb-share:hover:enabled { color: var(--tb-fg); border-color: var(--tb-muted); }
.tb-share[data-copied] { color: var(--tb-good); border-color: var(--tb-good); }
.tb-share-note { font-size: 0.78rem; color: var(--tb-muted); overflow-wrap: anywhere; }
.tb-share[data-copied] + .tb-share-note { color: var(--tb-good); }
`;

/**
 * The default link: this page's URL with each value as a query parameter named `<tool id>.<input id>`.
 *
 * The tool's id in the name is what lets several tools share one page's query string, and the page's own
 * parameters are kept, so a route that needs `?id=` still resolves. Any parameter of this tool's already
 * in the address is dropped first: otherwise a value that has since become private, or an input since
 * removed, would ride along in the copy.
 */
export function linkFor(id: string, values: InputValues): string {
	const url = new URL(location.href);
	for (const key of [...url.searchParams.keys()]) if (key.startsWith(`${id}.`)) url.searchParams.delete(key);
	for (const [key, value] of Object.entries(values)) url.searchParams.set(`${id}.${key}`, String(value));
	return url.href;
}

/** The icon: two half-links and the bar between them, on a 24 unit grid; and the check mark once copied. */
const LINK = "M9 15l6-6M7.5 11.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M16.5 12.5l2-2a3.5 3.5 0 0 0-5-5l-2 2";
const CHECK = "M5 12.5l4.5 4.5L19 7.5";

/**
 * The share button and the note beside it, wired. `host` is the element, which dispatches `tool-share`;
 * `announce` is its unseen status region, read at press time because a repaint replaces it.
 *
 * The accessible name says what it does, since an icon says nothing to a screen reader. With a visible
 * label the name starts with it, so a speech-input user saying the label still matches.
 */
export function shareBar(host: HTMLElement, manifest: Manifest, values: () => InputValues, cfg: ToolHostConfig, announce: () => HTMLElement | undefined): HTMLElement {
	const label = host.getAttribute("share-label") || cfg.shareLabel;
	const name = "a link to this tool with its inputs";
	const button = el(
		"button",
		{ type: "button", class: "tb-share", part: "share", "aria-label": label ? `${label}: ${name}` : `Copy ${name}` },
		svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, svg("path", { d: LINK })),
		label ? el("span", {}, label) : null,
	);
	const note = el("span", { class: "tb-share-note", "aria-hidden": "true" });
	const scheme = cfg.share;
	wireShare(
		button,
		note,
		() => {
			// The same rule the reader uses, so what is written is exactly what may be read back.
			const shared: InputValues = {};
			const now = values();
			for (const id of shareableInputs(manifest)) shared[id] = now[id] as string | number | boolean;
			return { values: shared, url: typeof scheme === "object" ? scheme.url(manifest.id, shared) : linkFor(manifest.id, shared) };
		},
		(message, url, shared) => {
			// Emptied, then written a frame later, so a second share in a row is announced again.
			const region = announce();
			if (region) region.textContent = "";
			setTimeout(() => region && (region.textContent = message), 50);
			host.dispatchEvent(new CustomEvent("tool-share", { bubbles: true, composed: true, detail: { url, values: shared } }));
		},
	);
	return el("div", { class: "tb-share-bar" }, button, note);
}

/**
 * Make the share button work: copy the link, show the outcome in `note`, and hand the sentence to announce
 * and the link to `done`, which `<tool-host>` turns into its status region and `tool-share`.
 *
 * ⚠️ The accessible name stays as it is and only the icon changes. Renaming a focused control has some
 * screen readers read the new name over the announcement, the reason the Copy button keeps its label too.
 *
 * A refused or missing clipboard puts the link itself in the note, selected, so the reader can copy it with
 * the keyboard. That note stays: the link it shows is still the one to copy.
 */
function wireShare(button: HTMLButtonElement, note: HTMLElement, link: () => { url: string; values: InputValues }, done: (message: string, url: string, values: InputValues) => void): void {
	adoptStyles(button, "share", () => STYLES);
	const path = button.querySelector("path");
	const idle = path?.getAttribute("d") ?? "";
	let timer: ReturnType<typeof setTimeout> | undefined;
	button.addEventListener("click", () => {
		const { url, values } = link();
		const settle = (ok: boolean) => {
			clearTimeout(timer);
			button.toggleAttribute("data-copied", ok);
			path?.setAttribute("d", ok ? CHECK : idle);
			note.textContent = ok ? "Link copied" : url;
			if (ok) {
				// About two seconds, then back to the link: "copied" would otherwise outlast whatever the reader copies next.
				timer = setTimeout(() => {
					button.removeAttribute("data-copied");
					path?.setAttribute("d", idle);
					note.textContent = "";
				}, 2000);
			} else getSelection()?.selectAllChildren(note);
			done(ok ? "Link copied" : "Copy failed. The link is selected, so you can copy it yourself", url, values);
		};
		const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
		if (!clipboard?.writeText) settle(false);
		else clipboard.writeText(url).then(() => settle(true), () => settle(false));
	});
}
