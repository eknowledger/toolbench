/**
 * Where tools come from.
 *
 * One interface, so the runtime never knows or cares. Two implementations ship today:
 *
 *  - **`RegistrySource`** — tools the host's bundler already knows about, whether they came from a
 *    local directory or a dependency. This is the everyday case.
 *  - **`FetchSource`** — manifests fetched at runtime, for a host that lists tools dynamically. It
 *    still gets its *modules* from the bundler, for the reason below.
 *
 * ⚠️ **The asymmetry that shapes this file.** A manifest is data and can arrive whenever you like. A
 * module is code, and on a static site there is no way to fetch and run code without `eval` — which
 * means no bundling, no tree-shaking, and a Content-Security-Policy you would rather keep. So a
 * source may resolve *metadata* however it wants, but the *module* must be something the bundler
 * saw. A GitHub-backed source therefore works by generating a registry at build time, not by
 * fetching JavaScript in the browser.
 */
import type { LoadedTool, Manifest, ToolModule } from "@toolbench/sdk";
import { VALIDATED_KEY } from "@toolbench/sdk";

export interface ToolSource {
	/** Every tool this source can offer, already validated and brought up to the current contract. */
	list(): Promise<Manifest[]>;
	/** The manifest plus the module, ready to run. */
	load(id: string): Promise<LoadedTool>;
}

/** One tool as a host declares it: raw manifest data plus a lazy import of its module. */
export interface RegistryEntry {
	/** The parsed `tool.json`, unchecked: `RegistrySource` validates and upgrades it. */
	manifest: unknown;
	/** A lazy import of the tool's module, called only when the tool is opened or scrolled near. */
	load(): Promise<ToolModule>;
}

export class ToolNotFoundError extends Error {
	constructor(id: string, known: string[]) {
		super(
			`No tool with id "${id}". ${known.length > 0 ? `Known ids: ${known.join(", ")}.` : "The registry is empty."}`,
		);
		this.name = "ToolNotFoundError";
	}
}

/** Every entry by id, as `RegistrySource` holds them once they are checked. */
export type Validated = Map<string, { manifest: Manifest; load(): Promise<ToolModule> }>;

/**
 * The mark `@toolbench/runtime/vite` and `toolbench-manifests` put on a manifest they validated at build time
 * (`@toolbench/sdk/build`). A symbol, because JSON cannot carry one: a manifest that arrived as data, from a
 * server or a CMS, is never marked, so it is always checked.
 */
export const VALIDATED = Symbol.for(VALIDATED_KEY);

/**
 * Validated at build time, so the validator need not run here, or even be downloaded.
 *
 * ⚠️ Frozen as well as marked. The build freezes every object in a manifest it emits; a marked object that is
 * not frozen could have been changed since the build, by page code, so it is checked like any other. The mark
 * is defined non-enumerable, so `{ ...manifest }` is unmarked too (docs/architecture.md §14).
 */
export function isMarked(manifest: unknown): manifest is Manifest {
	return typeof manifest === "object" && manifest !== null && Object.isFrozen(manifest) && (manifest as Record<symbol, unknown>)[VALIDATED] === true;
}

/**
 * Every entry keyed by id, each manifest through `check`. Throws whatever `check` throws, or on a repeated id.
 *
 * In the chunk every page loads, because the plugin sees one file at a time and so cannot see two files
 * claim one id. This is the one check a marked manifest still needs, and it is a `Map` lookup.
 */
export function indexEntries(list: readonly RegistryEntry[], check: (raw: unknown) => Manifest): Validated {
	const entries: Validated = new Map();
	for (const entry of list) {
		const manifest = check(entry.manifest);
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

/**
 * The everyday source: a map of ids to entries, which a host builds however it likes: by hand, or
 * from a bundler's directory glob.
 *
 * Every manifest is upgraded and validated once, so a malformed one rejects `list()` and `load()` with a
 * `ManifestError` naming the field, rather than becoming a mystery at render time.
 *
 * Two paths. A manifest marked by `@toolbench/runtime/vite` or `toolbench-manifests` was validated when the
 * site was built and is used as it is; when every entry is marked, the source is ready in the constructor and
 * the validation chunk is never fetched. Any unmarked manifest, from a server say, sends the whole source to
 * that chunk, by the first `list()` or `load()`.
 *
 * ⚠️ The constructor never throws, on either path, so a host behaves the same with and without the plugin:
 * a repeated id or a bad manifest rejects `list()`, and every `<tool-host>` on the page shows it (#259).
 */
export class RegistrySource implements ToolSource {
	#raw: readonly RegistryEntry[];
	#entries: Validated | undefined;
	#ready: Promise<Validated> | undefined;

	constructor(entries: Record<string, RegistryEntry> | RegistryEntry[]) {
		this.#raw = Array.isArray(entries) ? entries : Object.values(entries);
		if (this.#raw.every((entry) => isMarked(entry.manifest))) {
			try {
				this.#entries = indexEntries(this.#raw, (manifest) => manifest as Manifest);
				this.#ready = Promise.resolve(this.#entries);
			} catch (error) {
				this.#ready = Promise.reject(error);
				// Rejected for every caller, but not an unhandled rejection on a page that never asks.
				this.#ready.catch(() => undefined);
			}
		}
	}

	/*
	 * Once per source. A refused manifest stays refused, but a chunk that failed to arrive is asked for again
	 * by the next call, because a dropped request says nothing about the manifests.
	 */
	#validated(): Promise<Validated> {
		return (this.#ready ??= import("./validation.ts").then(
			(module) => (this.#entries = module.validateEntries(this.#raw)),
			(error: unknown) => {
				this.#ready = undefined;
				throw error;
			},
		));
	}

	async list(): Promise<Manifest[]> {
		return [...(await this.#validated()).values()].map((e) => e.manifest);
	}

	async load(id: string): Promise<LoadedTool> {
		const entries = await this.#validated();
		const entry = entries.get(id);
		if (!entry) throw new ToolNotFoundError(id, [...entries.keys()]);
		const module = await entry.load();
		if (typeof module?.default?.run !== "function") {
			throw new Error(`"${id}" must default-export { run(input, ctx) }.`);
		}
		return { manifest: entry.manifest, tool: module.default };
	}

	/**
	 * Synchronous lookup, for a host rendering a card list without awaiting. With every manifest marked by the
	 * build plugin it answers from the constructor on; otherwise `undefined` until `list()` has resolved.
	 */
	manifest(id: string): Manifest | undefined {
		return this.#entries?.get(id)?.manifest;
	}
}
