/**
 * A JavaScript regular-expression explainer.
 *
 * The tool exists so the runtime's `text` renderer has a real tool behind it, and so `code` has one
 * outside the bench's own fixtures. It is a real explainer rather than a stub because a renderer
 * nobody has looked at is a renderer nobody has tested.
 *
 * ⚠️ Worker mode, with a timeout, and no `autoRun`. All three are the same decision.
 *
 * This tool compiles a pattern the reader typed and runs it against a subject the reader typed, which
 * makes it the one tool here that cannot bound its own running time. The refusal in `applyQuantifier`
 * catches the textbook `(a+)+` shape, and it is worth keeping because the message teaches something.
 * But it is a denylist, and the shapes it does not name are not rare: `(a|aa)+$` nests no repeat at
 * all, passes the check, and against 45 characters of `a` followed by a `b` it takes **28 seconds**.
 * Measured, not estimated. At 41 characters it is 4.2 s and at 37 it is 0.6 s, so a reader typing one
 * character at a time walks up that curve.
 *
 * Those figures are V8's. Measured across the browser suite: Chromium and Firefox both grind and reach
 * the timeout, while WebKit returns almost at once, because JavaScriptCore abandons a runaway backtrack
 * rather than running it out. Two engines in three will hang, so the rescue is not something to build
 * on, and an engine that happens to save you is not a bound.
 *
 * On the main thread there is nothing to terminate: `ctx.signal` only works for a tool that checks it,
 * and no tool can check anything while the regex engine is inside a match. See the table in
 * `runner.ts`, which is why the manifest rejects `timeoutMs` outside worker mode. So the engine gets a
 * thread of its own and 2 s to finish, and a pathological pattern becomes a timeout the reader can
 * read rather than a tab they have to close. Dropping `autoRun` is the other half: a tool that can
 * take 2 s must not start on a keystroke.
 *
 * ⚠️ `timeoutMs` is a top-level manifest key, NOT part of `runtime`, even though `thread` is and the
 * two only make sense together. Writing it inside `runtime` cost a CI round: nothing rejected it,
 * because validation looks for it at the top level and found nothing there, so the tool ran on the
 * 5,000 ms default and the browser test failed on a message naming the wrong number. A key in the
 * wrong object is silently ignored, which is the one way a manifest can lie.
 */
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { pattern: string; subject: string; flags: string };

export type WalkToken = { source: string; meaning: string; unbounded: boolean };

const SPECIAL_ESCAPE: Record<string, string> = {
	d: "a digit",
	D: "not a digit",
	w: "a word character",
	W: "not a word character",
	s: "a whitespace character",
	S: "not a whitespace character",
	n: "a newline",
	t: "a tab",
	r: "a carriage return",
	f: "a form feed",
	v: "a vertical tab",
	b: "a word boundary",
	B: "not a word boundary",
};

const FLAG_VALUES = new Set(["none", "i", "m", "g", "gi", "s"]);

type GroupKind = "capture" | "noncapture" | "lookahead" | "negLookahead" | "lookbehind" | "negLookbehind" | "named";

type GroupFrame = { kind: GroupKind; n?: number; name?: string; start: number };

class WalkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WalkError";
	}
}

/** True when a quantifier can match arbitrarily many times. `{2,5}` is not; `+`, `*` and `{2,}` are. */
function isUnbounded(kind: "optional" | "star" | "plus" | "exact" | "min" | "range"): boolean {
	return kind === "star" || kind === "plus" || kind === "min";
}

function quantifierPhrase(
	kind: "optional" | "star" | "plus" | "exact" | "min" | "range",
	n?: number,
	m?: number,
	lazy?: boolean,
): string {
	let phrase = "";
	if (kind === "optional") phrase = ", optional";
	else if (kind === "star") phrase = ", any number";
	else if (kind === "plus") phrase = ", one or more";
	else if (kind === "exact") phrase = `, exactly ${n}`;
	else if (kind === "min") phrase = `, ${n} or more`;
	else phrase = `, ${n} to ${m}`;
	if (lazy) phrase += ", as few as possible";
	return phrase;
}

