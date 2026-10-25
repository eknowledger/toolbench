/**
 * An input marked `share: false` beside one that is not (#227), so a browser test can see the share button
 * leave the private one out of the link it copies and refuse to read it back from one.
 *
 * ⚠️ Declares contract 7 while using `share`, which contract 8 introduces (#211). Version 7 ignores an
 * unknown input key, so this loads today; once the version 8 change lands, its feature check refuses a 7
 * manifest using `share`, and this must declare 8.
 */
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { count: number; token: string };

export default {
	run({ count, token }): Output {
		return { kind: "fields", fields: [{ label: "count", value: String(count) }, { label: "token length", value: String(token.length) }] };
	},
} satisfies Tool<Input>;
