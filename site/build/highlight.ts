/**
 * A small syntax highlighter for the languages the docs actually contain: TypeScript, JSON(C), shell,
 * CSS and HTML. It returns HTML strings of spans and is run at BUILD time for everything static, so a
 * reader downloads coloured markup and no highlighter. The gallery imports the same functions on demand,
 * for the source viewer and for the runtime's `highlight` hook.
 *
 * It tokenises with one regular expression per language and colours four things: comments, strings,
 * numbers and keywords (plus property names in JSON). That is the whole ambition. A real grammar would
 * be a dependency, and the docs read fine without one.
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
		["s", String.raw`"[^"]*"|'[^']*'`],
		["k", String.raw`<\/?[\w-]+|\/?>`],
		["p", String.raw`\b[\w-]+(?==)`],
	],
};
const ALIASES: Record<string, string> = { js: "ts", typescript: "ts", jsonc: "json", bash: "sh", shell: "sh", zsh: "sh" };

/** The tokens of `source`: plain text has an empty class. Concatenating every text gives back the source. */
export function tokens(source: string, lang: string): [cls: string, text: string][] {
	const rules = RULES[ALIASES[lang] ?? lang];
	if (!rules) return [["", source]];
	const re = new RegExp(rules.map(([, p]) => `(${p})`).join("|"), "g");
	const out: [string, string][] = [];
	let last = 0;
	for (const m of source.matchAll(re)) {
		const index = m.index ?? 0;
		if (index > last) out.push(["", source.slice(last, index)]);
		const group = m.slice(1).findIndex((g) => g !== undefined);
		out.push([rules[group]?.[0] ?? "", m[0]]);
		last = index + m[0].length;
	}
	if (last < source.length) out.push(["", source.slice(last)]);
	return out;
}

const span = (cls: string, text: string) => (cls ? `<span class="t-${cls}">${escapeHtml(text)}</span>` : escapeHtml(text));

export function highlight(source: string, lang: string): string {
	return tokens(source, lang)
		.map(([cls, text]) => span(cls, text))
		.join("");
}

/**
 * One HTML string per line. A token that spans lines (a block comment, a template string) is closed at
 * each line's end and reopened on the next, so every line is well formed on its own.
 */
export function highlightLines(source: string, lang: string): string[] {
	const lines: string[] = [""];
	for (const [cls, text] of tokens(source, lang)) {
		const parts = text.split("\n");
		for (const [k, part] of parts.entries()) {
			if (k > 0) lines.push("");
			if (part) lines[lines.length - 1] += span(cls, part);
		}
	}
	return lines;
}

const LANGS: Record<string, [abbr: string, name: string]> = {
	ts: ["TS", "TypeScript"],
	json: ["{}", "JSON"],
	sh: ["$", "Shell"],
	css: ["#", "CSS"],
	html: ["<>", "HTML"],
	text: ["Aa", "Text"],
};

/**
 * A code block: a bar with the language on the left and Copy on the right, then the code with line
 * numbers. The numbers are CSS counters on each line, drawn with an empty alternative text
 * (`content: counter(n) / ""`), so they are neither selectable nor read aloud, and Copy reads the lines'
 * own text. `label` replaces the language name, for a block that names its file.
 */
export function codeBlock(source: string, lang: string, label?: string): string {
	const key = ALIASES[lang] ?? (RULES[lang] ? lang : "text");
	const [abbr, name] = LANGS[key] ?? LANGS.text!;
	const lines = highlightLines(source.replace(/\n$/, ""), lang)
		.map((html) => `<span class="cl">${html || " "}</span>`)
		.join("");
	return `<div class="codeblock" data-lang="${escapeHtml(lang || "text")}"><div class="codeblock-bar"><span class="codeblock-lang"><span class="codeblock-icon" aria-hidden="true">${escapeHtml(abbr)}</span>${escapeHtml(label ?? name)}</span><button type="button" class="codeblock-copy" data-copy-code>Copy<span class="visually-hidden"> ${escapeHtml(label ?? `${name} code`)}</span></button></div><pre class="code" tabindex="0"><code>${lines}</code></pre></div>`;
}
