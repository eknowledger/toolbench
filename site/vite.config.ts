import { readdirSync } from "node:fs";
import { resolve } from "node:path";
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
	const match = /\/(?:tools|fixtures)\/([^/]+)\/index\.ts$/.exec(id);
	return match ? `${prefix}${match[1]}` : null;
}

export default defineConfig({
	base: base(),
	plugins: [siteContent()],
	// ⚠️ Vite defaults workers to iife, which cannot split one file per tool: fine in dev, fails the build.
	worker: { format: "es", rollupOptions: { output: { manualChunks: (id: string) => chunk(id, "worker-tool-") } } },
	build: {
		rollupOptions: {
			input: pages(),
			output: { manualChunks: (id: string) => chunk(id, "tool-") },
		},
	},
	server: { port: 5190, strictPort: true, fs: { allow: [resolve(here, "..")] } },
	preview: { port: 5190, strictPort: true },
});
