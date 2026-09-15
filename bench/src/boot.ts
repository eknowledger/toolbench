/**
 * One place that wires the runtime up, imported by all three pages.
 *
 * This is the entire integration surface for a host site: a source, a worker factory, and a function
 * that turns a tool id into a URL. Everything else is `<tool-host>` in the markup.
 */
import { defineToolHost, RegistrySource } from "@toolbench/runtime";
import { registry } from "./registry.ts";
import { installThemeControl } from "./theme.ts";

installThemeControl();

export const source = new RegistrySource(registry);

defineToolHost({
	source,
	/*
	 * Only tools declaring `thread: "worker"` ever cause this to be called, and it is called once. A
	 * host that has no worker-mode tools can leave it out; those tools then run on the main thread with
	 * a console warning, which is a slower tool rather than a broken page.
	 */
	workerFactory: () => new Worker(new URL("./tool.worker.ts", import.meta.url), { type: "module" }),
	pageUrl: (id) => `/tool.html?id=${encodeURIComponent(id)}`,
});
