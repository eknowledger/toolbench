/**
 * A retired tool, for the gallery. The runtime refuses to load it, so this module is never fetched; it
 * exists because a registry entry needs code to point at.
 *
 * The site's own example rather than the bench's fixture, for the same reason as legacy-converter: its
 * links lead onward within this site.
 */
import type { Output, Tool } from "@toolbench/sdk";

type Input = { value: number };

export default {
	run(): Output {
		return { kind: "fields", fields: [{ label: "unreachable", value: "a retired tool does not run" }] };
	},
} satisfies Tool<Input>;
