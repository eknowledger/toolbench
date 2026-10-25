/**
 * Removes the comments from the runtime's stylesheets after `tsc` has built them.
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

/** Strip CSS comments, and the blank lines and trailing spaces they leave, from one literal's text. */
export function stripLiteral(text) {
	let out = "";
	for (let i = 0; i < text.length; ) {
		if (text.startsWith("/*", i)) {
			const end = text.indexOf("*/", i + 2);
			if (end < 0) throw new Error("an unclosed CSS comment in a stylesheet");
			i = end + 2;
		} else out += text[i++];
	}
	return out.replace(/[ \t]+$/gm, "").replace(/\n{2,}/g, "\n");
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
