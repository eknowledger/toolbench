/**
 * A number input that asks for a slider (contract version 5).
 *
 * It lives in the bench rather than in `tools/` because it exists to put the `slider` control on screen
 * for the browser tests, not as an example of a tool. It answers with the value it was given, so a test
 * can tell which value the run actually received.
 */
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { rtt: number };

export default {
	run({ rtt }): Output {
		return { kind: "fields", fields: [{ label: "round-trip time", value: `${rtt} ms` }] };
	},
} satisfies Tool<Input>;
