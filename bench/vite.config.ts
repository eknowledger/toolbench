import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

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

/**
 * Compute each seeded card's result at build time and inject it into the HTML.
 *
 * This is the pattern a real host uses, and the reason `seed()` exists. The alternative is what this
 * bench did before: hand-written JSON in index.html, which was correct on the day it was typed and
 * would drift the moment the tool changed, showing a confidently wrong answer to every reader who did
 * not press Run.
 *
 * `transformIndexHtml` is the right hook because the seed has to be in the static markup. Anything
 * that injects it from JavaScript has already lost the property that makes a seed worth having.
 */
function seedCards(): Plugin {
	return {
		name: "toolbench-seed-cards",
		async transformIndexHtml(html) {
			// Only the cards actually marked for seeding, so a page pays nothing for tools it does not seed.
			const cards = [...html.matchAll(/<tool-host tool="([^"]+)"([^>]*data-seed\b[^>]*)>/g)].map((m) => ({
				id: m[1] as string,
				/* The card's own `parts` attribute, so a seed carries exactly what that card will draw. */
				parts: Math.max(1, Number(/\bparts="(\d+)"/.exec(m[2] ?? "")?.[1] ?? 1)),
			}));
			if (cards.length === 0) return html;

			const { seed, serialiseSeed, upgradeManifest, validateManifest } = await import("@toolbench/sdk");
			let out = html;
			for (const { id, parts } of cards) {
				const manifest = validateManifest(
					upgradeManifest((await import(`../tools/${id}/tool.json`, { with: { type: "json" } })).default),
				);
				const tool = (await import(`../tools/${id}/index.ts`)).default;
				/*
				 * Deliberately NOT wrapped in try/catch. seed() throws when a tool crashes on its own
				 * defaults or rejects them, and both are authoring bugs that should fail the build rather
				 * than silently ship a card with nothing in it.
				 */
				const output = await seed({ manifest, tool });
				/*
				 * A card renders the first `parts` parts of a group, so seeding more ships markup no reader
				 * can see. Trimming is the host's call rather than the SDK's, because it depends on how much
				 * room this card has: a page-mode host would keep everything.
				 */
				/*
				 * One part is emitted bare rather than wrapped in a single-child group. Both render the same,
				 * and the bare form is what a one-part card seeded before this took a `parts` count, so the
				 * markup for every existing card is byte-for-byte unchanged.
				 */
				const kept = output.kind === "group" ? output.parts.slice(0, parts) : [output];
				const forCard = kept.length === 1 ? kept[0] : { kind: "group" as const, parts: kept };
				const json = serialiseSeed(forCard);
				out = out.replace(
					new RegExp(`(<tool-host tool="${id}"[^>]*data-seed\\b[^>]*>)`),
					`$1\n\t\t\t<script type="application/json" data-toolbench-seed>${json}</script>`,
				);
			}
			return out;
		},
	};
}

export default defineConfig({
	plugins: [seedCards()],
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
