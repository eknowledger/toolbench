/**
 * The chart shapes from issue 111, each drawn with the data that exposed it.
 *
 * It lives in the bench rather than in `tools/` because it is not an example of a good tool. The values
 * are frame numbers and per-frame times: a whole-number x where nothing exists between two points, which
 * is the case every defect in that issue came from. The browser tests read the geometry these produce.
 */
import type { Output, Series, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { case: string };

const frames = Array.from({ length: 20 }, (_, i) => i + 1);

/** Delivery time of each frame when frame 5 is lost and everything after it waits for the copy at `repair`. */
const held = (repair: number): number[] => frames.map((n) => (n < 5 ? 20 * n + 30 : Math.max(20 * n + 30, repair)));
const lateBy = (repair: number): number[] => held(repair).map((t, i) => Math.max(0, t - (20 * (i + 1) + 70)));

const bars = (label: string, points: (number | null)[]): Series => ({ label, unit: "ms", shape: "bar", points });

export default {
	run(input): Output {
		switch (input.case) {
			case "lines":
				return {
					kind: "series",
					chart: {
						xLabel: "Frame",
						yLabel: "Time",
						yUnit: "ms",
						x: frames,
						series: [
							{ label: "Deadline", unit: "ms", points: frames.map((n) => 20 * n + 70) },
							{ label: "Arrives", unit: "ms", points: frames.map((n) => (n === 5 ? null : 20 * n + 30)) },
							{ label: "Released", unit: "ms", points: held(250) },
						],
					},
				};
			case "markers":
			case "points": {
				// Three series that coincide on frames 1 to 4: the case where lines alone hid two of them.
				const shape = input.case === "points" ? { shape: "points" as const } : { markers: true };
				return {
					kind: "series",
					chart: {
						xLabel: "Frame",
						yLabel: "Time",
						yUnit: "ms",
						x: frames,
						series: [
							{ label: "Arrives", unit: "ms", ...shape, points: frames.map((n) => (n === 5 ? null : 20 * n + 30)) },
							{ label: "Released, fast", unit: "ms", ...shape, points: held(250) },
							{ label: "Released, timeout", unit: "ms", ...shape, points: held(330) },
						],
					},
				};
			}
			case "two-bars":
				return {
					kind: "series",
					chart: { xLabel: "Frame", yLabel: "Late by", yUnit: "ms", x: frames, series: [bars("Repair at 250", lateBy(250)), bars("Repair at 330", lateBy(330))] },
				};
			case "zero-bars":
				return {
					kind: "series",
					chart: { xLabel: "Frame", yLabel: "Late by", yUnit: "ms", x: frames, series: [bars("Late by", frames.map(() => 0))] },
				};
			case "signed-bars":
				return {
					kind: "series",
					chart: { xLabel: "Frame", yLabel: "Slack", yUnit: "ms", x: [1, 2, 3, 4], series: [bars("Slack", [-10, 10, -30, 40])] },
				};
			default:
				return { kind: "error", message: `No case called "${input.case}".`, input: "case" };
		}
	},
} satisfies Tool<Input>;
