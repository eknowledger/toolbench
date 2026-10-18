/**
 * A tiny demo highlighter for the bench.
 *
 * It lives here, not in `@toolbench/runtime`, because a real highlighter is a host concern and
 * bundling one would roughly double the runtime. The hook's job is to return a `Node`. This file
 * builds one with `createElement` and `textContent` so the no-innerHTML rule still holds even in
 * the demo.
 *
 * JSON is enough to prove the path: the bench fixture returns `lang: "json"`. Any other language
 * still goes through the hook and comes back as a wrapped text node, so a missing grammar cannot
 * look like "the hook was not called".
 *
 * Token colours use the runtime's `--tb-*` variables. Those inherit into the shadow root, which is
 * how a host themes highlighted code without the runtime knowing any highlighter exists.
 */
const TOKEN_COLOR: Record<string, string> = {
	string: "var(--tb-good)",
	number: "var(--tb-accent)",
	keyword: "var(--tb-warn)",
	punct: "var(--tb-muted)",
};

const STRING = /"(?:\\.|[^"\\])*"/y;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const KEYWORD = /true|false|null/y;
const PUNCT = /[{}[\],:]/y;
const SPACE = /\s+/y;

function token(kind: string, text: string): Node {
	if (kind === "space") return document.createTextNode(text);
	const span = document.createElement("span");
	span.dataset.tok = kind;
	span.textContent = text;
	const color = TOKEN_COLOR[kind];
	if (color) span.style.color = color;
	return span;
}

function tokenizeJson(source: string, root: Node): void {
	let i = 0;
	while (i < source.length) {
		STRING.lastIndex = i;
		NUMBER.lastIndex = i;
		KEYWORD.lastIndex = i;
		PUNCT.lastIndex = i;
		SPACE.lastIndex = i;

		const string = STRING.exec(source);
		if (string && string.index === i) {
			root.appendChild(token("string", string[0]));
			i += string[0].length;
			continue;
		}
		const number = NUMBER.exec(source);
		if (number && number.index === i) {
			root.appendChild(token("number", number[0]));
			i += number[0].length;
			continue;
		}
		const keyword = KEYWORD.exec(source);
		if (keyword && keyword.index === i) {
			root.appendChild(token("keyword", keyword[0]));
			i += keyword[0].length;
			continue;
		}
		const punct = PUNCT.exec(source);
		if (punct && punct.index === i) {
			root.appendChild(token("punct", punct[0]));
			i += punct[0].length;
			continue;
		}
		const space = SPACE.exec(source);
		if (space && space.index === i) {
			root.appendChild(token("space", space[0]));
			i += space[0].length;
			continue;
		}
		root.appendChild(document.createTextNode(source[i] ?? ""));
		i += 1;
	}
}

/** The function a host passes to `defineToolHost({ highlight })`. */
export function highlight(source: string, lang: string): Node {
	const root = document.createElement("span");
	/*
	 * The attributes are how a test proves the hook received both arguments. `data-lang` on the
	 * wrapper is set by the renderer either way; only this function writes `data-highlight-lang`.
	 */
	root.dataset.highlightLang = lang;
	root.dataset.highlightHook = "1";
	if (lang === "json") tokenizeJson(source, root);
	else root.textContent = source;
	return root;
}

/*
 * Which hook the bench installs, decided here rather than in `boot.ts` on purpose.
 *
 * ⚠️ This file is its own chunk; `boot.ts` is the figure the README publishes. Putting the query-param
 * read and the deliberately broken hooks in `boot.ts` cost 62 gzipped bytes of that figure, measured, at a
 * point when it had 117 to spare. A test instrument gets its own chunk, which is the same rule the theme
 * switch and the fixture manifests follow.
 *
 * The cases are what the renderer promises to survive rather than a sample of them. `plain` omits the hook,
 * which is what a host uninterested in highlighting does. `throw` and `string` exist because those
 * fallbacks are four lines anyone would assume work, and a hook is host code: the runtime has to keep
 * drawing a readable result whatever it is handed.
 */
export function hostHighlight(search: string): ((source: string, lang: string) => Node) | undefined {
	switch (new URLSearchParams(search).get("code")) {
		case "plain":
			return undefined;
		case "throw":
			return () => {
				throw new Error("a host highlighter that throws");
			};
		case "string":
			return (() => "<em>not a node</em>") as unknown as (source: string, lang: string) => Node;
		/*
		 * A Node whose text is not the source, the way a highlighter that adds line numbers would be. Fine for
		 * a `code` result; a painted textarea must refuse it, because the caret would land beside the glyph.
		 */
		case "reword":
			return (source: string, lang: string) => {
				const node = highlight(source, lang);
				node.insertBefore(document.createTextNode("1 "), node.firstChild);
				return node;
			};
		default:
			return highlight;
	}
}
