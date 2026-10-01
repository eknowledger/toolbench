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
			case "stacked": {
				// An illustrative delay budget per path, stage by stage, against a 150 ms line.
				const stage = (label: string, points: number[]): Series => ({ label, unit: "ms", shape: "bar", stack: "budget", points });
				return {
					kind: "series",
					chart: {
						xLabel: "Path",
						yLabel: "Delay",
						yUnit: "ms",
						x: ["Same city", "Across a continent", "Through a relay"],
						thresholds: [{ y: 150, label: "150 ms", tone: "warn" }],
						series: [
							stage("Capture and encode", [25, 25, 25]),
							stage("Network", [10, 70, 95]),
							stage("Jitter buffer", [40, 40, 60]),
							stage("Decode and play", [15, 15, 15]),
						],
					},
				};
			}
			case "stacked-signed":
				// Two parts stacked either side of zero, and a plain bar beside the stack at each x.
				return {
					kind: "series",
					chart: {
						xLabel: "Case",
						yLabel: "Value",
						x: ["A", "B"],
						series: [
							{ label: "Part one", shape: "bar", stack: "s", points: [5, -3] },
							{ label: "Part two", shape: "bar", stack: "s", points: [2, -4] },
							{ label: "Alone", shape: "bar", points: [4, 4] },
						],
					},
				};
			case "horizontal": {
				// The same delay budget as the stacked case, read left to right against the 150 ms line.
				const stage = (label: string, points: number[]): Series => ({ label, unit: "ms", shape: "bar", stack: "budget", points });
				return {
					kind: "series",
					chart: {
						orientation: "horizontal",
						xLabel: "Path",
						yLabel: "Delay",
						yUnit: "ms",
						x: ["Same city", "Across a continent", "Through a relay"],
						thresholds: [{ y: 150, label: "150 ms", tone: "warn" }],
						series: [
							stage("Capture and encode", [25, 25, 25]),
							stage("Network", [10, 70, 95]),
							stage("Jitter buffer", [40, 40, 60]),
							stage("Decode and play", [15, 15, 15]),
						],
					},
				};
			}
			case "horizontal-grouped":
				return {
					kind: "series",
					chart: {
						orientation: "horizontal",
						xLabel: "Network",
						yLabel: "Loss",
						yUnit: "%",
						x: ["Office fibre", "Home broadband", "Mobile, good signal", "Mobile, at the cell's edge", "Satellite"],
						series: [
							{ label: "Median", unit: "%", shape: "bar", points: [0.1, 0.4, 0.8, 3.5, 1.2] },
							{ label: "Worst hour", unit: "%", shape: "bar", points: [0.3, 1.5, 2.6, 9.0, 4.0] },
						],
					},
				};
			case "step": {
				// A jitter buffer's target depth, which changes only when the receiver decides, drawn both ways.
				const depth = [40, 40, 40, 60, 60, 60, 60, 80, 80, 60, 60, 40];
				const ticks = frames.slice(0, 12);
				return {
					kind: "series",
					chart: {
						xLabel: "Second",
						yLabel: "Buffer depth",
						yUnit: "ms",
						x: ticks,
						series: [
							{ label: "As a step", unit: "ms", shape: "step", markers: true, points: depth },
							{ label: "As a line", unit: "ms", points: depth.map((d) => d - 10) },
						],
					},
				};
			}
			case "log": {
				/*
				 * The Mathis et al. ceiling on one TCP flow, throughput = (MSS / RTT) x 1.22 / sqrt(p), for a
				 * 1460-byte MSS at 50 ms, across loss rates from 0.01% to 10%: four orders of magnitude of loss,
				 * two of throughput, which only a log scale shows as the straight line it is.
				 */
				const loss = [0.01, 0.03, 0.1, 0.3, 1, 3, 10];
				const mbps = loss.map((pct) => Number((((1460 * 8) / 0.05) * (1.22 / Math.sqrt(pct / 100)) / 1e6).toPrecision(3)));
				return {
					kind: "series",
					chart: {
						xLabel: "Loss",
						xUnit: "%",
						yLabel: "Throughput ceiling",
						yUnit: "Mb/s",
						xScale: "log",
						yScale: "log",
						x: loss,
						series: [{ label: "One TCP flow, 50 ms", unit: "Mb/s", markers: true, points: mbps }],
					},
				};
			}
			case "log-zero":
				return {
					kind: "series",
					chart: {
						xLabel: "Run",
						yLabel: "Errors",
						yScale: "log",
						x: [1, 2, 3, 4, 5],
						series: [{ label: "Errors", markers: true, points: [12, 0, 150, 1200, 40] }],
					},
				};
			case "band": {
				// Illustrative arrival delay per second: the median, inside its p5 to p95 spread. Second 7 is missing.
				const seconds = frames.slice(0, 12);
				const median = [31, 32, 30, 34, 38, 36, null, 33, 31, 45, 52, 40];
				const spread = [4, 5, 4, 7, 12, 9, null, 6, 5, 18, 26, 14];
				return {
					kind: "series",
					chart: {
						xLabel: "Second",
						yLabel: "Arrival delay",
						yUnit: "ms",
						x: seconds,
						series: [
							{ label: "Median", unit: "ms", markers: true, points: median },
							{
								label: "p5 to p95",
								unit: "ms",
								shape: "band",
								points: median.map((m, i) => (m === null ? null : m + (spread[i] as number))),
								lower: median.map((m, i) => (m === null ? null : Math.max(0, m - (spread[i] as number) / 2))),
							},
						],
					},
				};
			}
			case "scatter":
				// Illustrative: response delay against turns cut off early, swept on two recording sets whose
				// timeouts were not the same, so neither series shares the other's x.
				return {
					kind: "series",
					chart: {
						xLabel: "End-of-speech timeout",
						xUnit: "ms",
						yLabel: "Turns cut off early",
						yUnit: "%",
						x: [],
						series: [
							{ label: "Quiet room", unit: "%", shape: "points", x: [200, 300, 400, 500, 700, 900], points: [18, 11, 7, 4.5, 2.2, 1.1] },
							{ label: "Street noise", unit: "%", shape: "points", x: [250, 350, 450, 600, 800, 1000, 1200], points: [26, 17, 12, 8, 4.8, 3.1, 2.0] },
						],
					},
				};
			case "box": {
				// Illustrative jitter per network, morning and evening; whiskers are p5 to p95, outliers beyond.
				type Box = { low: number; q1: number; median: number; q3: number; high: number; outliers?: number[] };
				const morning: Box[] = [
					{ low: 1, q1: 2, median: 3, q3: 4, high: 6 },
					{ low: 2, q1: 4, median: 6, q3: 9, high: 14, outliers: [22] },
					{ low: 4, q1: 8, median: 12, q3: 18, high: 30, outliers: [41, 47] },
				];
				const evening: Box[] = [
					{ low: 1, q1: 2, median: 3, q3: 5, high: 7 },
					{ low: 3, q1: 6, median: 9, q3: 14, high: 22, outliers: [31] },
					{ low: 6, q1: 12, median: 19, q3: 27, high: 40, outliers: [55] },
				];
				const series = (label: string, boxes: Box[]): Series => ({ label, unit: "ms", shape: "box", boxes, points: boxes.map((b) => b.median) });
				return {
					kind: "series",
					chart: {
						xLabel: "Network",
						yLabel: "Jitter, p5 to p95",
						yUnit: "ms",
						x: ["Fibre", "Broadband", "Mobile"],
						series: [series("Morning", morning), series("Evening", evening)],
					},
				};
			}
			case "heatmap": {
				// Illustrative: packet loss by hour and weekday, busiest in the evenings. Saturday 03:00 was not measured.
				const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
				const hours = Array.from({ length: 12 }, (_, h) => `${String(h * 2).padStart(2, "0")}:00`);
				const values = days.map((_, d) =>
					hours.map((_, h) => (d === 5 && h === 1 ? null : Number((0.2 + 1.6 * Math.max(0, Math.sin(((h - 3) / 12) * Math.PI)) * (d >= 5 ? 0.7 : 1)).toFixed(2)))),
				);
				return { kind: "heatmap", heatmap: { xLabel: "Hour", yLabel: "Day", label: "Packet loss", unit: "%", x: hours, y: days, values } };
			}
			case "heatmap-diverging":
				// Illustrative: change in p95 latency against last week, by region and service; negative is faster.
				return {
					kind: "heatmap",
					heatmap: {
						xLabel: "Service",
						yLabel: "Region",
						label: "Change in p95 latency",
						unit: "ms",
						scale: "diverging",
						midpoint: 0,
						x: ["Signalling", "Media relay", "Transcription", "Synthesis"],
						y: ["Europe", "North America", "Asia Pacific"],
						values: [
							[-4, 2, 18, -9],
							[1, -12, 6, 0],
							[7, 25, -3, 11],
						],
					},
				};
			case "pie":
				// Illustrative: where 48 kb/s of one voice stream goes, in the order a packet is built.
				return {
					kind: "pie",
					pie: {
						label: "One voice stream, 48 kb/s",
						unit: "kb/s",
						slices: [
							{ label: "Opus audio", value: 32 },
							{ label: "RTP headers", value: 4.8 },
							{ label: "UDP headers", value: 3.2 },
							{ label: "IPv4 headers", value: 8 },
						],
					},
				};
			case "donut":
				return {
					kind: "pie",
					pie: {
						label: "Time to first audio",
						unit: "ms",
						donut: true,
						total: "620 ms",
						slices: [
							{ label: "Speech recognition", value: 180 },
							{ label: "Language model", value: 310 },
							{ label: "Speech synthesis", value: 130 },
						],
					},
				};
			case "donut-exploded":
				// The same time to first audio, with the part the text is about, the language model, pulled out.
				return {
					kind: "pie",
					pie: {
						label: "Time to first audio",
						unit: "ms",
						donut: true,
						total: "620 ms",
						slices: [
							{ label: "Speech recognition", value: 180 },
							{ label: "Language model", value: 310, explode: true },
							{ label: "Speech synthesis", value: 130 },
						],
					},
				};
			case "pie-many":
				return {
					kind: "pie",
					pie: {
						label: "Calls by codec",
						slices: [
							{ label: "Opus", value: 640 },
							{ label: "G.711", value: 180 },
							{ label: "G.722", value: 90 },
							{ label: "AMR-WB", value: 40 },
							{ label: "iLBC", value: 20 },
							{ label: "Speex", value: 12 },
							{ label: "G.729", value: 10 },
							{ label: "GSM", value: 8 },
						],
					},
				};
			case "pie-negative":
				return { kind: "pie", pie: { label: "Change by region", slices: [{ label: "Up", value: 5 }, { label: "Down", value: -3 }] } };
			case "area":
				// Illustrative: one call's send rate over a minute, as the area under it.
				return {
					kind: "series",
					chart: {
						xLabel: "Second",
						yLabel: "Send rate",
						yUnit: "kb/s",
						x: Array.from({ length: 13 }, (_, i) => i * 5),
						series: [{ label: "Send rate", unit: "kb/s", shape: "area", points: [32, 34, 40, 48, 48, 46, 30, 24, 28, 40, 48, 48, 44] }],
					},
				};
			case "histogram": {
				// A histogram is bars over bins: here, 200 inter-arrival gaps around 20 ms, binned 2 ms wide.
				const bins = [12, 14, 16, 18, 20, 22, 24, 26, 28];
				return {
					kind: "series",
					chart: { xLabel: "Gap between packets", xUnit: "ms", yLabel: "Packets", x: bins, series: [{ label: "Packets", shape: "bar", points: [2, 6, 19, 42, 64, 38, 17, 9, 3] }] },
				};
			}
			case "combo":
				// Bars for the count, a line with markers for the rate, each on its own axis.
				return {
					kind: "series",
					chart: {
						xLabel: "Hour",
						yLabel: "Calls",
						yLabelRight: "Dropped",
						x: ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"],
						series: [
							{ label: "Calls", shape: "bar", points: [120, 340, 410, 380, 450, 300] },
							{ label: "Dropped", unit: "%", axis: "right", markers: true, points: [0.8, 1.1, 1.6, 1.3, 2.4, 1.2] },
						],
					},
				};
			case "pyramid":
				// Illustrative: upload against download per kind of client, back to back. Upload is given negative,
				// and shared stack id puts both halves on one row; mirror writes every number as a magnitude.
				return {
					kind: "series",
					chart: {
						orientation: "horizontal",
						mirror: true,
						xLabel: "Client",
						yLabel: "Bitrate",
						yUnit: "kb/s",
						x: ["Desktop browser", "Phone app", "Desk phone", "Smart speaker", "Car"],
						series: [
							{ label: "Upload", unit: "kb/s", shape: "bar", stack: "rate", points: [-48, -32, -64, -24, -32] },
							{ label: "Download", unit: "kb/s", shape: "bar", stack: "rate", points: [96, 64, 64, 48, 32] },
						],
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
