/**
 * The version of the CONTRACT, not of any package.
 *
 * Every tool declares `sdk: <n>` in its manifest, and the runtime supports every version it has
 * ever shipped. Raising this number is a deliberate act with a checklist — see docs/versioning.md.
 */
export const SDK_VERSION = 3;

/** Every contract version this SDK can read. Never shrinks. */
export const SUPPORTED_SDK_VERSIONS: readonly number[] = [1, 2, 3];

/**
 * What each contract version added. Kept as data so the runtime can explain itself: when a tool
 * asks for a version we do not have, the error can say what it would need rather than just failing.
 */
export const SDK_CHANGELOG: Record<number, string> = {
	1: "computation and visualisation: fields, text, code, table, series, group, error outputs; text, textarea, number, select, toggle inputs; pure capability; main and worker threads.",
	2: "byte-oriented output: the bytes kind, for wire formats and hex dumps, with named highlight ranges.",
	3: "sample inputs: the optional samples manifest key, a list of labelled example inputs a tool ships with and a host renders under its form.",
};
