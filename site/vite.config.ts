import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { toolbench } from "@toolbench/runtime/vite";
import { defineConfig } from "vite";
import { siteContent } from "./build/plugin.ts";

/**
 * The public site: a plain Vite multi-page app, because the project's argument is that a page needs
 * no framework, and its own site should not be the exception.
 *
 * Deployed at the root of the project Pages URL, so production builds take `SITE_BASE=/toolbench/`.
 * Locally the base stays `/`, and the site is on http://localhost:5190.
 */
function base(): string {
	const raw = process.env.SITE_BASE;
	if (!raw) return "/";
	return raw.endsWith("/") ? raw : `${raw}/`;
}

const here = import.meta.dirname;

/**
 * Every HTML file in the site's root is a page, so a new page needs no config edit. Flat on purpose:
 * every in-page link is `./page.html`, which resolves the same at `/` locally and under the Pages prefix.
 */
function pages(): Record<string, string> {
	return Object.fromEntries(
		readdirSync(here)
			.filter((file) => file.endsWith(".html"))
			.map((file) => [file.replace(/\.html$/, ""), resolve(here, file)]),
	);
}

/** Name each tool's file after the tool, so the network panel says which tool a request was. */
function chunk(id: string, prefix: string): string | null {
	const match = /\/(?:tools|fixtures|examples)\/([^/]+)\/index\.ts$/.exec(id);
	if (match) return `${prefix}${match[1]}`;
	/*
	 * The sidebars and the card tabs are shared by the docs and the gallery, so Rollup would fold them into
	 * the chunk every page shares, and the landing page, which has neither, would download them.
	 */
	if (/\/site\/src\/(?:panels|tabs|spy)\.ts$/.test(id)) return "site-panels";
	return null;
}

export default defineConfig({
	base: base(),
	// Every tool.json validated here, at build time, so no reader downloads the validator for it.
	plugins: [toolbench(), siteContent()],
	// ⚠️ Vite defaults workers to iife, which cannot split one file per tool: fine in dev, fails the build.
	worker: { format: "es", rollupOptions: { output: { manualChunks: (id: string) => chunk(id, "worker-tool-") } } },
	build: {
		/*
		 * No modulepreload polyfill. Every browser the runtime supports either preloads natively or simply
		 * fetches the module when it is imported, and the polyfill was 0.4 KB in the chunk every page loads.
		 */
		modulePreload: { polyfill: false },
		rollupOptions: {
			input: pages(),
			output: { manualChunks: (id: string) => chunk(id, "tool-") },
		},
	},
	server: { port: 5190, strictPort: true, fs: { allow: [resolve(here, "..")] } },
	preview: { port: 5190, strictPort: true },
});
