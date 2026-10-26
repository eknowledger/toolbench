/**
 * Echoes what each of the newer input types hands `run` (#203), one field per input, so a browser test reads
 * exactly the value that arrived rather than what the control shows.
 *
 * A bench fixture rather than a tool: it exists to put the segmented select on screen. "Detect from header"
 * is refused, naming the select, because there is no header here to read; that is how the segmented
 * control's invalid state gets drawn.
 */
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { order: string };

export default {
	run({ order }): Output {
		if (order === "auto") return { kind: "error", message: "Byte order cannot be detected here: there is no header to read a 0xFEFF mark from.", input: "order" };
		return { kind: "fields", fields: [{ label: "order", value: JSON.stringify(order) }] };
	},
} satisfies Tool<Input>;
