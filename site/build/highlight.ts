/**
 * A small syntax highlighter for the languages the docs actually contain: TypeScript, JSON(C), shell,
 * CSS and HTML. It returns an HTML string of spans and is run at BUILD time for everything static, so a
 * reader downloads coloured markup and no highlighter. The gallery's source view imports the same
 * function on demand, which is the only place it ever reaches a browser.
 *
 * It tokenises with one sticky regular expression per language and colours four things: comments,
 * strings, numbers and keywords (plus property names in JSON). That is the whole ambition. A real
 * grammar would be a dependency, and the docs read fine without one.
 */

export function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Rule = [cls: string, pattern: string];

const TS_KEYWORDS =
	"import|export|from|default|const|let|var|function|return|if|else|for|of|in|while|new|type|interface|async|await|satisfies|as|throw|try|catch|class|extends|true|false|null|undefined|void|typeof";

const RULES: Record<string, Rule[]> = {
	ts: [
		["c", String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`],
		["s", String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|` + "`(?:[^`\\\\]|\\\\.)*`"],
		["n", String.raw`\b\d[\d_.]*\b`],
		["k", String.raw`\b(?:${TS_KEYWORDS})\b`],
	],
	json: [
		["c", String.raw`\/\/[^\n]*`],
		["p", String.raw`"(?:[^"\\\n]|\\.)*"(?=\s*:)`],
		["s", String.raw`"(?:[^"\\\n]|\\.)*"`],
		["n", String.raw`-?\b\d[\d.eE+-]*\b`],
		["k", String.raw`\b(?:true|false|null)\b`],
	],
	sh: [
		["c", String.raw`#[^\n]*`],
		["s", String.raw`"(?:[^"\\\n]|\\.)*"|'[^'\n]*'`],
		["k", String.raw`(?<=^|\n)\s*(?:pnpm|npm|node|npx|git|cd)\b`],
	],
	css: [
		["c", String.raw`\/\*[\s\S]*?\*\/`],
		["s", String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'`],
		["p", String.raw`--[\w-]+|[\w-]+(?=\s*:)`],
		["n", String.raw`#[0-9a-fA-F]{3,8}\b|\b\d[\d.]*(?:px|rem|em|%|ms|s)?\b`],
	],
	html: [
		["c", String.raw`<!--[\s\S]*?-->`],
		["s", String.raw`"[^"]*"`],
		["k", String.raw`<\/?[\w-]+|\/?>`],
		["p", String.raw`\b[\w-]+(?==)`],
	],
};
const ALIASES: Record<string, string> = { js: "ts", typescript: "ts", jsonc: "json", bash: "sh", shell: "sh", zsh: "sh" };

export function highlight(source: string, lang: string): string {
	const rules = RULES[ALIASES[lang] ?? lang];
	if (!rules) return escapeHtml(source);
	const re = new RegExp(rules.map(([, p]) => `(${p})`).join("|"), "g");
	let out = "";
	let last = 0;
	for (const m of source.matchAll(re)) {
		const index = m.index ?? 0;
		out += escapeHtml(source.slice(last, index));
		const group = m.slice(1).findIndex((g) => g !== undefined);
		const cls = rules[group]?.[0] ?? "";
		out += `<span class="t-${cls}">${escapeHtml(m[0])}</span>`;
		last = index + m[0].length;
	}
	return out + escapeHtml(source.slice(last));
}