function readQuantifier(pattern: string, from: number): { raw: string; kind: "optional" | "star" | "plus" | "exact" | "min" | "range"; n?: number; m?: number; lazy: boolean; next: number } | undefined {
	const ch = pattern[from];
	if (ch === "?" || ch === "*" || ch === "+") {
		const kind = ch === "?" ? "optional" : ch === "*" ? "star" : "plus";
		const lazy = pattern[from + 1] === "?";
		return { raw: pattern.slice(from, from + (lazy ? 2 : 1)), kind, lazy, next: from + (lazy ? 2 : 1) };
	}
	if (ch !== "{") return undefined;
	const match = /^\{(\d+)(?:,(\d*))?\}(\?)?/.exec(pattern.slice(from));
	if (!match) return undefined;
	const n = Number(match[1]);
	const lazy = match[3] === "?";
	if (match[0].includes(",") && match[2] === "") {
		return { raw: match[0], kind: "min", n, lazy, next: from + match[0].length };
	}
	if (match[0].includes(",")) {
		const m = Number(match[2]);
		if (n > m) return undefined;
		return { raw: match[0], kind: "range", n, m, lazy, next: from + match[0].length };
	}
	return { raw: match[0], kind: "exact", n, lazy, next: from + match[0].length };
}

function hexChar(pattern: string, from: number, width: number): { char: string; raw: string; next: number } | undefined {
	const digits = pattern.slice(from, from + width);
	if (digits.length < width || !/^[0-9A-Fa-f]+$/.test(digits)) return undefined;
	return { char: String.fromCharCode(Number.parseInt(digits, 16)), raw: digits, next: from + width };
}

function closeMeaning(frame: GroupFrame): string {
	if (frame.kind === "capture") return `end capture ${frame.n}`;
	if (frame.kind === "named") return `end named capture "${frame.name}"`;
	if (frame.kind === "lookahead") return "end positive lookahead";
	if (frame.kind === "negLookahead") return "end negative lookahead";
	if (frame.kind === "lookbehind") return "end positive lookbehind";
	if (frame.kind === "negLookbehind") return "end negative lookbehind";
	return "end group";
}

/**
 * Walk a pattern the JavaScript engine has already accepted.
 *
 * The meanings are the contract the fixtures pin. Changing a phrase is a fixture change, so the
 * wording is kept plain and stable: atom, then a comma, then the repeat.
 */
