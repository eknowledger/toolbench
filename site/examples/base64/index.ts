/**
 * The Base64 decoder that docs/authoring-a-tool.md builds, step by step, so the docs can show it running.
 *
 * `run` is the document's Step 2 as written; the manifest is its Step 1 and cases.json its Step 3. The
 * document leaves out `decode` and `rowsOf` as "ordinary functions with nothing Toolbench-specific about
 * them"; these are those two.
 */
import type { Cell, Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface. An interface does not satisfy the SDK's index-signature
// constraint, and the error you get for that is not obvious.
type Input = { source: string; view: string };

const ALPHABET = /^[A-Za-z0-9+/\-_]*={0,2}$/;
const DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard or URL-safe Base64 to bytes, padding optional. The caller has already checked the alphabet. */
function decode(text: string): number[] {
	const bytes: number[] = [];
	let bits = 0;
	let held = 0;
	for (const ch of text.replace(/=+$/, "")) {
		const value = DIGITS.indexOf(ch === "-" ? "+" : ch === "_" ? "/" : ch);
		bits = (bits << 6) | value;
		held += 6;
		if (held >= 8) {
			held -= 8;
			bytes.push((bits >> held) & 0xff);
		}
	}
	return bytes;
}

/** Sixteen bytes per row: the offset, then the bytes as hex pairs or as printable ASCII. */
function rowsOf(bytes: number[], view: string): Cell[][] {
	const rows: Cell[][] = [];
	for (let at = 0; at < bytes.length; at += 16) {
		const chunk = bytes.slice(at, at + 16);
		const shown =
			view === "hex"
				? chunk.map((b) => b.toString(16).padStart(2, "0")).join(" ")
				: chunk.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
		rows.push([String(at), shown]);
	}
	return rows;
}

export default {
	run({ source, view }): Output {
		const trimmed = source.replace(/\s+/g, "");
		if (trimmed.length === 0) {
			return { kind: "error", message: "Nothing to decode.", input: "source" };
		}
		if (!ALPHABET.test(trimmed)) {
			const at = trimmed.search(/[^A-Za-z0-9+/\-_=]/);
			return {
				kind: "error",
				message: `"${trimmed[at]}" is not a Base64 character.`,
				input: "source",
				at,
				len: 1,
			};
		}

		const bytes = decode(trimmed);
		return {
			kind: "group",
			parts: [
				{
					kind: "fields",
					fields: [
						{ label: "Bytes", value: String(bytes.length) },
						{ label: "Padding", value: trimmed.endsWith("=") ? "present" : "absent" },
						{ label: "Alphabet", value: /[-_]/.test(trimmed) ? "URL-safe" : "standard" },
					],
				},
				{
					kind: "table",
					caption: "Sixteen bytes per row",
					columns: [
						{ label: "Offset", align: "end" },
						{ label: view === "hex" ? "Hex" : "ASCII", mono: true },
					],
					rows: rowsOf(bytes, view),
				},
			],
		};
	},
} satisfies Tool<Input>;
