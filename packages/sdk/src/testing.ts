/**
 * The fixture runner: a tool's `cases.json` is its test suite, and this runs it.
 *
 * It lives in the SDK rather than in the runtime for one reason — **a tool's correctness has nothing
 * to do with a browser.** Cases run in plain Node, which means a tool author gets a red test in
 * milliseconds, CI needs no browser, and the same fixtures can be re-run by a host site's build to
 * prove that the tool it pinned still does what it claimed.
 *
 * Matching is exact by default. That is deliberate: subset matching quietly passes a field emitted
 * twice, fields reordered, a field dropped, or garbage returned beside a correct error message. A
 * case may opt out with `match: "subset"`, and then it owes two things — a `why`, and a `fieldCount`
 * so a disappearing field is still a failure.
 */
import type { Case, Ctx, Field, Output, Tool } from "./types.ts";

export interface CaseResult {
	name: string;
	ok: boolean;
	/** Present when `ok` is false: a human-readable account of the difference. */
	detail?: string;
	/** Wall-clock duration, so a "main thread" tool can be held to a bound. */
	ms: number;
}

export interface RunCasesOptions {
	/** Fails any case that takes longer than this. Use it to hold main-thread tools to a bound. */
	maxMs?: number;
	/** Aborts a case that hangs, so a bad loop fails the suite instead of wedging it. */
	timeoutMs?: number;
}

/** A `Ctx` for a headless run: nothing to draw progress on, and an abort that a timeout can pull. */
export function testCtx(signal?: AbortSignal): Ctx {
	return {
		signal: signal ?? new AbortController().signal,
		progress: () => {},
	};
}