export function walkPattern(pattern: string, flags: string): WalkToken[] {
	const tokens: WalkToken[] = [];
	const stack: GroupFrame[] = [];
	let capture = 1;
	let i = 0;
	const multiline = flags.includes("m");
	const dotall = flags.includes("s");

	const push = (source: string, meaning: string, unbounded = false) => {
		tokens.push({ source, meaning, unbounded });
	};

	const applyQuantifier = (source: string, meaning: string, atomUnbounded: boolean, groupInner?: WalkToken[]) => {
		const q = readQuantifier(pattern, i);
		if (!q) {
			push(source, meaning, atomUnbounded);
			return;
		}
		/*
		 * A denylist of one shape, kept for the explanation rather than for safety: `(a+)+` is what a
		 * reader is most likely to write by accident, and being told why beats being told it timed out.
		 *
		 * ⚠️ It is not the protection. `(a|aa)+$` nests no repeat, passes this check, and still runs for
		 * 28 s on 45 characters. The timeout in the manifest is the protection; see the file header.
		 */
		if (groupInner && isUnbounded(q.kind) && groupInner.some((token) => token.unbounded)) {
			throw new WalkError(
				"This pattern nests a repeat inside another repeat, for example (a+)+. That can run for a very long time. Rewrite it without the outer repeat.",
			);
		}
		i = q.next;
		push(source + q.raw, meaning + quantifierPhrase(q.kind, q.n, q.m, q.lazy), atomUnbounded || isUnbounded(q.kind));
	};

	while (i < pattern.length) {
		const ch = pattern[i] as string;

		if (ch === "(") {
			let kind: GroupKind = "capture";
			let raw = "(";
			let name: string | undefined;
			let n: number | undefined;
			i += 1;
			if (pattern.startsWith("?:", i)) {
				kind = "noncapture";
				raw = "(?:";
				i += 2;
			} else if (pattern.startsWith("?=", i)) {
				kind = "lookahead";
				raw = "(?=";
				i += 2;
			} else if (pattern.startsWith("?!", i)) {
				kind = "negLookahead";
				raw = "(?!";
				i += 2;
			} else if (pattern.startsWith("?<=", i)) {
				kind = "lookbehind";
				raw = "(?<=";
				i += 3;
			} else if (pattern.startsWith("?<!", i)) {
				kind = "negLookbehind";
				raw = "(?<!";
				i += 3;
			} else if (pattern.startsWith("?<", i)) {
				const named = /^<([^>]+)>/.exec(pattern.slice(i + 1));
				if (named) {
					kind = "named";
					name = named[1];
					raw = `(?<${name}>`;
					i += 1 + named[0].length;
					n = capture++;
				}
			}
			if (kind === "capture") n = capture++;
			const meaning =
				kind === "capture"
					? `start capture ${n}`
					: kind === "named"
						? `start named capture "${name}"`
						: kind === "noncapture"
							? "start non-capturing group"
							: kind === "lookahead"
								? "start positive lookahead"
								: kind === "negLookahead"
									? "start negative lookahead"
									: kind === "lookbehind"
										? "start positive lookbehind"
										: "start negative lookbehind";
			push(raw, meaning, false);
			stack.push({
				kind,
				start: tokens.length,
				...(n !== undefined ? { n } : {}),
				...(name !== undefined ? { name } : {}),
			});
			continue;
		}

		if (ch === ")") {
			i += 1;
			const frame = stack.pop();
			if (!frame) {
				applyQuantifier(")", "a closing parenthesis", false);
				continue;
			}
			const inner = tokens.slice(frame.start);
			applyQuantifier(")", closeMeaning(frame), false, inner);
			continue;
		}

		if (ch === "|") {
			i += 1;
			push("|", "or", false);
			continue;
		}

		if (ch === "^") {
			i += 1;
			applyQuantifier("^", multiline ? "start of a line" : "start of the string", false);
			continue;
		}

		if (ch === "$") {
			i += 1;
			applyQuantifier("$", multiline ? "end of a line" : "end of the string", false);
			continue;
		}

		if (ch === ".") {
			i += 1;
			applyQuantifier(".", dotall ? "any character" : "any character except newline", false);
			continue;
		}

		if (ch === "[") {
			let j = i + 1;
			const negated = pattern[j] === "^";
			if (negated) j += 1;
			while (j < pattern.length) {
				if (pattern[j] === "\\" && j + 1 < pattern.length) {
					j += 2;
					continue;
				}
				if (pattern[j] === "]") break;
				j += 1;
			}
			const end = pattern[j] === "]" ? j + 1 : pattern.length;
			const raw = pattern.slice(i, end);
			const body = pattern.slice(i + 1 + (negated ? 1 : 0), end - (pattern[j] === "]" ? 1 : 0));
			i = end;
			applyQuantifier(raw, negated ? `a character not in ${body}` : `a character in ${body}`, false);
			continue;
		}

		if (ch === "\\") {
			const next = pattern[i + 1];
			if (next === undefined) {
				i += 1;
				applyQuantifier("\\", "a backslash", false);
				continue;
			}
			if (next === "x") {
				const hex = hexChar(pattern, i + 2, 2);
				if (hex) {
					i = hex.next;
					applyQuantifier(`\\x${hex.raw}`, `the character ${hex.char}`, false);
					continue;
				}
			}
			if (next === "u") {
				const hex = hexChar(pattern, i + 2, 4);
				if (hex) {
					i = hex.next;
					applyQuantifier(`\\u${hex.raw}`, `the character ${hex.char}`, false);
					continue;
				}
			}
			if (next === "k" && pattern[i + 2] === "<") {
				const named = /^<([^>]+)>/.exec(pattern.slice(i + 2));
				if (named) {
					i += 2 + named[0].length;
					applyQuantifier(`\\k${named[0]}`, `a backreference to "${named[1]}"`, false);
					continue;
				}
			}
			if (/[1-9]/.test(next)) {
				i += 2;
				applyQuantifier(`\\${next}`, `a backreference to capture ${next}`, false);
				continue;
			}
			const meaning = SPECIAL_ESCAPE[next] ?? `the character ${next}`;
			i += 2;
			applyQuantifier(`\\${next}`, meaning, false);
			continue;
		}

		// Consecutive unquantified literals become one token so "hello" is one line, not five.
		let raw = ch;
		let text = ch;
		i += 1;
		while (i < pattern.length) {
			const peek = pattern[i] as string;
			if (peek === "\\" || peek === "(" || peek === ")" || peek === "|" || peek === "^" || peek === "$" || peek === "." || peek === "[" || peek === "]" || peek === "?" || peek === "*" || peek === "+" || peek === "{") {
				break;
			}
			if (readQuantifier(pattern, i + 1)) break;
			raw += peek;
			text += peek;
			i += 1;
		}
		const noun = text.length === 1 ? `the character ${text}` : `the characters ${text}`;
		applyQuantifier(raw, noun, false);
	}

	return tokens;
}

