/**
 * Echoes what each of the newer input types hands `run` (#203), one field per input, so a browser test reads
 * exactly the value that arrived rather than what the control shows.
 *
 * A bench fixture rather than a tool: it exists to put the segmented select, the date, the colour and the secret on screen. "Detect from header"
 * is refused, naming the select, because there is no header here to read; that is how the segmented
 * control's invalid state gets drawn.
 */
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { order: string; captured: string; accent: string; token: string };

export default {
	run({ order, captured, accent, token }): Output {
		if (order === "auto") return { kind: "error", message: "Byte order cannot be detected here: there is no header to read a 0xFEFF mark from.", input: "order" };
		return {
			kind: "fields",
			fields: [
				{ label: "order", value: JSON.stringify(order) },
				{ label: "captured", value: JSON.stringify(captured) },
				{ label: "accent", value: JSON.stringify(accent) },
				// Its length, never the value: a result is on screen, announced, and in a host's tool-run event.
				{ label: "token", value: `${token.length} characters` },
			],
		};
	},
} satisfies Tool<Input>;
