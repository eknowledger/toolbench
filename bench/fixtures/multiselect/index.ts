/**
 * Echoes the two lists `run` receives (#204), as JSON, so a browser test reads exactly what arrived rather
 * than what the checkboxes and chips show, and counts the probes the plan makes.
 *
 * A bench fixture rather than a tool: it exists to put a multiselect on screen in both of its forms. No
 * region chosen is refused, naming the input, which is how a tool's own error on a list is drawn; fewer
 * than one record type never reaches here, because the runtime refuses it before Run.
 */
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { types: string[]; regions: string[] };

export default {
	run({ types, regions }): Output {
		if (regions.length === 0) return { kind: "error", message: "choose a region to ask from.", input: "regions" };
		return {
			kind: "fields",
			fields: [
				{ label: "types", value: JSON.stringify(types) },
				{ label: "regions", value: JSON.stringify(regions) },
				{ label: "probes", value: String(types.length * regions.length) },
			],
		};
	},
} satisfies Tool<Input>;
