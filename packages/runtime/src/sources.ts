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
import type { Validated } from "./validation.ts";

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

/**
 * The everyday source: a map of ids to entries, which a host builds however it likes: by hand, or
 * from a bundler's directory glob.
 *
 * Every manifest is upgraded and validated once, by the first `list()` or `load()`, so a malformed one
 * rejects that call with a `ManifestError` naming the field, rather than becoming a mystery at render time.
 *
 * ⚠️ Not in the constructor, where it was until the validator left the chunk every page loads (#259): a
 * constructor cannot await the validation chunk, so it no longer throws on a bad manifest. `list()` rejects
 * with the same message instead, and every `<tool-host>` on the page shows it.
 */
export class RegistrySource implements ToolSource {
	#raw: readonly RegistryEntry[];
	#entries: Validated | undefined;
	#ready: Promise<Validated> | undefined;

	constructor(entries: Record<string, RegistryEntry> | RegistryEntry[]) {
		this.#raw = Array.isArray(entries) ? entries : Object.values(entries);
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
			throw new Error(
				`"${id}" does not default-export a tool. A tool module looks like: export default { run(input, ctx) { … } }`,
			);
		}
		return { manifest: entry.manifest, tool: module.default };
	}

	/** Synchronous lookup, for a host rendering a card list without awaiting. `undefined` until `list()` has resolved. */
	manifest(id: string): Manifest | undefined {
		return this.#entries?.get(id)?.manifest;
	}
}
