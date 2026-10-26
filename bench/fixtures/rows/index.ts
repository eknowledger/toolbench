/**
 * Checks each host name's shape (#204): labels of letters, digits and hyphens, at most 63 characters each.
 * One row per host in the result, in the order the reader put them, so a browser test can read the order
 * the rows arrived in.
 *
 * A bench fixture rather than a tool: it exists to put a one-column rows input on screen. A host with a
 * character no host name has is refused, naming its row, which is how an error under a row is drawn.
 */
import type { Output, Row, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { hosts: Row[] };

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

export default {
	run({ hosts }): Output {
		const names = hosts.map((row) => String(row.host));
		const bad = names.findIndex((host) => /\s/.test(host));
		if (bad >= 0) return { kind: "error", message: "a host name cannot contain a space.", input: "hosts", row: bad };
		return {
			kind: "table",
			columns: [{ label: "Host" }, { label: "Labels", align: "end" }, { label: "Shape" }],
			rows: names.map((host) => {
				const labels = host.split(".");
				return [host, labels.length, labels.every((label) => LABEL.test(label)) ? "valid" : "not a host name"];
			}),
		};
	},
} satisfies Tool<Input>;
