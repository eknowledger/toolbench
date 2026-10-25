/**
 * Which inputs a host may put in a link (#211).
 *
 * A module of its own, with nothing imported, so a bundler leaves it out of a page that never calls it: the
 * runtime builds no links, so its boot chunk must not pay for a host's link rule.
 */

/**
 * The ids of the inputs a host may put in a link it builds from `host.values`, and read back from one, in the
 * manifest's order: every input that does not say `share: false`. Takes the manifest as a registry holds it,
 * validated or not, and one with no inputs yet shares nothing. A privacy hint, not access control: following
 * it is the host's code. The runtime's share button and its reading of a link use this one, so the two
 * directions cannot disagree about which value is private.
 */
export function shareableInputs(manifest: { readonly inputs?: readonly { readonly id: string; readonly share?: unknown }[] }): string[] {
	return (manifest.inputs ?? []).filter((input) => input.share !== false).map((input) => input.id);
}