export async function runCases(
	tool: Tool,
	cases: readonly Case[],
	options: RunCasesOptions = {},
): Promise<CaseResult[]> {
	const results: CaseResult[] = [];
	for (const testCase of cases) {
		const controller = new AbortController();
		const timeout = options.timeoutMs
			? setTimeout(() => controller.abort(new Error(`case exceeded ${options.timeoutMs}ms`)), options.timeoutMs)
			: undefined;
		const started = performance.now();
		try {
			const actual = await tool.run(testCase.input, testCtx(controller.signal));
			const ms = performance.now() - started;
			const detail = compare(actual, testCase);
			const tooSlow = options.maxMs !== undefined && ms > options.maxMs;
			results.push({
				name: testCase.name,
				ok: detail === undefined && !tooSlow,
				ms,
				...(detail !== undefined
					? { detail }
					: tooSlow
						? { detail: `took ${ms.toFixed(1)}ms, over the ${options.maxMs}ms bound for this tool` }
						: {}),
			});
		} catch (error) {
			results.push({
				name: testCase.name,
				ok: false,
				ms: performance.now() - started,
				detail: `threw ${(error as Error)?.name ?? "Error"}: ${(error as Error)?.message ?? String(error)}\n` +
					"A tool should THROW only when the tool itself is broken. If this input is simply invalid, " +
					'return { kind: "error", message, input } instead.',
			});
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	}
	return results;
}

/** Throws with every failure listed. The shape most test runners want. */
export async function assertCases(
	tool: Tool,
	cases: readonly Case[],
	options: RunCasesOptions = {},
): Promise<void> {
	const results = await runCases(tool, cases, options);
	const failed = results.filter((r) => !r.ok);
	if (failed.length > 0) {
		throw new Error(
			`${failed.length} of ${results.length} cases failed:\n\n` +
				failed.map((f) => `  ✗ ${f.name}\n    ${f.detail?.split("\n").join("\n    ")}`).join("\n\n"),
		);
	}
}

// ---------------------------------------------------------------------------
// comparison
// ---------------------------------------------------------------------------

/** Returns undefined when the output matches, or a description of the first difference. */
export function compare(actual: Output, testCase: Case): string | undefined {
	/*
	 * Checked on every case, whatever the matching mode, because it is a property of the tool rather than
	 * of one answer: a page linking to a part by id would open whichever came first, with nothing saying so.
	 */
	const twice = repeatedPartId(actual, new Set());
	if (twice !== undefined) return `output: part id "${twice}" is used twice. host.reveal(id) needs each id once per result.`;
	const mode = testCase.match ?? "exact";
	if (mode === "subset") {
		if (!testCase.why) {
			return 'match: "subset" requires a `why` — an opt-out of exact matching needs a stated reason.';
		}
		if (testCase.expect.kind === "fields" && testCase.fieldCount === undefined) {
			return 'match: "subset" on a fields output requires `fieldCount`, or a dropped field would pass.';
		}
		return subset(actual, testCase);
	}
	return exact(actual, testCase.expect, "output");
}

function exact(actual: unknown, expected: unknown, path: string): string | undefined {
	if (expected === actual) return undefined;

	if (typeof expected !== typeof actual) {
		return `${path}: expected ${typeof expected} ${show(expected)}, got ${typeof actual} ${show(actual)}`;
	}
	if (Array.isArray(expected) || Array.isArray(actual)) {
		if (!Array.isArray(expected) || !Array.isArray(actual)) {
			return `${path}: expected ${show(expected)}, got ${show(actual)}`;
		}
		if (expected.length !== actual.length) {
			return `${path}: expected ${expected.length} item(s), got ${actual.length}\n  expected: ${show(expected)}\n  actual:   ${show(actual)}`;
		}
		for (let i = 0; i < expected.length; i++) {
			const diff = exact(actual[i], expected[i], `${path}[${i}]`);
			if (diff) return diff;
		}
		return undefined;
	}
	if (expected !== null && actual !== null && typeof expected === "object") {
		const e = expected as Record<string, unknown>;
		const a = actual as Record<string, unknown>;
		const keys = [...new Set([...Object.keys(e), ...Object.keys(a)])].sort();
		for (const key of keys) {
			if (!(key in e)) return `${path}.${key}: unexpected field ${show(a[key])}`;
			if (!(key in a)) return `${path}.${key}: missing, expected ${show(e[key])}`;
			const diff = exact(a[key], e[key], `${path}.${key}`);
			if (diff) return diff;
		}
		return undefined;
	}
	return `${path}: expected ${show(expected)}, got ${show(actual)}`;
}

function subset(actual: Output, testCase: Case): string | undefined {
	const expected = testCase.expect;

	/*
	 * ⚠️ A subset case looks INSIDE a group.
	 *
	 * Composite output is the normal case, not the exception — a decode that returns both a field list
	 * and a table is a `group` — so a case asserting "somewhere in there, these fields have these
	 * values" has to be able to reach the part it means. Without this, subset matching is unusable for
	 * exactly the tools most likely to need it.
	 *
	 * The rule is "some part matches", chosen because it is predictable: with two `fields` parts, a
	 * case that matches either one passes, and a case that matches neither reports what it tried.
	 */
	if (actual.kind === "group" && expected.kind !== "group") {
		const candidates = flatten(actual).filter((part) => part.kind === expected.kind);
		if (candidates.length === 0) {
			return `output: no "${expected.kind}" part inside the group (it has ${flatten(actual).map((p) => p.kind).join(", ")})`;
		}
		const diffs = candidates.map((candidate) => subset(candidate, testCase)).filter((d): d is string => d !== undefined);
		if (diffs.length < candidates.length) return undefined; // at least one part matched
		return candidates.length === 1
			? diffs[0]
			: `output: none of the ${candidates.length} "${expected.kind}" parts matched. Closest: ${diffs[0]}`;
	}

	if (actual.kind !== expected.kind) {
		return `output.kind: expected "${expected.kind}", got "${actual.kind}"`;
	}
	if (expected.kind === "fields" && actual.kind === "fields") {
		if (actual.fields.length !== testCase.fieldCount) {
			return `output.fields: expected exactly ${testCase.fieldCount} field(s) (from fieldCount), got ${actual.fields.length}`;
		}
		/*
		 * ⚠️ Fields are identified by GROUP + LABEL, not by label alone.
		 *
		 * A tool that reports the same quantity two ways — "time in system" under "Formula" and again
		 * under "Simulation" — is the normal case, and that is exactly what `group` is for. Keying on
		 * the label alone made those two collide and reported a duplicate that was not one.
		 */
		const key = (f: { label: string; group?: string }) => `${f.group ?? ""}\u0000${f.label}`;
		const byKey = new Map<string, Field[]>();
		for (const f of actual.fields) byKey.set(key(f), [...(byKey.get(key(f)) ?? []), f]);
		for (const want of expected.fields) {
			const where = want.group ? `"${want.label}" in group "${want.group}"` : `"${want.label}"`;
			const got = byKey.get(key(want));
			if (!got) {
				const labels = actual.fields.map((f) => (f.group ? `${f.group}/${f.label}` : f.label)).join(", ");
				return `output.fields: no field ${where}. Present: ${labels}`;
			}
			if (got.length > 1) return `output.fields: ${where} appears ${got.length} times`;
			const diff = exact(got[0], { ...got[0], ...want }, `output.fields[${where}]`);
			if (diff) return diff;
		}
		return undefined;
	}
	/*
	 * A chart in subset mode asserts its FRAME, not its data: axis labels, units and annotations.
	 *
	 * Pinning hundreds of computed points in a fixture is both unreadable and the wrong test — the
	 * numbers belong in a unit test that says why they are right. What a fixture usefully checks is
	 * that the chart the tool describes is the chart the renderer will get.
	 */
	if (expected.kind === "series" && actual.kind === "series") {
		const { x: _ax, series: _as, ...actualFrame } = actual.chart;
		const { x: _ex, series: _es, ...expectedFrame } = expected.chart;
		const diff = exact(actualFrame, { ...actualFrame, ...expectedFrame }, "output.chart");
		if (diff) return diff;
		if (actual.chart.series.length === 0) return "output.chart.series: the chart has no series at all";
		if (actual.chart.x.length === 0) return "output.chart.x: the chart has no x values";
		return undefined;
	}
	if (expected.kind === "error" && actual.kind === "error") {
		if (!actual.message.includes(expected.message)) {
			return `output.message: expected to contain "${expected.message}", got "${actual.message}"`;
		}
		if (expected.input !== undefined && actual.input !== expected.input) {
			return `output.input: expected "${expected.input}", got ${show(actual.input)}`;
		}
		return undefined;
	}
	// For every other kind, subset has no defined meaning — fall back to exact rather than pretend.
	return exact(actual, expected, "output");
}

/** Every part of a possibly-nested group, in order, excluding the groups themselves. */
/** The first part `id` that appears twice in one result, at any depth. Contract version 5. */
function repeatedPartId(output: Output, seen: Set<string>): string | undefined {
	if (output.id !== undefined) {
		if (seen.has(output.id)) return output.id;
		seen.add(output.id);
	}
	if (output.kind !== "group") return undefined;
	for (const part of output.parts) {
		const found = repeatedPartId(part, seen);
		if (found !== undefined) return found;
	}
	return undefined;
}

function flatten(output: Output): Output[] {
	return output.kind === "group" ? output.parts.flatMap(flatten) : [output];
}

function show(value: unknown): string {
	const json = JSON.stringify(value);
	if (json === undefined) return String(value);
	return json.length > 160 ? `${json.slice(0, 157)}…` : json;
}
