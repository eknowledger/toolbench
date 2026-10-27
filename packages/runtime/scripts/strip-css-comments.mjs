/**
 * Removes the comments from the runtime's stylesheets after `tsc` has built them, and then the whitespace CSS
 * does not read (see `collapse`).
 *
 * The stylesheets are template literals marked `/* css *\/`, so every comment written inside one to explain
 * a rule was a string the browser received. Measured before this script existed: 3,199 of the 6,698 gzipped
 * bytes of `styles.ts`'s CSS were comments, all of it in the chunk every page loads. The comments stay in
 * the source, where they explain the rules; only the built JavaScript loses them.
 *
 * Only the text of a marked literal is touched, and the script fails rather than writes when a literal or a
 * comment does not end, so a malformed file is a build error.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MARK = "/* css */ `";

/** Strip CSS comments, then the whitespace CSS ignores, from one literal's text. */
export function stripLiteral(text) {
	let out = "";
	for (let i = 0; i < text.length; ) {
		if (text.startsWith("/*", i)) {
			const end = text.indexOf("*/", i + 2);
			if (end < 0) throw new Error("an unclosed CSS comment in a stylesheet");
			i = end + 2;
		} else out += text[i++];
	}
	return collapse(out);
}

/**
 * Collapse the whitespace CSS does not read: indentation, line breaks, and the spaces around `{ } ; , >` and
 * after a colon. Measured at 394 gzipped bytes in the chunk every page loads, and 677 across every chunk.
 *
 * ⚠️ Conservative on purpose, because a space is sometimes the meaning. A run of spaces becomes one space,
 * never none, except beside those five characters and after a colon, where CSS's grammar makes it optional;
 * so the descendant combinator in `.a .b`, the spaces `calc(1px + 2px)` needs around its `+` and the one in
 * `.x :focus` all stay. Quoted strings are left exactly as written, since `content: "a  b"` is text.
 */
export function collapse(css) {
	return css
		.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)
		.map((part, i) =>
			i % 2 === 1
				? part
				: part
						.replace(/\s+/g, " ")
						.replace(/ ?([{};,>]) ?/g, "$1")
						.replace(/: /g, ":")
						.replace(/;}/g, "}"),
		)
		.join("")
		.trim();
}

/**
 * Every `/* css *\/` literal in a built file, stripped. A literal with an `${...}` in it is left exactly as
 * it is: finding where one ends means parsing the JavaScript inside it, nested templates and all, and the
 * only one there is (the graph's colour rules) has no comments to remove.
 */
export function stripFile(source) {
	let out = "";
	let from = 0;
	for (let at = source.indexOf(MARK); at >= 0; at = source.indexOf(MARK, from)) {
		const start = at + MARK.length;
		const end = source.indexOf("`", start);
		if (end < 0) throw new Error("a /* css */ literal with no closing backtick");
		const body = source.slice(start, end);
		out += source.slice(from, start) + (body.includes("${") || body.includes("\\`") ? body : stripLiteral(body));
		from = end;
	}
	return out + source.slice(from);
}

function files(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path) : path.endsWith(".js") ? [path] : [];
	});
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const dist = join(import.meta.dirname, "..", "dist");
	for (const path of files(dist)) {
		const before = readFileSync(path, "utf8");
		if (!before.includes(MARK)) continue;
		const after = stripFile(before);
		if (after !== before) writeFileSync(path, after);
	}
}
