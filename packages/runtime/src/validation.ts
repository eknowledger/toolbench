/**
 * Manifest validation for `RegistrySource`, and the checks before a run, a chunk of their own.
 *
 * ⚠️ Fetched by the first `list()` or `load()`, never imported statically. The validator, the manifest half
 * of the migration chain and the feature check were most of the SDK in the chunk every page loads, and a
 * bundler splits by module, so one static import of this from the runtime's eager code would put all of
 * them back. Nothing renders before this has run: a manifest reaches the element only through `list()`,
 * which waits for it (SECURITY.md, and the link-scheme defect in docs/architecture.md §14).
 */
import type { Manifest, ToolModule } from "@toolbench/sdk";
import { upgradeManifest, validateManifest } from "@toolbench/sdk";
import type { RegistryEntry } from "./sources.ts";

export type Validated = Map<string, { manifest: Manifest; load(): Promise<ToolModule> }>;

/** Every entry upgraded and validated, keyed by id. Throws the first `ManifestError`, or on a repeated id. */
export function validateEntries(list: readonly RegistryEntry[]): Validated {
	const entries: Validated = new Map();
	for (const entry of list) {
		const manifest = validateManifest(upgradeManifest(entry.manifest));
		if (entries.has(manifest.id)) {
			/*
			 * Two tools claiming one id is not a small problem: the second silently wins, and every
			 * link derived from the id then points at the wrong source. Better to refuse.
			 */
			throw new Error(`Two tools declare the id "${manifest.id}". Ids must be unique within a source.`);
		}
		entries.set(manifest.id, { manifest, load: entry.load });
	}
	return entries;
}

/*
 * The checks `<tool-host>` makes before every run (#203, #204), fetched with a tool's code when it activates
 * so the first Run never waits on a request. A page whose `RegistrySource` has listed its tools already has
 * this chunk, so for it that is no request at all.
 *
 * ⚠️ Here rather than a chunk of their own. Split, they were 722 gzipped bytes, and the validator imports
 * them, so every page that validates fetched two chunks for 250 bytes more than this one, measured, to save
 * only a host with its own `ToolSource` the rest of the validator.
 */
export { inputProblem } from "@toolbench/sdk";
