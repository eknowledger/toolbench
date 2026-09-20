/**
 * A histogram of pasted numbers.
 *
 * The tool exists so the runtime's `bar` shape and a `series`-only result (no group around the chart)
 * have a real tool behind them. queue-explorer already draws two line series on two axes, so the
 * second axis here is not new; bars are, and so is a chart that is the whole output. A card of this
 * tool also marks no input `primary`, which is the documented fallback: the card shows the first
 * input and has to cope.
 *
 * Equal-width bins, counts on the left, running percent on the right. The reader picks the bin
 * count. Automatic width rules (Sturges, Freedman-Diaconis) are a different tool.
 *
 * ⚠️ This is the tool that carries `autoRun`, and it earned it by being boring.
 *
 * `autoRun` is for tools that are genuinely instant, and "instant" has to hold for the worst input the
 * manifest permits, not the default one. Here that is 20,000 characters of `values` against 30 bins: a
 * linear scan for numbers, one pass to bin them, and two small maps. Measured at that bound, 0.3 ms
 * warm and 1.4 ms cold. There is no input a reader can type that changes the shape of that work, which
 * is the property `autoRun` actually requires and the reason regex-explainer cannot have it.
 */
import type { Chart, Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { values: string; bins: number };

export type ParsedValues = { values: number[] } | { error: string; at: number; len: number };

/**
 * Parse a list of numbers.
 *
 * A comma sitting between two digits is refused. The tokenizer also splits on commas, so `1,204`
 * would otherwise become 1 and 204 and every figure on the chart would look reasonable and all of
 * them would be wrong.
 */
export function parseValues(text: string): ParsedValues {
	const grouped = /(\d),(\d)/.exec(text);
	if (grouped && grouped.index !== undefined) {
		return {
			error: "A comma between digits is not a thousands separator. Separate numbers with spaces, or with a comma and a space.",
			at: grouped.index + 1,
			len: 1,
		};
	}

	const values: number[] = [];
	const token = /[^\s,;]+/g;
	let match = token.exec(text);
	while (match !== null) {
		const value = Number(match[0]);
		if (!Number.isFinite(value)) {
			return { error: `"${match[0]}" is not a number.`, at: match.index, len: match[0].length };
		}
		values.push(value);
		match = token.exec(text);
	}
	return { values };
}

/** Kill binary-float crumbs so a midpoint of 2.5 stays 2.5 in fixtures. */
export function cleanNumber(value: number): number {
	const rounded = Math.round(value * 1e10) / 1e10;
	return Object.is(rounded, -0) ? 0 : rounded;
}

export function percent(part: number, whole: number): number {
	return cleanNumber(Math.round((part / whole) * 1000) / 10);
}

export type Bins = { x: number[]; counts: number[]; cumulative: number[] };

/**
 * Equal-width bins over [min, max].
 *
 * The last bin is closed on the right so `max` is not pushed into a bin that does not exist. When
 * every value is the same there is no width to split, so the result is one bar at that value.
 */
export function binValues(values: number[], bins: number): Bins {
	const n = values.length;
	const min = Math.min(...values);
	const max = Math.max(...values);

	if (min === max) {
		return { x: [cleanNumber(min)], counts: [n], cumulative: [100] };
	}

	const width = (max - min) / bins;
	const counts = Array.from({ length: bins }, () => 0);
	for (const value of values) {
		const index = value === max ? bins - 1 : Math.min(bins - 1, Math.floor((value - min) / width));
		counts[index] = (counts[index] as number) + 1;
	}

	const x = counts.map((_, i) => cleanNumber(min + (i + 0.5) * width));
	const cumulative: number[] = [];
	let running = 0;
	for (const count of counts) {
		running += count;
		cumulative.push(percent(running, n));
	}
	return { x, counts, cumulative };
}

function chartOf(bins: Bins): Chart {
	return {
		xLabel: "Bin midpoint",
		yLabel: "Count",
		yLabelRight: "Cumulative",
		x: bins.x,
		series: [
			{ label: "Count", points: bins.counts, shape: "bar" },
			{ label: "Cumulative", points: bins.cumulative, unit: "%", shape: "line", axis: "right" },
		],
	};
}

const tool: Tool<Input> = {
	run({ values, bins }) {
		const parsed = parseValues(values);
		if ("error" in parsed) {
			return { kind: "error", message: parsed.error, input: "values", at: parsed.at, len: parsed.len };
		}
		if (parsed.values.length === 0) {
			return { kind: "error", message: "No numbers yet. Paste measurements separated by spaces, commas or newlines.", input: "values" };
		}

		return { kind: "series", chart: chartOf(binValues(parsed.values, bins)) };
	},
};

export default tool;
