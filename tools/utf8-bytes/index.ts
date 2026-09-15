/**
 * UTF-8 bytes, with the multi-byte characters marked.
 *
 * This tool exists to exercise the `bytes` output kind added in contract version 2, and it is a real
 * tool rather than a stub because a renderer nobody has looked at is a renderer nobody has tested.
 * It covers the cases that make `bytes` worth having: highlight ranges that start mid-row, a range
 * longer than one byte, and labels that carry meaning colour cannot.
 */
import type { ByteRange, Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { text: string };

/** Every code point, with its UTF-8 length. Iterating a string yields code points, not UTF-16 units. */
function encode(text: string): { bytes: number[]; ranges: ByteRange[]; codePoints: number } {
	const encoder = new TextEncoder();
	const bytes: number[] = [];
	const ranges: ByteRange[] = [];
	let codePoints = 0;

	for (const char of text) {
		const encoded = [...encoder.encode(char)];
		codePoints++;
		/*
		 * Only multi-byte characters get a range. Marking every character would highlight the whole
		 * dump, which says nothing: the point of a highlight is that it is the exception.
		 */
		if (encoded.length > 1) {
			const point = char.codePointAt(0) ?? 0;
			/*
			 * No tone. A four-byte character is information, not a severity, and `--tb-warn` is the same
			 * colour as `--tb-accent` in the default palette anyway, so the distinction would have been
			 * invisible while implying one existed. The label already says how many bytes it is.
			 */
			ranges.push({
				at: bytes.length,
				len: encoded.length,
				label: `U+${point.toString(16).toUpperCase().padStart(4, "0")} ${char}`,
			});
		}
		bytes.push(...encoded);
	}
	return { bytes, ranges, codePoints };
}

export default {
	run({ text }): Output {
		if (text.length === 0) {
			return { kind: "error", message: "Nothing to encode. Type some text.", input: "text" };
		}

		const { bytes, ranges, codePoints } = encode(text);
		const ascii = bytes.length === codePoints;

		return {
			kind: "group",
			parts: [
				{
					kind: "fields",
					fields: [
						{ label: "Bytes", value: String(bytes.length) },
						{ label: "Characters", value: String(codePoints), note: "code points, not UTF-16 units" },
						{
							label: "Encoding",
							value: ascii ? "pure ASCII" : `${ranges.length} multi-byte`,
							// Only a real tone. "normal" is the default, so emitting it is noise that every
							// fixture then has to repeat.
							...(ascii ? { tone: "good" as const } : {}),
						},
						{
							label: "Overhead",
							value: `${bytes.length - codePoints} byte${bytes.length - codePoints === 1 ? "" : "s"}`,
							note: "what UTF-8 costs over one byte per character",
						},
					],
				},
				{
					kind: "bytes",
					bytes,
					caption: ascii ? "Every character is one byte" : "Highlighted runs are one character each",
					...(ranges.length > 0 ? { highlight: ranges } : {}),
				},
			],
		};
	},
} satisfies Tool<Input>;
