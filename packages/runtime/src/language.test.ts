import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { languageClass } from "./render/index.ts";

describe("languageClass", () => {
	it("names the language for a host's highlighter", () => {
		for (const lang of ["json", "c++", "c#", "objective-c", "x86.asm", "f_sharp"]) assert.equal(languageClass(lang), `language-${lang}`);
	});

	it("writes no class for a lang that would add classes of its own", () => {
		for (const lang of ["json tb-hidden", "json\ttb-hidden", "json\ntb-hidden", "", " "]) assert.equal(languageClass(lang), undefined, JSON.stringify(lang));
	});
});
