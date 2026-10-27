/**
 * Manifest validation for `RegistrySource`, a chunk of its own, for manifests the build did not check.
 *
 * ⚠️ Fetched by the first `list()` or `load()` of a source holding an unmarked manifest, never imported
 * statically. The validator, the manifest half of the migration chain and the feature check were most of the
 * SDK in the chunk every page loads, and a bundler splits by module, so one static import of this from the
 * runtime's eager code would put all of them back. Nothing renders before this has run: a manifest reaches the
 * element only through `list()`, which waits for it (SECURITY.md, and the link-scheme defect in
 * docs/architecture.md §14). A site built with `@toolbench/runtime/vite` never fetches it.
 */
import { upgradeManifest, validateManifest } from "@toolbench/sdk";
import { indexEntries, isMarked, type RegistryEntry, type Validated } from "./sources.ts";

/** Every entry upgraded and validated, keyed by id, a marked one as it is. Throws the first `ManifestError`, or on a repeated id. */
export function validateEntries(list: readonly RegistryEntry[]): Validated {
	return indexEntries(list, (raw) => (isMarked(raw) ? raw : validateManifest(upgradeManifest(raw))));
}
