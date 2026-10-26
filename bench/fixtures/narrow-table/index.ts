/**
 * A six-column table for a narrow tool (#213, contract version 8), for the gallery and the browser tests.
 *
 * Five columns of short tokens say `wrap: "none"` and the Note column says `wrap: "prose"`; one Note cell,
 * an incident id, overrides its column with `wrap: "none"`. Instance is the row header (#214). The values
 * are illustrative.
 */
import type { Cell, Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { sort: boolean };

const ROWS: { host: string; requests: number; p50: number; p99: number | null; status: Cell; note: Cell }[] = [
	{ host: "host-1", requests: 18301, p50: 38, p99: 612, status: { text: "Near SLO", tone: "warn" }, note: "Within budget, but rising since the last deploy." },
	{ host: "host-2", requests: 17880, p50: 37, p99: 288, status: { text: "OK", tone: "good" }, note: { text: "INC-2041", wrap: "none" } },
	{ host: "host-3", requests: 17402, p50: 39, p99: 270, status: { text: "OK", tone: "good" }, note: { text: "Routine.", tone: "muted" } },
	{ host: "host-4", requests: 24954, p50: 41, p99: 1450, status: { text: "Over SLO", tone: "bad" }, note: "Tail is 35x the median; one slow disk on this host." },
	{ host: "host-5", requests: 9115, p50: 36, p99: 241, status: { text: "OK", tone: "good" }, note: "Half the traffic: drained for maintenance at 14:00." },
	{ host: "host-6", requests: 212, p50: 35, p99: null, status: { text: "Too few", tone: "muted" }, note: "Fewer than 1,000 requests, so p99 is not estimated." },
];

export default {
	run({ sort }): Output {
		const rows = sort ? [...ROWS].sort((a, b) => (b.p99 ?? -1) - (a.p99 ?? -1)) : ROWS;
		return {
			kind: "table",
			caption: sort ? "Six instances, slowest p99 first" : "Six instances",
			columns: [
				{ label: "Instance", wrap: "none", rowHeader: true },
				{ label: "Requests", align: "end", mono: true, wrap: "none" },
				{ label: "p50 ms", align: "end", mono: true, wrap: "none" },
				{ label: "p99 ms", align: "end", mono: true, wrap: "none" },
				{ label: "Status", wrap: "none" },
				{ label: "Note", wrap: "prose" },
			],
			rows: rows.map((r) => [
				r.host,
				r.requests.toLocaleString("en-US"),
				String(r.p50),
				r.p99 === null ? { text: "n/a", tone: "muted" } : { text: r.p99.toLocaleString("en-US"), tone: r.p99 > 1000 ? "bad" : r.p99 > 500 ? "warn" : "normal" },
				r.status,
				r.note,
			]),
		};
	},
} satisfies Tool<Input>;
