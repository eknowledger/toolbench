/**
 * The contract. A tool is a function; everything else here describes what goes in and what comes
 * out, so a runtime can build an interface for a tool it has never seen.
 *
 * Two rules govern every change to this file:
 *
 *  1. **Additive only.** New output kinds and input types get added. Existing ones never change
 *     meaning, never lose a field, and never gain a required one.
 *  2. **No DOM, no framework, no host.** A tool must be runnable in plain Node, because that is how
 *     its fixtures are checked. Anything that needs a browser belongs in the runtime, not here.
 */

// ---------------------------------------------------------------------------
// Output — what a tool returns
// ---------------------------------------------------------------------------

/** A label and a value. The plainest thing a tool can say. */
export interface Field {
	label: string;
	value: string;
	/** A qualifier shown beside the value: a unit, a caveat, "(dynamic)". */
	note?: string;
	/** Fields sharing a group are rendered together under its name. */
	group?: string;
	/** Draws attention without inventing a severity scale. */
	tone?: Tone;
}

export type Tone = "normal" | "warn" | "bad" | "good";

export interface Column {
	label: string;
	align?: "start" | "end";
	/** Monospace, for anything the reader will compare digit by digit. */
	mono?: boolean;
}

export type Cell = string | number | { text: string; mono?: boolean; tone?: Tone };

/** One line, bar or area on a chart. */
export interface Series {
	label: string;
	/** One value per x. A `null` is a gap, not a zero — the distinction matters on a chart. */
	points: (number | null)[];
	unit?: string;
	shape?: "line" | "area" | "bar";
	axis?: "left" | "right";
}

export interface Chart {
	xLabel: string;
	yLabel: string;
	x: number[];
	series: Series[];
	xUnit?: string;
	yUnit?: string;
	/** A vertical marker with a name: "the knee", "capacity", "p99". */
	annotations?: { x: number; label: string }[];
	/** Second axis label, required if any series sets `axis: "right"`. */
	yLabelRight?: string;
}

/**
 * A run of bytes worth calling out inside a `bytes` output: a header field, a length prefix, the
 * region an error points at.
 *
 * `label` is what makes this more than colour. A highlight a reader cannot name tells them something
 * is interesting without saying what, and the label is also the only thing a screen reader gets.
 */
export interface ByteRange {
	/** Offset from the start of `bytes`, not from `offset`. */
	at: number;
	len: number;
	label: string;
	tone?: Tone;
}

/**
 * What a tool returns. A closed union: a runtime can render every member, and a tool cannot invent
 * a shape nobody can draw.
 *
 * ⚠️ `group` is what lets one tool answer in more than one shape — a decode that produces both a
 * field list and a table is the common case, not the exception.
 */
export type Output =
	| { kind: "fields"; fields: Field[] }
	| { kind: "text"; text: string; mono?: boolean }
	| { kind: "code"; lang: string; source: string }
	| { kind: "table"; columns: Column[]; rows: Cell[][]; caption?: string }
	| { kind: "series"; chart: Chart }
	| { kind: "group"; parts: Output[] }
	/**
	 * Raw bytes, as a reader of a wire format wants to see them: offsets down the side, hex in the
	 * middle, printable characters in a gutter, and named ranges over the top.
	 *
	 * ⚠️ Added in contract version 2. A `table` can approximate this and gets it wrong in a way that
	 * matters: alignment has to be fought rather than given, and there is nowhere to put a highlight
	 * that spans columns or wraps a row.
	 *
	 * `offset` is what the first byte should be *labelled*, for a tool showing a window into
	 * something larger. It does not shift `ByteRange.at`, which is always relative to `bytes`.
	 */
	| { kind: "bytes"; bytes: number[]; offset?: number; highlight?: ByteRange[]; caption?: string }
	/**
	 * The INPUT was wrong, and the tool worked correctly by saying so. `input` names the control at
	 * fault so a generated form can mark it invalid and point a screen reader at the message —
	 * without it, an error can only ever float unattached.
	 *
	 * A tool that is itself broken should THROW instead. The two render differently on purpose.
	 */
	| { kind: "error"; message: string; input?: string; at?: number; len?: number };

