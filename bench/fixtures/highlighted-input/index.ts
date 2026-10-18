/**
 * Parses JSON and reports its shape.
 *
 * A bench fixture rather than a tool: it exists so a textarea declaring `lang` (#153) is on screen for the
 * browser tests. The default is long enough to scroll at 8 rows and has one line long enough to wrap,
 * because scroll sync and soft-wrap positions are where an overlay drifts from the text under it.
 */
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { config: string };

export default {
	run({ config }): Output {
		try {
			const parsed = JSON.parse(config) as Record<string, unknown>;
			return {
				kind: "fields",
				fields: [
					{ label: "Top-level keys", value: String(Object.keys(parsed).length) },
					{ label: "Characters", value: String(config.length) },
				],
			};
		} catch (error) {
			return { kind: "error", message: error instanceof Error ? error.message : String(error), input: "config" };
		}
	},
} satisfies Tool<Input>;
