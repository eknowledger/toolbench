/**
 * `@toolbench/sdk/build`: a `tool.json` checked at build time and written as a JavaScript module the runtime
 * trusts without running the validator. One implementation for `@toolbench/runtime/vite` and for the
 * `toolbench-manifests` command, so the two cannot drift.
 *
 * A manifest bundled into a site cannot change between the build and the visit, so checking it in every
 * reader's browser repeats a check whose answer was known when the site was built.
 *
 * The module is the upgraded, validated manifest, frozen all the way down, carrying a non-enumerable
 * `Symbol.for(VALIDATED_KEY)`. Each of the three is load-bearing:
 *
 *  - **A symbol**, because JSON cannot carry one: a manifest fetched as data is never marked, so the runtime
 *    always validates it.
 *  - **Non-enumerable**, because an enumerable symbol survives `{ ...manifest }`, so a copy with one field
 *    changed would keep the mark. The bench's own `javascript:` link fixture is such a copy, and it would
 *    have skipped validation (docs/architecture.md §14).
 *  - **Frozen**, recursively, because a marked object that page code could change after the build would
 *    vouch for whatever it was changed to. The runtime accepts the mark only on a frozen object.
 *
 * No file system here: callers read the file and say what it is called, so this runs anywhere.
 */
import { VALIDATED_KEY } from "./brand.ts";
import type { Manifest } from "./types.ts";
import { upgradeManifest } from "./upgrade.ts";
import { validateManifest } from "./validate.ts";

/** A manifest that failed at build time: the validator's message, with the file it came from. */
export class ManifestFileError extends Error {
	readonly file: string;
	/** The validator's own message, without the file, for a host that prints the file beside it. */
	readonly reason: string;
	constructor(file: string, reason: string) {
		super(`${file}: not a valid tool manifest. ${reason}`);
		this.name = "ManifestFileError";
		this.file = file;
		this.reason = reason;
	}
}

/** Parse, upgrade and validate one `tool.json`'s text. Throws `ManifestFileError` naming `file`. */
export function checkManifestText(text: string, file: string): Manifest {
	try {
		// A BOM is legal at the start of a file and not in JSON.parse.
		return validateManifest(upgradeManifest(JSON.parse(text.replace(/^\uFEFF/, ""))));
	} catch (error) {
		throw new ManifestFileError(file, error instanceof Error ? error.message : String(error));
	}
}

/*
 * A JSON value as a JavaScript expression with every object and array wrapped in `f(...)`, `Object.freeze`,
 * so the module freezes as it builds rather than walking the tree at run time.
 */
function literal(value: unknown): string {
	if (Array.isArray(value)) return `f([${value.map(literal).join(",")}])`;
	if (value !== null && typeof value === "object") return `f(${members(value as Record<string, unknown>)})`;
	return JSON.stringify(value);
}

function members(o: Record<string, unknown>): string {
	const parts = Object.entries(o)
		.filter(([, v]) => v !== undefined)
		// ⚠️ A quoted "__proto__" in an object literal sets the prototype, where JSON.parse made a key of it.
		.map(([k, v]) => `${k === "__proto__" ? `["__proto__"]` : JSON.stringify(k)}:${literal(v)}`);
	return `{${parts.join(",")}}`;
}

/** The module for a validated manifest: frozen all the way down, and marked. Its default export is the manifest. */
export function manifestModule(manifest: Manifest): string {
	return [
		"const f = Object.freeze;",
		`const manifest = ${members(manifest as unknown as Record<string, unknown>)};`,
		`Object.defineProperty(manifest, Symbol.for(${JSON.stringify(VALIDATED_KEY)}), { value: true });`,
		"export default f(manifest);",
		"",
	].join("\n");
}
