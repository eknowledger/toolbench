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
			case "readout": {
				// The tool says what each point means: a heading per frame, and a note on every late one.
				const deadline = frames.map((n) => 20 * n + 70);
				const released = held(250);
				return {
					kind: "series",
					chart: {
						xLabel: "Frame",
						yLabel: "Time",
						yUnit: "ms",
						x: frames,
						readout: { crosshair: "both", titles: frames.map((n) => (n === 5 ? "Frame 5, lost and resent" : null)) },
						series: [
							{ label: "Deadline", unit: "ms", points: deadline },
							{
								label: "Released",
								unit: "ms",
								markers: true,
								points: released,
								notes: released.map((t, i) => (t > (deadline[i] as number) ? `${t} ms, ${t - (deadline[i] as number)} ms late` : null)),
							},
						],
					},
				};
			}
			case "linked": {
				// Frames 4 to 9 as a chart and as a table, linked both ways, and the chart's own data table too.
				const span = frames.slice(3, 9);
				const released = held(250).slice(3, 9);
				return {
					kind: "group",
					parts: [
						{
							kind: "series",
							chart: {
								id: "release",
								xLabel: "Frame",
								yLabel: "Time",
								yUnit: "ms",
								x: span,
								readout: { highlightTable: true },
								series: [
									{ label: "Deadline", unit: "ms", points: span.map((n) => 20 * n + 70) },
									{ label: "Released", unit: "ms", markers: true, points: released },
								],
							},
						},
						{
							kind: "table",
							caption: "Each frame, and whether it played",
							columns: [{ label: "Frame" }, { label: "Released", align: "end", mono: true }, { label: "Played" }],
							rows: span.map((n, i) => [n, `${released[i]} ms`, (released[i] as number) <= 20 * n + 70 ? "on time" : "late"]),
							link: { chart: "release", keys: span },
						},
					],
				};
			}
			case "categories":
				// Three call topologies, three participants, 32 kb/s each: upload per client, and the server's load.
				return {
					kind: "series",
					chart: {
						xLabel: "Topology",
						yLabel: "Bitrate",
						yUnit: "kb/s",
						x: ["Mesh", "MCU", "Selective forwarding"],
						series: [
							{ label: "Upload per client", unit: "kb/s", shape: "bar", points: [64, 32, 32] },
							{ label: "Download per client", unit: "kb/s", shape: "bar", points: [64, 32, 64] },
						],
					},
				};
			case "many-categories":
				// Hours of a day: more categories than labels fit, so every few are labelled and all are in the table.
				return {
					kind: "series",
					chart: {
						xLabel: "Hour",
						yLabel: "Calls",
						x: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`),
						series: [{ label: "Calls", shape: "bar", points: Array.from({ length: 24 }, (_, h) => Math.round(40 + 35 * Math.sin(((h - 6) / 24) * 2 * Math.PI))) }],
					},
				};
			case "thresholds":
				// Mouth-to-ear delay per call against ITU-T G.114's planning guides: 150 ms preferred, 400 ms the limit.
				return {
					kind: "series",
					chart: {
						xLabel: "Call",
						yLabel: "Mouth-to-ear delay",
						yUnit: "ms",
						x: frames.slice(0, 12),
						thresholds: [
							{ y: 150, label: "150 ms, G.114 preferred", tone: "warn" },
							{ y: 400, label: "400 ms, G.114 planning limit", tone: "bad" },
						],
						series: [{ label: "Delay", unit: "ms", markers: true, points: [120, 135, 128, 160, 190, 142, 138, 210, 175, 131, 126, 148] }],
					},
				};
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
