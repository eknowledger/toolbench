/**
 * The chart showcase page: one family at a time, chosen by `?family=`. The family list itself is static
 * markup written at build time; this marks the current one and draws its figures.
 *
 * Each figure is a page-owned host (`controls="none"`) driven through `values` and `run()`, the same
 * way any page would put a tool's chart in a figure without its form.
 */
import { entries } from "./registry.ts";
import { DEFAULT_FAMILY, families } from "./chart-families.ts";

/** The fixture that draws every chart kind. Registered on this page only. */
export const chartTools = entries(
	import.meta.glob("../../bench/fixtures/discrete-series/tool.json", { eager: true, import: "default" }) as Record<string, unknown>,
	import.meta.glob("../../bench/fixtures/discrete-series/index.ts") as Record<string, () => Promise<unknown>>,
);

type Driven = HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };

export function drawCharts(): void {
	const wanted = new URLSearchParams(location.search).get("family") ?? DEFAULT_FAMILY;
	const index = Math.max(0, families.findIndex((f) => f.id === wanted));
	const family = families[index] ?? families[0];
	if (!family) return;

	for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-family]")) {
		if (link.dataset.family === family.id) link.setAttribute("aria-current", "page");
		else link.removeAttribute("aria-current");
	}
	// On a phone the family list is one scrolling row; bring the current family into it, sideways only.
	const current = document.querySelector<HTMLElement>("[data-family][aria-current]");
	const row = current?.closest("ol");
	if (current && row && row.scrollWidth > row.clientWidth) row.scrollLeft = current.offsetLeft - row.clientWidth / 2 + current.offsetWidth / 2;
	const heading = document.querySelector("[data-family-name]");
	if (heading) heading.textContent = family.name;
	const note = document.querySelector("[data-family-note]");
	if (note) note.textContent = family.note;
	const position = document.querySelector("[data-family-position]");
	if (position) position.textContent = `${index + 1} of ${families.length}`;
	document.title = `${family.name}: charts, Toolbench`;

	const prev = families[index - 1];
	const next = families[index + 1];
	for (const [selector, target] of [["[data-family-prev]", prev], ["[data-family-next]", next]] as const) {
		const a = document.querySelector<HTMLAnchorElement>(selector);
		if (!a) continue;
		if (target) {
			a.href = `?family=${target.id}`;
			const label = a.querySelector("[data-label]");
			if (label) label.textContent = target.name;
			a.hidden = false;
		} else a.hidden = true;
	}

	const stage = document.querySelector<HTMLElement>("[data-chart-stage]");
	if (!stage) return;
	stage.replaceChildren();
	if (family.planned) {
		const template = document.querySelector<HTMLTemplateElement>("#planned-family");
		if (template) stage.append(template.content.cloneNode(true));
		return;
	}
	for (const c of family.cases) {
		const figure = document.createElement("figure");
		figure.className = "chart-figure";
		const host = document.createElement("tool-host") as Driven;
		host.setAttribute("tool", "discrete-series");
		host.setAttribute("mode", "embed");
		host.setAttribute("controls", "none");
		const caption = document.createElement("figcaption");
		caption.textContent = c.caption;
		figure.append(host, caption);
		stage.append(figure);
		void customElements.whenDefined("tool-host").then(async () => {
			host.values = { case: c.id };
			await host.run();
		});
	}
}
