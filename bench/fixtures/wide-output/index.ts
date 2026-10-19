/**
 * Every result kind the runtime draws itself, each wider than a phone, for the browser test that holds a
 * tool to "scroll, never clip" at narrow widths.
 *
 * A bench fixture rather than a tool, because a result built to be too wide is not an example of a good
 * one. The chart kinds come from `discrete-series` and the graph families from `graph-families`; this
 * covers the rest, plus a graph and a group of its own, so the test does not depend on how wide those
 * fixtures' data happens to be. The long tokens are what real results carry: a digest or a URL, neither
 * of which a browser can break at a space.
 */
import type { Graph, Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { case: string };

const token = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a089f86d081884c7d659a2feaa0c55ad015";
const url = "https://example.com/a/very/long/path/that/keeps/going/until/it/is/far/wider/than/any/phone";

const table: Output = {
	kind: "table",
	caption: "Twelve columns, every one of them needed.",
	columns: ["Stream", "Codec", "Bitrate", "Frames", "Dropped", "Late", "Jitter", "RTT", "Loss", "NACKs", "PLIs", "Resolution"].map((label, i) => ({
		label,
		...(i > 1 && i < 11 ? { align: "end" as const, mono: true } : {}),
	})),
	rows: [
		["camera-front", "VP9 profile 2", "2,480 kb/s", 18_004, 12, 31, "4.2 ms", "38 ms", "0.31%", 44, 2, "1920x1080"],
		["screen-share", "AV1 main", "1,120 kb/s", 9_310, 0, 4, "1.1 ms", "41 ms", "0.02%", 3, 0, "2560x1440"],
	],
};

const code: Output = { kind: "code", lang: "json", source: `{"id":"${token}","origin":"${url}","ok":true}\n{"n":3}` };

// A chain laid out left to right is as wide as its node count: eight stages is past 900px at any spacing.
const stages = ["ingest", "decode", "validate", "enrich", "aggregate", "encode", "publish", "archive"];
const chain: Graph = {
	label: "A pipeline of eight stages",
	direction: "LR",
	nodes: stages.map((id) => ({ id, label: `${id} stage` })),
	edges: stages.slice(1).map((to, i) => ({ from: stages[i] as string, to })),
};

const cases: Record<string, Output> = {
	table,
	code,
	text: { kind: "text", text: `The digest did not match. Expected ${token}, which no browser can break at a space.` },
	"text-mono": { kind: "text", mono: true, text: `expected ${token}\nreceived ${token.replace("9f86", "0000")}` },
	fields: {
		kind: "fields",
		fields: [
			{ label: "Digest", value: token },
			{ label: "Source", value: url },
		],
	},
	bytes: {
		kind: "bytes",
		caption: "Sixteen bytes to a row, the width of a hex dump.",
		bytes: Array.from({ length: 48 }, (_, i) => (i * 37 + 11) % 256),
		highlight: [
			{ at: 0, len: 4, label: "Magic" },
			{ at: 4, len: 4, label: "Length", tone: "warn" },
		],
	},
	graph: { kind: "graph", graph: chain },
	group: { kind: "group", parts: [{ kind: "fields", fields: [{ label: "Streams", value: "2" }] }, table, code, { kind: "graph", graph: chain }] },
	error: { kind: "error", message: `No object named ${token} in this bucket.`, input: "case" },
};

export default {
	run({ case: id }): Output {
		return cases[id] ?? { kind: "error", message: `No wide case "${id}".`, input: "case" };
	},
} satisfies Tool<Input>;
