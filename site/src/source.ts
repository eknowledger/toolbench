/**
 * "View source" on a gallery entry: the tool's manifest and its function, fetched the first time a
 * reader opens the disclosure and never before. The gallery itself is static markup, so a visitor who
 * only looks at the tools downloads none of this.
 *
 * The markup is `<details data-source="tool-id">` with a `.source-body` inside; this fills the body.
 */
import { codeBlock } from "../build/highlight.ts";

const files = {
	"tool.json": import.meta.glob("../../tools/*/tool.json", { query: "?raw", import: "default" }),
	"index.ts": import.meta.glob("../../tools/*/index.ts", { query: "?raw", import: "default" }),
	"cases.json": import.meta.glob("../../tools/*/cases.json", { query: "?raw", import: "default" }),
} as Record<string, Record<string, () => Promise<unknown>>>;

const REPO = "https://github.com/eknowledger/toolbench/blob/main/tools";

async function fill(details: HTMLDetailsElement): Promise<void> {
	const id = details.dataset.source ?? "";
	const body = details.querySelector<HTMLElement>(".source-body");
	if (!body || body.dataset.filled) return;
	body.dataset.filled = "true";

	const tabs = document.createElement("div");
	tabs.className = "source-tabs";
	tabs.setAttribute("role", "tablist");
	tabs.setAttribute("aria-label", `Files in ${id}`);
	const panels: HTMLElement[] = [];
	const buttons: HTMLButtonElement[] = [];

	const names = Object.keys(files);
	for (const [k, name] of names.entries()) {
		const load = files[name]?.[`../../tools/${id}/${name}`];
		if (!load) continue;
		const text = String(await load());
		const tab = document.createElement("button");
		tab.type = "button";
		tab.setAttribute("role", "tab");
		tab.id = `${id}-tab-${k}`;
		tab.textContent = name;
		const panel = document.createElement("div");
		panel.setAttribute("role", "tabpanel");
		panel.setAttribute("aria-labelledby", tab.id);
		panel.className = "source-panel";
		// The code block is markup we produced: the highlighter escapes every character of the file.
		panel.innerHTML = codeBlock(text, name.endsWith(".ts") ? "ts" : "json", `tools/${id}/${name}`);
		const link = document.createElement("a");
		link.href = `${REPO}/${id}/${name}`;
		link.className = "source-link";
		link.textContent = `Open ${name} on GitHub`;
		panel.append(link);
		buttons.push(tab);
		panels.push(panel);
	}

	const select = (index: number, focus = false) => {
		for (const [k, b] of buttons.entries()) {
			const on = k === index;
			b.setAttribute("aria-selected", String(on));
			b.tabIndex = on ? 0 : -1;
			(panels[k] as HTMLElement).hidden = !on;
			if (on && focus) b.focus();
		}
	};
	for (const [k, b] of buttons.entries()) {
		b.addEventListener("click", () => select(k));
		b.addEventListener("keydown", (e) => {
			const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
			if (step) select((k + step + buttons.length) % buttons.length, true);
		});
	}
	tabs.append(...buttons);
	body.replaceChildren(tabs, ...panels);
	// The function is the interesting file; the manifest is what the form was built from.
	select(1);
}

for (const details of document.querySelectorAll<HTMLDetailsElement>("details[data-source]")) {
	details.addEventListener("toggle", () => {
		if (details.open) void fill(details);
	});
}
