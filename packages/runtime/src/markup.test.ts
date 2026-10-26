import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPlain, parseMarkup } from "./markup.ts";

/*
 * Every expectation here is written from #217's table by hand: a blank line starts a paragraph, lines
 * starting "- " are list items, `code`, **strong**, and {tone|text} for good, warn, bad, muted and accent.
 * Anything else, including a marker left open, is text.
 */
describe("help text markup (#217)", () => {
	it("reads text with no markup as one plain paragraph", () => {
		for (const text of ["Paste any one of these.", "Two lines\nin one paragraph.", "A price of $5 {not a tone} and a * star.", "x_bucket{le=0.05}"]) {
			assert.ok(isPlain(parseMarkup(text)), text);
		}
	});

	it("starts a paragraph at a blank line, however many there are", () => {
		assert.deepEqual(parseMarkup("One.\n\nTwo.\n\n\nThree."), [
			{ t: "p", kids: ["One."] },
			{ t: "p", kids: ["Two."] },
			{ t: "p", kids: ["Three."] },
		]);
	});

	it("groups lines starting with a dash and a space into one list, beside a paragraph in the same block", () => {
		assert.deepEqual(parseMarkup("Paste one of these.\n- Prometheus\n- Cloud Monitoring\nAnything else is raw."), [
			{ t: "p", kids: ["Paste one of these."] },
			{ t: "ul", items: [["Prometheus"], ["Cloud Monitoring"]] },
			{ t: "p", kids: ["Anything else is raw."] },
		]);
		assert.ok(isPlain(parseMarkup("-5 is a number, and -dash is not a list")));
	});

	it("reads code, strong and the five tones inline, and strong or code inside a tone", () => {
		assert.deepEqual(parseMarkup('Run `x_bucket{le="0.05"} 120` **now**.'), [
			{ t: "p", kids: ["Run ", { t: "code", text: 'x_bucket{le="0.05"} 120' }, " ", { t: "strong", kids: ["now"] }, "."] },
		]);
		for (const tone of ["good", "warn", "bad", "muted", "accent"]) {
			assert.deepEqual(parseMarkup(`a {${tone}|b} c`), [{ t: "p", kids: ["a ", { t: "tone", tone, kids: ["b"] }, " c"] }]);
		}
		assert.deepEqual(parseMarkup("{bad|**refused**: `+Inf` missing}"), [
			{ t: "p", kids: [{ t: "tone", tone: "bad", kids: [{ t: "strong", kids: ["refused"] }, ": ", { t: "code", text: "+Inf" }, " missing"] }] },
		]);
	});

	it("leaves an open marker, an unknown tone and an empty span as text", () => {
		for (const text of ["a `b", "a **b", "{red|b}", "{good|b", "``", "****", "{good|}"]) {
			assert.ok(isPlain(parseMarkup(text)), text);
		}
	});

	it("reads code literally, so markup inside it is shown as written", () => {
		assert.deepEqual(parseMarkup("`**not strong** {good|x}`"), [{ t: "p", kids: [{ t: "code", text: "**not strong** {good|x}" }] }]);
	});
});