export type OutputKind = Output["kind"];

/** Every kind this contract version can express. The runtime checks its renderers against this. */
export const OUTPUT_KINDS: readonly OutputKind[] = [
	"fields",
	"text",
	"code",
	"table",
	"series",
	"group",
	"error",
	"bytes",
];

// ---------------------------------------------------------------------------
// Input — what a tool asks for
// ---------------------------------------------------------------------------

interface InputBase {
	id: string;
	label: string;
	/** The hint a form shows and a screen reader reads. Not a placeholder — those vanish on focus. */
	description?: string;
	/** Shown after the control: "ms", "req/s", "bytes". A number without one is a riddle. */
	unit?: string;
	/** The one input a compact card shows. At most one per tool. */
	primary?: boolean;
	/**
	 * Force text direction. Bytes, code and identifiers are left-to-right even inside right-to-left
	 * prose, and a runtime cannot know which is which — the tool says.
	 */
	dir?: "ltr" | "auto";
}

export type InputSpec =
	| (InputBase & { type: "text"; default: string; maxLength?: number })
	| (InputBase & { type: "textarea"; default: string; rows?: number; maxLength?: number })
	| (InputBase & { type: "number"; default: number; min: number; max: number; step?: number })
	| (InputBase & { type: "select"; default: string; options: { value: string; label: string }[] })
	| (InputBase & { type: "toggle"; default: boolean });

export type InputType = InputSpec["type"];

export const INPUT_TYPES: readonly InputType[] = ["text", "textarea", "number", "select", "toggle"];

/** The shape a tool's `run` receives: one entry per declared input, keyed by id. */
export type InputValues = Record<string, string | number | boolean>;

// ---------------------------------------------------------------------------
// Capabilities — what a tool is allowed to do
// ---------------------------------------------------------------------------

/**
 * `pure` is the only capability in contract version 1: a function of its inputs, no I/O, no clock,
 * no randomness that is not seeded. That is not a limitation to apologise for — it is what makes a
 * tool testable by fixture, runnable at build time, and safe to put on a landing page.
 *
 * Reading files and calling networks arrive in later versions, each with its own capability, so a
 * runtime can always tell from the manifest what a tool will try to do before it runs.
 */
export type Capability = "pure";

export const CAPABILITIES: readonly Capability[] = ["pure"];

// ---------------------------------------------------------------------------
// The tool itself
// ---------------------------------------------------------------------------

/**
 * An example input a tool ships with, rendered as a button under its form.
 *
 * These live in the manifest rather than in a host slot because example inputs are *tool* knowledge.
 * The author knows which input demonstrates a one-byte extension and which one is malformed; a host
 * does not, and a slot would make every host invent its own examples for every tool.
 *
 * ⚠️ The malformed example is the one that earns this field. It is the most useful thing a decoder can
 * offer and the one a reader will never type by hand, and it is how a tool shows that its failure
 * paths were designed rather than discovered.
 */
export interface Sample {
	/** What the button says. Short: it sits in a row with the others. */
	label: string;
	/**
	 * Values keyed by input id. Partial on purpose: a sample may set one field and leave the rest as
	 * the reader left them.
	 */
	input: InputValues;
}

