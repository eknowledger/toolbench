import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * The bench is a plain Vite app on purpose. No framework, no meta-framework — if the runtime needs
 * one, it is not "drop it into any page" and the design has failed.
 *
 * Three pages, because the three display modes are three different situations and putting them on one
 * page would let a bug in one hide behind another.
 */
/**
 * Name each tool's chunk after the tool. Vite would otherwise call them all `index-*.js`, because
 * every tool's entry file is `index.ts` — which makes the network panel useless for the one thing
 * this bench exists to show, and once made a test that matched on chunk names silently count the
 * page's own entry as a tool.
 */
function toolChunk(id: string, prefix: string): string | null {
	const match = /\/(?:tools|fixtures)\/([^/]+)\/index\.ts$/.exec(id);
	if (match) return `${prefix}${match[1]}`;
	/*
	 * ⚠️ The bench's theme control gets its own chunk, and the reason is honesty rather than size.
	 *
	 * `boot` is runtime plus page wiring, and it is the number the README quotes for what a consumer
	 * pays. The theme switch is a test instrument that no consumer ships, so leaving it in `boot` would
	 * inflate a published figure with bytes nobody downloads. Rollup would otherwise inline it, since
	 * all three entries import it statically.
	 */
	if (/\/bench\/src\/theme\.ts$/.test(id)) return "bench-theme";
	return null;
}

export default defineConfig({
	/*
	 * ⚠️ `worker.format` defaults to "iife", which cannot code-split — so a worker that dynamically
	 * imports anything (ours imports one chunk per tool) builds fine in development and fails the
	 * production build. Every host that uses worker mode needs this line; it is in the README for that
	 * reason.
	 */
	worker: {
		format: "es",
		/*
		 * ⚠️ Vite builds the worker in a SEPARATE Rollup pass, so it shares no chunks with the main
		 * build and none of `build.rollupOptions` applies to it. Two consequences:
		 *
		 *  - every tool reachable from the worker is emitted a second time. That is unavoidable here,
		 *    and it costs deploy bytes rather than reader bytes: a tool declares one thread, so a
		 *    reader downloads one copy. Documented rather than hidden.
		 *  - without this block the worker's copies are all called `index-*.js`, which is how the
		 *    duplication stayed invisible in the first place. Naming them `worker-tool-<id>` makes the
		 *    network panel say which thread actually ran, which is the first thing you want to know
		 *    when a worker-mode tool misbehaves.
		 */
		rollupOptions: { output: { manualChunks: (id: string) => toolChunk(id, "worker-tool-") } },
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks: (id: string) => toolChunk(id, "tool-"),
			},
			input: {
				index: resolve(import.meta.dirname, "index.html"),
				tool: resolve(import.meta.dirname, "tool.html"),
				article: resolve(import.meta.dirname, "article.html"),
			},
		},
	},
	/*
	 * ⚠️ strictPort, set on the scripts as well as here.
	 *
	 * Without it, a dev server left running from an earlier session keeps 5180 and the new one quietly
	 * moves to 5181. You then test the old server, and since `import.meta.glob` is resolved at transform
	 * time, a tool added after that server started does not exist as far as it is concerned. The symptom
	 * is "No tool with id ..." on a tool you just wrote, which sends you looking in the registry.
	 * Failing loudly on a taken port is worth more than starting successfully on the wrong one.
	 */
	server: { port: 5180, strictPort: true, fs: { allow: [resolve(import.meta.dirname, "..")] } },
	preview: { port: 4173, strictPort: true },
});