export function formatWalk(tokens: WalkToken[]): string {
	const width = tokens.reduce((max, token) => Math.max(max, token.source.length), 0);
	return tokens.map((token) => `${token.source.padEnd(width)}  ${token.meaning}`).join("\n");
}

export function formatRanges(matches: { text: string; index: number }[]): string {
	if (matches.length === 0) return "Did not match.";

	const bits = matches.map((match) => {
		if (match.text.length === 0) return `empty at ${match.index}`;
		return `${match.index}-${match.index + match.text.length - 1}`;
	});

	const list =
		bits.length === 1 ? bits[0] : bits.length === 2 ? `${bits[0]} and ${bits[1]}` : `${bits.slice(0, -1).join(", ")}, and ${bits[bits.length - 1]}`;

	const emptyOnly = matches.length === 1 && matches[0]!.text.length === 0;
	if (emptyOnly) return `Matched once, an empty match at ${matches[0]!.index}.`;
	if (matches.length === 1) return `Matched once, at ${list}.`;
	return `Matched ${matches.length} times, at ${list}.`;
}

function caretLine(subject: string, matches: { text: string; index: number }[]): string | undefined {
	if (!matches.some((match) => match.text.length > 0)) return undefined;
	const marks = Array.from(subject, () => " ");
	for (const match of matches) {
		for (let i = 0; i < match.text.length; i++) {
			const at = match.index + i;
			if (at >= 0 && at < marks.length) marks[at] = "^";
		}
	}
	// Trailing spaces would make the line as wide as the subject, but they are invisible in
	// the renderer and a nuisance in fixtures. The carets that remain still sit under the match.
	return marks.join("").replace(/ +$/, "");
}

export function collectMatches(
	pattern: string,
	flags: string,
	subject: string,
): { text: string; index: number; groups: (string | null)[] }[] {
	const re = new RegExp(pattern, flags);
	if (flags.includes("g")) {
		return [...subject.matchAll(re)].map((match) => ({
			text: match[0],
			index: match.index ?? 0,
			groups: Array.from(match).slice(1).map((group) => group ?? null),
		}));
	}
	const match = re.exec(subject);
	if (!match) return [];
	return [
		{
			text: match[0],
			index: match.index,
			groups: Array.from(match).slice(1).map((group) => group ?? null),
		},
	];
}

function matchRecord(matches: { text: string; index: number; groups: (string | null)[] }[]): string {
	return JSON.stringify(
		{
			matchCount: matches.length,
			matches: matches.map((match) => ({
				text: match.text,
				index: match.index,
				groups: match.groups,
			})),
		},
		null,
		2,
	);
}

const tool: Tool<Input> = {
	run({ pattern, subject, flags }) {
		if (pattern.length === 0) {
			return { kind: "error", message: "Nothing to explain. Type a pattern.", input: "pattern" };
		}
		if (!FLAG_VALUES.has(flags)) {
			return { kind: "error", message: `"${flags}" is not a flag combination this tool offers.`, input: "flags" };
		}
		// A select option cannot be an empty string, so "none" is the control's stand-in for no flags.
		const engineFlags = flags === "none" ? "" : flags;

		try {
			new RegExp(pattern, engineFlags);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			return { kind: "error", message: detail, input: "pattern" };
		}

		let tokens: WalkToken[];
		try {
			tokens = walkPattern(pattern, engineFlags);
		} catch (error) {
			if (error instanceof WalkError) {
				return { kind: "error", message: error.message, input: "pattern" };
			}
			throw error;
		}

		const matches = collectMatches(pattern, engineFlags, subject);
		const prose = formatRanges(matches);
		const headline = engineFlags.length > 0 ? `${prose} Flags: ${engineFlags}.` : prose;
		const walk = formatWalk(tokens);
		const caret = caretLine(subject, matches);
		const mono = caret === undefined ? `${walk}\n\n${subject}` : `${walk}\n\n${subject}\n${caret}`;

		return {
			kind: "group",
			parts: [
				{ kind: "text", text: headline },
				{ kind: "text", text: mono, mono: true },
				{ kind: "code", lang: "json", source: matchRecord(matches) },
			],
		} satisfies Output;
	},
};

export default tool;
