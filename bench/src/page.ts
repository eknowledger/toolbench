import "./boot.ts";
import { source } from "./boot.ts";
import { toolIds } from "./registry.ts";
import { installThemeControl } from "./theme.ts";

installThemeControl();

/**
 * The full-page mode. A real host would generate one route per tool; the bench uses a query parameter
 * so the whole thing stays three static files.
 */
const params = new URLSearchParams(location.search);
const requested = params.get("id") ?? toolIds[0] ?? "";
const manifests = await source.list();
const manifest = manifests.find((m) => m.id === requested) ?? manifests[0];

const host = document.getElementById("host");
if (host && manifest) host.setAttribute("tool", manifest.id);

if (manifest) {
	document.title = `${manifest.name} — Toolbench`;
	const title = document.getElementById("title");
	const blurb = document.getElementById("blurb");
	if (title) title.textContent = manifest.name;
	if (blurb) blurb.textContent = manifest.blurb;

	/*
	 * The help text. A tool declares a markdown file; a host renders it however it likes — this one
	 * shows it as preformatted text rather than pulling in a markdown parser the bench does not need.
	 */
	/*
	 * ⚠️ Globbed rather than dynamically imported. A bundler needs a static file extension in an
	 * `import()`, so `import(`../../tools/${id}/${file}?raw`)` is rejected — two variables and no
	 * extension. A glob of the known shape gives the same result and works in both dev and build.
	 */
	const helpFiles = import.meta.glob("../../tools/*/README.md", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
	if (manifest.help) {
		const help = document.getElementById("help");
		const text = helpFiles[`../../tools/${manifest.id}/README.md`];
		if (help) {
			if (text) {
				const pre = document.createElement("pre");
				pre.style.whiteSpace = "pre-wrap";
				pre.textContent = text.trim();
				help.replaceChildren(pre);
			} else {
				help.textContent = `Declared ${manifest.help}, but no README.md sits beside the tool.`;
			}
		}
	}
}

const switcher = document.getElementById("switcher");
for (const id of toolIds) {
	const link = document.createElement("a");
	link.href = `/tool.html?id=${encodeURIComponent(id)}`;
	link.textContent = id;
	if (id === manifest?.id) link.setAttribute("aria-current", "page");
	switcher?.append(link);
}
