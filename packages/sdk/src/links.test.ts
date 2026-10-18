import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSafeLinkHref } from "./links.ts";

describe("isSafeLinkHref", () => {
	it("refuses anything that is not a non-empty string", () => {
		for (const value of [undefined, null, 1, {}, ""]) assert.equal(isSafeLinkHref(value), false, String(value));
	});

	it("refuses every control character, space and DEL, each of which the URL parser can strip", () => {
		for (let code = 0; code <= 0x20; code++) {
			assert.equal(isSafeLinkHref(`https://example.com/${String.fromCharCode(code)}`), false, `U+${code.toString(16)}`);
		}
		assert.equal(isSafeLinkHref("https://example.com/\u007f"), false);
	});

	it("allows what a reader can follow", () => {
		for (const href of ["https://example.com", "HTTPS://EXAMPLE.COM", "mailto:a@b.c", "./x", "../x", "x/y"]) {
			assert.equal(isSafeLinkHref(href), true, href);
		}
	});
});
