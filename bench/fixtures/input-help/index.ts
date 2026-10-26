/**
 * A form for the input hooks (#224, contract version 8), for the gallery and the browser tests.
 *
 * One input of each of four types, three of them with a `role`, so a test can check every row's
 * `data-input`, `data-type` and `data-role` and a host sheet can style one input by name.
 */
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { values: string; unit: string; slo: number; strict: boolean };

/** Nearest-rank percentile of sorted values: the smallest value with at least p of them at or below it. */
const rank = (sorted: number[], p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] as number;

export default {
	run({ values, unit, slo, strict }): Output {
		const parts = values.split(/[\s,]+/).filter(Boolean);
		const numbers = parts.map(Number);
		const bad = numbers.findIndex((n) => !Number.isFinite(n) || n < 0);
		if (bad >= 0) return { kind: "error", message: `"${parts[bad]}" is not a latency.`, input: "values" };
		if (numbers.length === 0) return { kind: "error", message: "Paste at least one latency.", input: "values" };
		const sorted = [...numbers].sort((a, b) => a - b);
		const scale = unit === "s" ? 1000 : 1;
		const p99 = rank(sorted, 0.99) * scale;
		const missed = strict ? p99 >= slo : p99 > slo;
		return {
			kind: "fields",
			fields: [
				{ label: "p50", value: String(rank(sorted, 0.5) * scale), note: "ms" },
				{ label: "p99", value: String(p99), note: "ms", tone: missed ? "bad" : "good" },
				{ label: "Against the target", value: missed ? `Over ${slo} ms` : `Within ${slo} ms`, mono: false },
			],
		};
	},
} satisfies Tool<Input>;
