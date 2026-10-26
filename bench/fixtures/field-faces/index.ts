/**
 * Fields in both faces (#209, contract version 8), for the gallery and the browser tests.
 *
 * One field says `mono: true`, two say `mono: false`, and one says nothing, so a test can tell the three
 * apart: the one that says nothing must draw exactly as a field did before `mono` existed.
 */
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { address: string };

export default {
	run({ address }): Output {
		return {
			kind: "fields",
			fields: [
				{ label: "Mapped address", value: address || "none", mono: true },
				{ label: "Integrity", value: "No message integrity attribute present", tone: "warn", mono: false },
				{ label: "Round trip", value: "42", note: "ms", mono: false },
				{ label: "Transaction", value: "a1b2c3d4e5f6a7b8c9d0e1f2" },
			],
		};
	},
} satisfies Tool<Input>;
