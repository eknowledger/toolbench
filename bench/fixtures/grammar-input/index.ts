/**
 * Reads a door's state machine, written in a notation no host highlighter knows.
 *
 * A bench fixture rather than a tool: it exists so a textarea with a tool-defined grammar (#163) is on
 * screen for the browser tests, beside one whose language the host does know, so the order between the
 * two can be seen. The notation is the kind #163 is for: nobody arrives already knowing it.
 */
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { machine: string; labels: string };

export default {
	run({ machine, labels }): Output {
		const states = new Set<string>();
		let transitions = 0;
		const lines = machine.split("\n");
		for (let n = 0; n < lines.length; n++) {
			const line = (lines[n] as string).split("#")[0]?.trim() ?? "";
			if (line === "") continue;
			const [word, ...rest] = line.split(" ").filter(Boolean);
			if (word === "initial" || word === "state" || word === "final") {
				if (rest[0]) states.add(rest[0]);
			} else if (word === "on" && line.includes(":") && line.includes("->")) {
				transitions++;
			} else {
				return { kind: "error", message: `Line ${n + 1} is not a state or a transition.`, input: "machine" };
			}
		}
		let named = 0;
		try {
			named = Object.keys(JSON.parse(labels) as object).length;
		} catch {
			return { kind: "error", message: "The button labels are not valid JSON.", input: "labels" };
		}
		return {
			kind: "fields",
			fields: [
				{ label: "States", value: String(states.size) },
				{ label: "Transitions", value: String(transitions) },
				{ label: "Labelled buttons", value: String(named) },
			],
		};
	},
} satisfies Tool<Input>;
