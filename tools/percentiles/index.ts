/**
 * Percentiles, and the two definitions of them that disagree.
 *
 * The tool exists because of a specific, common mistake: **percentiles do not average.** A dashboard
 * showing "mean p99 across five hosts" is showing a number that corresponds to no event that ever
 * happened. This computes the true percentile of the pooled measurements, and shows the naive average
 * of the per-chunk percentiles beside it, so the size of the lie is visible rather than argued about.
 *
 * The second thing it shows is that "the p99" is not one number. Nearest-rank returns a value you
 * actually measured; linear interpolation returns a point between two measurements. On small or
 * skewed samples they differ by a lot, and neither is wrong — but a comparison between two systems
 * using different definitions is meaningless.
 *
 * Deliberately pure: no clock, no randomness, no I/O. Which is why every number below is covered by a
 * fixture with a hand-checked expectation.
 */
import type { Field, Output, Tool } from "@toolbench/sdk";

type Method = "nearest" | "linear";

const PERCENTILES = [50, 90, 95, 99, 99.9] as const;

/** A type alias, not an interface: see the note on `Tool` in the SDK. */
type Input = {
	values: string;
	method: string;
};

/**
 * Nearest-rank: the smallest measurement at or above the p-th position. Always a real observation.
 * Linear: interpolates between the two measurements either side of the position — the definition
 * numpy and R's type 7 use by default.
 */
export function percentile(sorted: number[], p: number, method: Method): number {
	if (sorted.length === 0) return Number.NaN;
	if (sorted.length === 1) return sorted[0] as number;
	if (method === "nearest") {
		const rank = Math.ceil((p / 100) * sorted.length);
		const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
		return sorted[index] as number;
	}
	const h = ((sorted.length - 1) * p) / 100;
	const lo = Math.floor(h);
	const hi = Math.min(sorted.length - 1, lo + 1);
	const weight = h - lo;
	return (sorted[lo] as number) * (1 - weight) + (sorted[hi] as number) * weight;
}

/**
 * A comma sitting between two digits is a thousands grouping, not a list separator. The tokenizer
 * splits on commas, so without this check a pasted `1,204 980 1,100 1,340` becomes seven
 * measurements, min 1 and mean 232.4, and nothing says the input was misread.
 */
function groupingComma(text: string): { error: string; at: number } | null {
	const hit = /[^\s;]*\d,\d[^\s;]*/.exec(text);
	if (hit === null) return null;
	/*
	 * Says what was found and how to say it instead. "is not a number" was both untrue, since 1,204 is a
	 * number to every reader, and self-contradicting, since the shared advice told them to separate with
	 * commas while a comma was the thing being refused.
	 */
	return {
		error: `"${hit[0]}" has a comma between digits, which could be a thousands grouping. Write digits only, or put a space after each comma`,
		at: hit.index,
	};
}

/** Parses forgivingly, but reports the exact character where it gave up. */
function parse(text: string): { values: number[] } | { error: string; at: number } {
	/*
	 * Before the token scan, so the whole text is judged as text. The cost is precedence: an input holding
	 * both a grouped number and an earlier unparseable token reports the grouping, not the earlier token.
	 * Both are refusals and the reader fixes both, so the offset being the second problem is the lesser
	 * evil against scanning twice.
	 */
	const grouped = groupingComma(text);
	if (grouped !== null) return grouped;
	const values: number[] = [];
	const token = /[^\s,;]+/g;
	let match: RegExpExecArray | null = token.exec(text);
	while (match !== null) {
		const value = Number(match[0]);
		if (!Number.isFinite(value)) {
			return { error: `"${match[0]}" is not a number. Separate measurements with spaces, commas or newlines`, at: match.index };
		}
		values.push(value);
		match = token.exec(text);
	}
	return { values };
}

function round(value: number): string {
	if (!Number.isFinite(value)) return "n/a";
	if (Number.isInteger(value)) return String(value);
	return value.toFixed(Math.abs(value) < 10 ? 2 : 1);
}

const tool: Tool<Input> = {
	run({ values, method }) {
		const parsed = parse(values);
		if ("error" in parsed) {
			return { kind: "error", message: `${parsed.error}.`, input: "values", at: parsed.at, len: 1 };
		}
		if (parsed.values.length === 0) {
			return { kind: "error", message: "No measurements yet. Paste some numbers.", input: "values" };
		}

		const chosen: Method = method === "linear" ? "linear" : "nearest";
		const sorted = [...parsed.values].sort((a, b) => a - b);
		const n = sorted.length;
		const sum = sorted.reduce((a, b) => a + b, 0);

		const summary: Field[] = [
			{ label: "count", value: String(n) },
			{ label: "p50", value: round(percentile(sorted, 50, chosen)) },
			{ label: "p99", value: round(percentile(sorted, 99, chosen)) },
			{ label: "max", value: round(sorted[n - 1] as number) },
			{ label: "mean", value: round(sum / n), note: "shown for contrast: it is not a percentile" },
			{ label: "min", value: round(sorted[0] as number) },
		];

		/*
		 * The comparison that makes the point. Split the measurements into four equal chunks — the way
		 * a real system splits across hosts or minutes — take each chunk's p99, and average those.
		 * That average is what most dashboards report. The true p99 of everything pooled is beside it.
		 */
		const chunks = splitInto(sorted, 4);
		const perChunk = chunks.map((chunk) => percentile([...chunk].sort((a, b) => a - b), 99, chosen));
		const naive = perChunk.reduce((a, b) => a + b, 0) / perChunk.length;
		const truth = percentile(sorted, 99, chosen);
		const drift = truth === 0 ? 0 : ((naive - truth) / truth) * 100;

		const rows = PERCENTILES.map((p) => {
			const nearest = percentile(sorted, p, "nearest");
			const linear = percentile(sorted, p, "linear");
			const gap = nearest === 0 ? 0 : ((linear - nearest) / nearest) * 100;
			return [
				{ text: `p${p}`, mono: true },
				{ text: round(nearest), mono: true },
				{ text: round(linear), mono: true },
				{ text: `${gap >= 0 ? "+" : ""}${gap.toFixed(1)}%`, mono: true, tone: Math.abs(gap) > 5 ? ("warn" as const) : ("normal" as const) },
			];
		});

		return {
			kind: "group",
			parts: [
				{ kind: "fields", fields: summary },
				{
					kind: "table",
					caption: "The same data under both definitions. A comparison across systems using different ones means nothing.",
					columns: [
						{ label: "", mono: true },
						{ label: "Nearest rank", align: "end", mono: true },
						{ label: "Linear", align: "end", mono: true },
						{ label: "Difference", align: "end", mono: true },
					],
					rows,
				},
				{
					kind: "fields",
					fields: [
						{ label: "true p99", value: round(truth), group: "Averaging percentiles", note: "of all measurements pooled" },
						{ label: "averaged p99", value: round(naive), group: "Averaging percentiles", note: "mean of four chunks' p99, which is what a dashboard usually shows" },
						{
							label: "error",
							value: `${drift >= 0 ? "+" : ""}${drift.toFixed(1)}%`,
							group: "Averaging percentiles",
							tone: Math.abs(drift) > 10 ? "bad" : Math.abs(drift) > 2 ? "warn" : "good",
							note: "how wrong the averaged figure is",
						},
					],
				},
			],
		} satisfies Output;
	},
};

function splitInto<T>(items: T[], count: number): T[][] {
	const size = Math.ceil(items.length / count);
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
	return chunks;
}

export default tool;
