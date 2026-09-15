import "./boot.ts";
import { source, } from "./boot.ts";
import { toolIds } from "./registry.ts";
import { installThemeControl } from "./theme.ts";

installThemeControl();

/**
 * Builds a card per tool, twice — once plain, once inside a themed container.
 *
 * Written with `document.createElement` rather than a template so it is obvious that the host does
 * nothing but set two attributes.
 */
const manifests = await source.list();

for (const [containerId, mode] of [["cards", "card"], ["themed", "card"]] as const) {
	const container = document.getElementById(containerId);
	if (!container) continue;
	for (const id of toolIds) {
		const host = document.createElement("tool-host");
		host.setAttribute("tool", id);
		host.setAttribute("mode", mode);
		container.append(host);
	}
}

// A small proof that the manifests are just data: the page can read them without loading any tool.
console.info(
	`[bench] ${manifests.length} tools from their manifests alone: ` +
		manifests.map((m) => `${m.id} (sdk ${m.sdk}, ${m.runtime.thread})`).join(", "),
);
