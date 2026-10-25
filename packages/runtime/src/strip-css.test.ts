import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
// @ts-expect-error a build script in plain JavaScript, with no declarations
import { stripFile, stripLiteral } from "../scripts/strip-css-comments.mjs";

const squash = (css: string) => css.replace(/\s+/g, " ").trim();

describe("stripping comments from the built stylesheets", () => {
	it("removes every comment and the blank lines it leaves, and nothing else", () => {
		assert.equal(stripLiteral("a { b: c; }\n  /* why b is c */\n\nd { e: f; } /* and this */\n"), "a { b: c; }\nd { e: f; }\n");
	});

	it("keeps every rule of the real stylesheet", () => {
		const source = readFileSync(new URL("./styles.ts", import.meta.url), "utf8");
		const css = /\/\* css \*\/ `([\s\S]*?)`;/.exec(source)?.[1] ?? "";
		const stripped = stripLiteral(css);
		assert.ok(!stripped.includes("/*"), "a comment survived");
		assert.equal(squash(stripped), squash(css.replace(/\/\*[\s\S]*?\*\//g, "")));
		assert.ok(stripped.length < css.length * 0.7, `expected most of the text to be comments, kept ${stripped.length} of ${css.length}`);
	});

	it("leaves a literal with an interpolation exactly as it is", () => {
		const file = "const x = /* css */ `${a}{b:c} /* kept */`;";
		assert.equal(stripFile(file), file);
	});

	it("refuses an unclosed comment rather than writing half a stylesheet", () => {
		assert.throws(() => stripLiteral("a{b:c} /* never closed"), /unclosed/);
	});
});
