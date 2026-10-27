/**
 * `@toolbench/runtime/vite`: every `tool.json` the bundler imports is upgraded and validated at build time, in
 * Node, so a reader's browser never downloads the validator for it.
 *
 *     import { toolbench } from "@toolbench/runtime/vite";
 *     export default defineConfig({ plugins: [toolbench()] });
 *
 * A bad manifest fails the build, or shows Vite's error overlay in development, with the validator's message;
 * Vite prints the file beside it. The module becomes the manifest frozen and marked by `@toolbench/sdk/build`,
 * the implementation `toolbench-manifests` shares, and `RegistrySource` uses a marked manifest as it is.
 *
 * ⚠️ No import from `vite`. `packages/` has no dependencies, so the plugin is plain objects typed by the few
 * members they use, which Vite accepts structurally.
 *
 * ⚠️ Two plugins, not one, because of Vite's own JSON plugin. It runs after `enforce: "pre"` plugins and parses
 * whatever code it is given as JSON, so the pre plugin that sees the raw text cannot hand it JavaScript, and the
 * plugin after it, which can, sees Vite's generated module rather than the file. The first checks, the second
 * replaces, and a map keyed by the module id passes the result between them.
 */
import type { Manifest } from "@toolbench/sdk";
import { checkManifestText, ManifestFileError, manifestModule } from "@toolbench/sdk/build";

/** What another plugin can ask of this one, through Vite's `api` convention: the same check, done once. */
export interface ToolbenchViteApi {
	/** The validated manifest for a file's text, from the cache the build's own transform fills and reads. Throws `ManifestFileError`. */
	check(file: string, text: string): Manifest;
}

interface Chunk {
	type: string;
	fileName: string;
	moduleIds?: readonly string[];
	imports?: readonly string[];
}

/** The members of a Vite plugin this uses: enough for Vite to accept it, and no dependency on Vite's types. */
export interface ToolbenchVitePlugin {
	name: string;
	enforce?: "pre";
	api?: ToolbenchViteApi;
	configResolved?(config: { base: string }): void;
	transform?(this: { error(message: string): never }, code: string, id: string): { code: string; map: { mappings: "" } } | null;
	transformIndexHtml?: {
		order: "post";
		handler(html: string, ctx: { bundle?: Record<string, Chunk> }): { tag: string; attrs: Record<string, string>; injectTo: "head" }[] | undefined;
	};
}

export interface ToolbenchViteOptions {
	/** Which module ids are manifests. Default: a file named `tool.json`, with no query. */
	include?: (id: string) => boolean;
	/**
	 * Add `<link rel="modulepreload">` for the validation chunk to every built page, for a host whose manifests
	 * come from a server and so are validated in the browser. It is then fetched beside the runtime instead of
	 * after it. Off by default: a site whose manifests are all bundled never fetches the chunk.
	 */
	preloadValidation?: boolean;
}

const isManifest = (id: string) => id.endsWith("/tool.json");
// The runtime's validation module, from the published package or from this repository's source.
const isValidationModule = (id: string) => /[\\/]runtime[\\/](?:dist|src)[\\/]validation\.[jt]s$/.test(id);

export function toolbench(options: ToolbenchViteOptions = {}): ToolbenchVitePlugin[] {
	const include = options.include ?? isManifest;
	// By file, with the text it was checked from, so an edit in development is checked again.
	const cache = new Map<string, { text: string; manifest: Manifest; code?: string }>();
	const check = (file: string, text: string): Manifest => {
		const hit = cache.get(file);
		if (hit?.text === text) return hit.manifest;
		const manifest = checkManifestText(text, file);
		cache.set(file, { text, manifest });
		return manifest;
	};
	let base = "/";
	const plugins: ToolbenchVitePlugin[] = [
		{
			name: "toolbench:validate-manifest",
			enforce: "pre",
			api: { check },
			transform(code, id) {
				if (!include(id)) return null;
				try {
					check(id, code);
				} catch (error) {
					// The validator's whole message. No path in it: Vite prints the module's beside a plugin error.
					if (error instanceof ManifestFileError) this.error(`Not a valid tool manifest. ${error.reason}`);
					throw error;
				}
				return null;
			},
		},
		{
			name: "toolbench:mark-manifest",
			transform(_code, id) {
				const hit = cache.get(id);
				if (!hit || !include(id)) return null;
				hit.code ??= manifestModule(hit.manifest);
				return { code: hit.code, map: { mappings: "" } };
			},
		},
	];
	if (options.preloadValidation) {
		plugins.push({
			name: "toolbench:preload-validation",
			configResolved(config) {
				base = config.base;
			},
			transformIndexHtml: {
				order: "post",
				handler(html, ctx) {
					// Only a build has chunks with names; in development the module is fetched as it is imported.
					const bundle = ctx.bundle ?? {};
					const chunk = Object.values(bundle).find((c) => c.type === "chunk" && c.moduleIds?.some(isValidationModule));
					if (!chunk) return undefined;
					/*
					 * ⚠️ And every chunk it imports. A modulepreload fetches the one module, not what it imports, and the
					 * validation chunk imports the checks before a run. Preloading the chunk alone measured no faster than
					 * no preload at all, 578 ms against 582 on the bench: the round trip moved to the checks chunk.
					 */
					const files: string[] = [];
					const add = (c: Chunk | undefined) => {
						if (!c || files.includes(c.fileName)) return;
						files.push(c.fileName);
						for (const name of c.imports ?? []) add(bundle[name]);
					};
					add(chunk);
					// Not again for a chunk the page already loads or preloads: it imports the runtime chunk, for one.
					return files.filter((file) => !html.includes(`${base}${file}`)).map((file) => ({ tag: "link", attrs: { rel: "modulepreload", crossorigin: "", href: `${base}${file}` }, injectTo: "head" as const }));
				},
			},
		});
	}
	return plugins;
}
