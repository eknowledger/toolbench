/**
 * Build-time seeding: compute a tool's result for its default inputs, so a card can show a real
 * answer before any JavaScript runs.
 *
 * The runtime already reads a seed from an inline `<script type="application/json"
 * data-toolbench-seed>`. What was missing was anything that helps produce one, which meant hosts
 * hand-wrote the JSON. A hand-written seed goes stale silently the moment the tool changes, and a
 * stale seed is worse than no seed: it shows a confidently wrong answer that nothing will correct
 * until a reader presses Run.
 *
 * This module has no filesystem or network access, which is why it lives in the main entry point
 * alongside the rest of the contract.
 */
import { upgradeOutput } from "./migrate.ts";
import type { InputValues, LoadedTool, Output } from "./types.ts";

export interface SeedOptions {
	/**
	 * Abandon the run after this long. Default 5000, matching the runtime's own worker timeout.
	 *
	 * ⚠️ Advisory, not a guarantee. It aborts the signal, so a tool that checks `ctx.signal` stops. A
	 * tool that ignores it cannot be interrupted in-process, exactly as on the runtime's main thread:
	 * there is no thread to terminate. If a build hangs here, the tool is not honouring its signal, and
	 * that is a defect in the tool.
	 */
	timeoutMs?: number;
}

export class SeedError extends Error {
	readonly toolId: string;
	constructor(toolId: string, message: string, options?: { cause?: unknown }) {
		super(`seed("${toolId}"): ${message}`, options);
		this.name = "SeedError";
		this.toolId = toolId;
	}
}

/** The input a card's form will show: every declared default, and nothing else. */
export function defaultInputs(loaded: Pick<LoadedTool, "manifest">): InputValues {
	const input: Record<string, string | number | boolean> = {};
	for (const spec of loaded.manifest.inputs) input[spec.id] = spec.default;
	return input as InputValues;
}

/**
 * Run a tool against its manifest defaults and return the result, for a host to serialise into a page.
 *
 * ⚠️ **Defaults only, deliberately.** There is no way to pass different inputs, because the seed has to
 * agree with the form the card renders. A seed computed from other inputs would show one answer and
 * then change to a different one the moment a reader pressed Run, with nothing on screen explaining
 * why.
 *
 * **Throws rather than returning nothing** in both failure cases, and both are authoring bugs:
 *
 *  - the tool throws, which its own fixtures should have caught;
 *  - the tool returns `kind: "error"`, meaning the author's own defaults are invalid input.
 *
 * A card seeded with an error message is worse than an unseeded card, so neither is quietly tolerated.
 * A host that wants a missing seed instead of a failed build can wrap this in `try`/`catch`; that is one
 * line, and the policy belongs to the host rather than here.
 */
export async function seed(loaded: LoadedTool, options: SeedOptions = {}): Promise<Output> {
	const { manifest, tool } = loaded;
	const timeoutMs = options.timeoutMs ?? 5000;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let output: Output;
	try {
		output = await tool.run(defaultInputs(loaded), {
			signal: controller.signal,
			// Nothing is watching at build time, so partial results are discarded.
			progress: () => {},
		});
	} catch (error) {
		if (controller.signal.aborted) {
			throw new SeedError(manifest.id, `did not finish within ${timeoutMs}ms`, { cause: error });
		}
		throw new SeedError(manifest.id, "threw while running its own default inputs", { cause: error });
	} finally {
		clearTimeout(timer);
	}

	if (output.kind === "error") {
		throw new SeedError(
			manifest.id,
			`rejected its own default inputs: ${output.message}. A tool's defaults must produce a real result.`,
		);
	}
	// Same treatment the runtime gives a result, so a stored seed is always current-shaped.
	return upgradeOutput(output, manifest.sdk);
}

/**
 * Serialise a seed for embedding in `<script type="application/json" data-toolbench-seed>`.
 *
 * ⚠️ Use this rather than `JSON.stringify`. An HTML parser ends a `<script>` element at the first
 * `</script` in its text, regardless of JSON quoting, so a tool whose output contains that string
 * would break the page and truncate the document. For a tool that echoes any part of its input, that
 * is reachable by a reader.
 *
 * Escaping `<` to the `\u003c` escape is the standard fix: still valid JSON, parses back to exactly the
 * same value, and cannot close the element. U+2028 and U+2029 are escaped for a related reason, since
 * they are legal inside a JSON string but are line terminators in JavaScript.
 */
export function serialiseSeed(output: Output): string {
	return JSON.stringify(output)
		.replace(/</g, "\\u003c")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
}
