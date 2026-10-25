/**
 * The version of the CONTRACT, not of any package.
 *
 * Every tool declares `sdk: <n>` in its manifest, and the runtime supports every version it has
 * ever shipped. Raising this number is a deliberate act with a checklist — see docs/versioning.md.
 */
export const SDK_VERSION = 8;

/** Every contract version this SDK can read. Never shrinks. */
export const SUPPORTED_SDK_VERSIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * What each contract version added. Kept as data so the runtime can explain itself: when a tool
 * asks for a version we do not have, the error can say what it would need rather than just failing.
 */
export const SDK_CHANGELOG: Record<number, string> = {
	1: "computation and visualisation: fields, text, code, table, series, group, error outputs; text, textarea, number, select, toggle inputs; pure capability; main and worker threads.",
	2: "byte-oriented output: the bytes kind, for wire formats and hex dumps, with named highlight ranges.",
	3: "sample inputs: the optional samples manifest key, a list of labelled example inputs a tool ships with and a host renders under its form.",
	4: "richer charts and inputs: chart markers (markers: true, shape: \"points\"), and control: \"slider\" on a number input. Later additions in the same release are listed in docs/versioning.md.",
	5: "names for host stylesheets and links: an optional role on any output part and on any field, rendered as data-role; an optional id on any part, rendered as data-part and opened by host.reveal(id); and the muted tone on fields and table cells.",
	6: "presets and highlighted inputs: an optional sets on a select option, the values choosing it writes into other inputs, with the select following the form afterwards; and an optional lang on a textarea, painted through the host's highlight hook.",
	7: "graphs: the graph output kind, nodes and edges the runtime lays out and draws, with groups, swimlanes, records and crow's-foot ends, every edge also listed in a table; and an optional grammar on a textarea with lang, the tool's own keywords, comment prefix, operators and string delimiters, with no patterns.",
	8: "mono on a field, false for the text face; share on an input, false to keep it out of links; role on an input, as data-role on its row; wrap on a table column or cell, prose or none; rowHeader on a column, its cells as row headers.",
};
