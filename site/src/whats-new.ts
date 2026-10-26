// The What's new page runs no tool, so, like the docs, it does not load the runtime.
import "./theme.ts";
import "./panels.ts";
import { followSections } from "./spy.ts";

followSections(".docs-toc", ".wn-release h2[id]");

/*
 * A Screenshot link opens its image in one shared native <dialog>: the browser gives it focus trapping,
 * Escape and the return of focus to the link. Without script the link still opens the image itself.
 * The images are set only when asked for, so a reader who opens none downloads none.
 */
const dialog = document.querySelector<HTMLDialogElement>("dialog.wn-shot");
const title = dialog?.querySelector<HTMLElement>(".wn-shot-title");
const light = dialog?.querySelector<HTMLImageElement>(".wn-shot-light");
const dark = dialog?.querySelector<HTMLImageElement>(".wn-shot-dark");

document.addEventListener("click", (event) => {
	const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>("a[data-shot-dark]");
	if (!link || !dialog || !title || !light || !dark || typeof dialog.showModal !== "function") return;
	// A reader asking for a new tab gets one, with the image in it.
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
	event.preventDefault();
	const name = link.dataset.shotName ?? "";
	title.textContent = `${name}, in the gallery`;
	light.alt = `Screenshot: ${name}, as the gallery shows it`;
	dark.alt = light.alt;
	light.src = link.href;
	dark.src = new URL(link.dataset.shotDark ?? "", location.href).href;
	dialog.showModal();
});

// A click on the backdrop, outside the dialog's own box, closes it as Escape does.
dialog?.addEventListener("click", (event) => {
	if (event.target !== dialog) return;
	const box = dialog.getBoundingClientRect();
	const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
	if (!inside) dialog.close();
});

export {};
