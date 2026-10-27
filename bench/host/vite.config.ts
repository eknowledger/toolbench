import { resolve } from "node:path";
import { toolbench } from "@toolbench/runtime/vite";
import { defineConfig } from "vite";

/**
 * ⚠️ Vite's defaults, on purpose. This page stands for a host that installed the runtime and changed
 * nothing, so it must not inherit the bench's chunk naming or any setting a host would not know to make.
 * A size measured under a tuned config is a figure no host reproduces.
 *
 * Two departures. `toolbench()`, the one line the README's quick start tells every Vite host to add (#259):
 * without it the page also fetches the validation chunk before its card paints, and the published figure is
 * a host that skipped the setup. And it is built into the bench's own output, at `host/`, so the bench's
 * preview serves it and a browser test can watch what it fetches, and so `base` is `/host/`. That costs 3
 * gzipped bytes, the prefix in Vite's preload helper, against the root a host would use. ⚠️ Not a relative
 * `./`, which looks the same and measured 76 bytes more: Vite then resolves every preload against
 * `import.meta.url` at run time.
 */
export default defineConfig({
	root: import.meta.dirname,
	base: "/host/",
	logLevel: "warn",
	plugins: [toolbench()],
	build: { outDir: resolve(import.meta.dirname, "..", "dist", "host"), emptyOutDir: true },
});
