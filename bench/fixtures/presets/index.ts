/**
 * Worst-case wall time of one request with retries: (retries + 1) × (connect + read), plus a backoff
 * that doubles after each retry.
 *
 * A bench fixture rather than a tool, because it exists to put select presets (#151) on screen: the
 * arithmetic is there so a stale result visibly disagrees with the form. The last field echoes the
 * select's own value, which is how a test proves `run` receives the option and not only what it filled.
 */
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { stack: string; connect: number; read: number; retries: number; backoff: number };

export default {
	run({ stack, connect, read, retries, backoff }): Output {
		let waited = 0;
		for (let k = 0; k < retries; k++) waited += backoff * 2 ** k;
		const worst = (retries + 1) * (connect + read) + waited / 1000;
		return {
			kind: "fields",
			fields: [
				{ label: "Worst case", value: `${worst.toFixed(1)} s` },
				{ label: "Attempts", value: String(retries + 1) },
				{ label: "Spent in backoff", value: `${(waited / 1000).toFixed(2)} s` },
				{ label: "Library", value: stack },
			],
		};
	},
} satisfies Tool<Input>;