export interface Manifest {
	/** The contract version this tool was written against. */
	sdk: number;
	/** Stable, lowercase, hyphenated. Also the directory name and the URL segment. */
	id: string;
	name: string;
	/** One sentence. Shown on cards and used as a page description. */
	blurb: string;
	/** The tool's own version, independent of `sdk`. */
	version: string;
	capabilities: Capability[];
	inputs: InputSpec[];
	/** Every kind `run` can return, so a host can refuse a tool it cannot draw. */
	kinds: OutputKind[];
	runtime: {
		/** Entry file, relative to the tool's directory. */
		entry: string;
		/**
		 * `main` is the default and costs nothing. `worker` is for a tool whose running time depends
		 * on its input — it is the only mode where a timeout can actually stop anything.
		 */
		thread?: "main" | "worker";
	};
	status?: "live" | "deprecated" | "retired";
	/** How the tool appears in a compact slot: runnable, a summary that links out, or not at all. */
	card?: "live" | "info" | "none";
	/** How many fields a card shows before it stops. Errors are never truncated. */
	cardFields?: number;
	/**
	 * Re-run as the reader types, instead of waiting for the Run button.
	 *
	 * Off by default, and that default is deliberate. A tool that runs on every keystroke does work
	 * nobody asked for, makes the Run button look broken (the answer is already there), and takes the
	 * decision away from the reader. Opt in only for a tool that is genuinely instant and reads better
	 * live — a unit converter, say. Anything with a worker or a heavy loop should leave it alone.
	 */
	autoRun?: boolean;
	/** Worker mode only. A tool that declares this on the main thread is rejected: nothing there can be stopped. */
	timeoutMs?: number;
	/** Markdown file, relative to the tool's directory, rendered as the tool's help. */
	help?: string;
	tags?: string[];
	/**
	 * Anything the tool wants to point at: a spec it implements, a post explaining it, a reference
	 * decoder. Deliberately generic — a host site's own content relations are the host's business.
	 */
	links?: { label: string; href: string }[];
	/**
	 * Example inputs, rendered as a row of buttons under the form. Added in contract version 3.
	 *
	 * Clicking one fills the form. It does not run the tool, for the same reason typing does not: Run
	 * is the only trigger. A compact card does not show them at all, because it has room for one input
	 * and a Run button, and a row of buttons there would crowd out the result the card exists to show.
	 */
	samples?: Sample[];
}

/** Passed to `run`. Built by whatever is executing the tool, never sent across a boundary. */
export interface Ctx {
	/**
	 * Aborted when the reader cancels, when the input changes mid-run, or when a worker-mode timeout
	 * fires. A loop whose length depends on input MUST check it — on the main thread it is the only
	 * way to stop.
	 */
	signal: AbortSignal;
	/**
	 * Progress, and optionally a partial result. A runtime renders `partial` at most once per frame,
	 * which is what lets a simulation show itself converging instead of hiding behind a bar.
	 */
	progress(fraction: number, partial?: Output): void;
}

/**
 * What a tool is.
 *
 * ⚠️ **Declare your input type as a `type`, not an `interface`.** TypeScript gives an implicit index
 * signature to a type alias of an object literal and not to an interface, so an interface will not
 * satisfy `InputValues` and the error message ("index signature is missing") does not hint at the
 * fix. This is the first thing a new tool author trips over.
 *
 * ```ts
 * type Input = { values: string; method: string };   // ✓
 * interface Input { values: string }                 // ✗ won't satisfy InputValues
 *
 * export default { run(input: Input, ctx) { … } } satisfies Tool<Input>;
 * ```
 */
export interface Tool<I extends InputValues = InputValues> {
	run(input: I, ctx: Ctx): Output | Promise<Output>;
}

/** What a tool module default-exports. */
export type ToolModule<I extends InputValues = InputValues> = { default: Tool<I> };

/** A manifest plus the module that implements it, which is what a runtime actually consumes. */
export interface LoadedTool<I extends InputValues = InputValues> {
	manifest: Manifest;
	tool: Tool<I>;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export interface Case {
	name: string;
	input: InputValues;
	expect: Output;
	/**
	 * Exact deep equality by default, because that is what catches a duplicated field, a reordered
	 * one, or garbage emitted beside a correct error.
	 *
	 * `subset` is an opt-in escape for a tool whose output is genuinely open-ended, and it demands
	 * two things in return: a `why`, and a `fieldCount`, so a dropped field is still a failure.
	 */
	match?: "exact" | "subset";
	why?: string;
	fieldCount?: number;
}
