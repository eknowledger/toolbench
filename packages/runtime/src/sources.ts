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
import { upgradeManifest, validateManifest } from "@toolbench/sdk";

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
 * Validation happens once, on construction, so a malformed manifest is a startup error with a field
 * name in it rather than a mystery at render time.
 */
export class RegistrySource implements ToolSource {
	#entries = new Map<string, { manifest: Manifest; load(): Promise<ToolModule> }>();

	constructor(entries: Record<string, RegistryEntry> | RegistryEntry[]) {
		const list = Array.isArray(entries) ? entries : Object.values(entries);
		for (const entry of list) {
			const manifest = validateManifest(upgradeManifest(entry.manifest));
			if (this.#entries.has(manifest.id)) {
				/*
				 * Two tools claiming one id is not a small problem: the second silently wins, and every
				 * link derived from the id then points at the wrong source. Better to refuse.
				 */
				throw new Error(`Two tools declare the id "${manifest.id}". Ids must be unique within a source.`);
			}
			this.#entries.set(manifest.id, { manifest, load: entry.load });
		}
	}

	async list(): Promise<Manifest[]> {
		return [...this.#entries.values()].map((e) => e.manifest);
	}

	async load(id: string): Promise<LoadedTool> {
		const entry = this.#entries.get(id);
		if (!entry) throw new ToolNotFoundError(id, [...this.#entries.keys()]);
		const module = await entry.load();
		if (typeof module?.default?.run !== "function") {
			throw new Error(`"${id}" must default-export { run(input, ctx) }.`);
		}
		return { manifest: entry.manifest, tool: module.default };
	}

	/** Synchronous lookup, for a host rendering a card list without awaiting. */
	manifest(id: string): Manifest | undefined {
		return this.#entries.get(id)?.manifest;
	}
}
