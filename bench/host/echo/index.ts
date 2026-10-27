import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { text: string };

export default {
	run({ text }): Output {
		return { kind: "fields", fields: [{ label: "text", value: text }] };
	},
} satisfies Tool<Input>;
