/**
 * One place that wires the runtime up, imported by every bench page.
 *
 * This is the entire integration surface for a host site: a source, a worker factory, and a function
 * that turns a tool id into a URL. Everything else is `<tool-host>` in the markup.
 */
import { defineToolHost, RegistrySource } from "@toolbench/runtime";
import { hostHighlight } from "./highlight.ts";
import { registry } from "./registry.ts";
import { installThemeControl } from "./theme.ts";

installThemeControl();

export const source = new RegistrySource(registry);

// Which highlighter, including the deliberately broken ones a browser test needs. Chosen inside
// highlight.ts so the query-param read and those hooks stay out of the chunk the README publishes.
const hostHook = hostHighlight(location.search);

defineToolHost({
	source,
	/*
	 * Called for tools declaring `thread: "worker"`, and once for the page by the first graph past a
	 * hundred nodes, which is laid out in a worker of its own. A host with neither can leave it out:
	 * worker-mode tools then run on the main thread with a console warning, and a large graph is laid out
	 * there after a frame, which is a slower page rather than a broken one.
	 */
	workerFactory: () => new Worker(new URL("./tool.worker.ts", import.meta.url), { type: "module" }),
	/*
	 * Relative to the current page, not to the origin. Every bench HTML file sits in the same
	 * directory, so `./tool.html` works at `/` locally and at `/toolbench/` on project Pages.
	 * An origin-absolute `/tool.html` would 404 under that prefix.
	 */
	pageUrl: (id) => `./tool.html?id=${encodeURIComponent(id)}`,
	...(hostHook ? { highlight: hostHook } : {}),
});
