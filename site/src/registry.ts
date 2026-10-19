/**
 * Every tool in `tools/`, found by a directory glob, so a new tool appears on the site with no code
 * change. Imported by the page and by the worker, which needs its own view of the module graph.
 *
 * ⚠️ Both globs must be literal strings: a bundler can only follow an import it can see. The manifests
 * are eager (data, small, needed to draw a form); the code stays behind a dynamic import, one file per
 * tool, fetched only when a tool is opened or scrolled near.
 */
import type { RegistryEntry } from "@toolbench/runtime";

const manifests = import.meta.glob("../../tools/*/tool.json", { eager: true, import: "default" }) as Record<string, unknown>;
const modules = import.meta.glob("../../tools/*/index.ts") as Record<string, () => Promise<unknown>>;

export function entries(m: Record<string, unknown>, code: Record<string, () => Promise<unknown>>): Record<string, RegistryEntry> {
	return Object.fromEntries(
		Object.entries(m).map(([path, manifest]) => {
			const dir = path.slice(0, path.lastIndexOf("/"));
			const id = dir.split("/").at(-1) ?? path;
			const load = code[`${dir}/index.ts`];
			if (!load) throw new Error(`${id} has a tool.json but no index.ts beside it`);
			return [id, { manifest, load: load as RegistryEntry["load"] }];
		}),
	);
}

export const registry = entries(manifests, modules);
