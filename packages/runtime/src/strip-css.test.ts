import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { transform } from "esbuild";
// @ts-expect-error a build script in plain JavaScript, with no declarations
import { collapse, stripFile, stripLiteral } from "../scripts/strip-css-comments.mjs";

describe("stripping comments and whitespace from the built stylesheets", () => {
	it("removes every comment and the whitespace CSS does not read, and nothing else", () => {
		assert.equal(stripLiteral("a { b: c; }\n  /* why b is c */\n\nd > e { f: g; } /* and this */\n"), "a{b:c}d>e{f:g}");
	});

	it("keeps every space that carries meaning", () => {
		// A descendant combinator, the spaces calc needs around + and -, a space before a pseudo-class, and text.
		assert.equal(collapse(".a  .b :focus { width: calc(1px  +  2px - 3%); }"), ".a .b :focus{width:calc(1px + 2px - 3%)}");
		assert.equal(collapse('.a::after { content: "x  ,  y : { }"; }'), '.a::after{content:"x  ,  y : { }"}');
		assert.equal(collapse(".a + .b ~ .c { margin: 0 auto; }"), ".a + .b ~ .c{margin:0 auto}");
	});

	it("keeps every rule of the real stylesheet", () => {
		const source = readFileSync(new URL("./styles.ts", import.meta.url), "utf8");
		const css = /\/\* css \*\/ `([\s\S]*?)`;/.exec(source)?.[1] ?? "";
		const stripped = stripLiteral(css);
		assert.ok(!stripped.includes("/*"), "a comment survived");
		assert.ok(stripped.length < css.length * 0.7, `expected most of the text to be comments, kept ${stripped.length} of ${css.length}`);
	});

	it("leaves a literal with an interpolation exactly as it is", () => {
		const file = "const x = /* css */ `${a}{b:c} /* kept */`;";
		assert.equal(stripFile(file), file);
	});

	it("refuses an unclosed comment rather than writing half a stylesheet", () => {
		assert.throws(() => stripLiteral("a{b:c} /* never closed"), /unclosed/);
	});

	/*
	 * ⚠️ The proof that collapsing changed no rule: every stylesheet in the runtime, before and after, read by a
	 * real CSS parser and printed back in one canonical form, must come out identical. esbuild is that parser,
	 * a devDependency of the repository and never of a package. Comparing the text with its whitespace squashed
	 * cannot see a space removed from the one place it mattered.
	 *
	 * Three allowances, and all are the parser's rather than this script's: esbuild prints these exactly as
	 * written, where CSS reads the whitespace in them as optional. A custom property's value and a `var()`
	 * fallback, since neither is parsed until it is substituted, so `--a: b, c` and `--a:b,c` print differently
	 * although they are the same once used; there, the whitespace after a comma and around the value is not
	 * compared. And a media or container query's prelude, where `(max-width: 26rem)` is `(max-width:26rem)`;
	 * there, the whitespace after a colon is not compared.
	 */
	it("leaves every stylesheet in the runtime the same stylesheet to a CSS parser", async () => {
		const sheets = sources(new URL(".", import.meta.url).pathname).flatMap((path) =>
			[...readFileSync(path, "utf8").matchAll(/\/\* css \*\/ `([\s\S]*?)`;/g)]
				.map((m) => m[1] ?? "")
				.filter((css) => !css.includes("${"))
				.map((css) => ({ path, css })),
		);
		assert.ok(sheets.length >= 10, `expected the runtime's stylesheets, found ${sheets.length}`);
		const canonical = async (css: string) =>
			(await transform(css, { loader: "css", minify: true })).code.replace(
				/(--[\w-]+:)([^;}]*)/g,
				(_, name: string, value: string) => name + value.trim().replace(/,\s+/g, ","),
			)
				.replace(/(var\(--[\w-]+,)\s+/g, "$1")
				.replace(/@(?:media|container)[^{]*/g, (prelude) => prelude.replace(/:\s+/g, ":"));
		for (const { path, css } of sheets) {
			const collapsed = stripLiteral(css);
			assert.ok(collapsed.length < css.length, path);
			assert.equal(await canonical(collapsed), await canonical(css), path);
		}
	});
});

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? sources(path) : /(?<!\.test)\.ts$/.test(name) ? [path] : [];
	});
}
