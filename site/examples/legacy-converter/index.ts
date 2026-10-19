/**
 * A deprecated tool, for the gallery. It still runs, which is the difference from retired.
 *
 * The site's own example rather than the bench's fixture of the same shape, because a tool's links are
 * part of what it shows, and the fixture's point at bench pages that the site does not have.
 */
import type { Output, Tool } from "@toolbench/sdk";

type Input = { value: number };

export default {
	run({ value }): Output {
		if (typeof value !== "number" || !Number.isFinite(value)) {
			return { kind: "error", message: "Value is not a number.", input: "value" };
		}
		return { kind: "fields", fields: [{ label: "state", value: "still runs" }, { label: "value", value: String(value) }] };
	},
} satisfies Tool<Input>;
