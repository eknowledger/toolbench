/**
 * A result that names its parts (contract version 5), for the styling page and its browser tests.
 *
 * A bench fixture rather than a tool, because it exists to give each of STYLING.md's example sheets
 * something to hold on to: a verdict that is one field, stat tiles both ungrouped and grouped, and a
 * table too wide for a phone with every cell tone, including the unnamed first column whose cells must
 * carry no `data-label`.
 */
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { fixed: boolean };

export default {
	run({ fixed }): Output {
		const risky = fixed ? 0 : 2;
		return {
			kind: "group",
			parts: [
				{
					kind: "fields",
					fields: [
						{
							label: "Verdict",
							value: fixed ? "Every field has a limit" : `${risky} fields accept any text`,
							tone: fixed ? "good" : "bad",
							role: "verdict",
						},
						{ label: "Checked", value: "8 fields" },
					],
				},
				{
					kind: "fields",
					role: "stats",
					fields: [
						{ label: "Fields that are data", value: "6 of 8" },
						{ label: "Accept any text", value: String(risky), note: fixed ? "none at risk" : "1 high risk" },
						{ label: "Tools checked", value: "4" },
					],
				},
				{
					kind: "table",
					caption: "Every field, by how much it accepts.",
					columns: [
						{ label: "" },
						{ label: "Type" },
						{ label: "Accepts" },
						{ label: "Risk" },
						{ label: "Bytes", align: "end", mono: true },
						{ label: "Checked by", align: "end" },
					],
					rows: [
						["username", "string", "any text", { text: fixed ? "low" : "high", tone: fixed ? "good" : "bad" }, 64, "3 tools"],
						["email", "string", "address", { text: "low", tone: "good" }, 254, "4 tools"],
						["age", "integer", "0 to 150", { text: "routine", tone: "muted" }, 1, "2 tools"],
					],
				},
				{
					kind: "fields",
					role: "stats",
					fields: [
						{ label: "Rejected", value: "0", group: "This run" },
						{ label: "Warnings", value: String(risky), group: "This run" },
					],
				},
			],
		};
	},
} satisfies Tool<Input>;
