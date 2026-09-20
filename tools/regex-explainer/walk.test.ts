/**
 * Properties of the explainer that fixtures cannot say: a bounded group around a repeat is allowed,
 * and the walk of the default pattern is the hand-written token list (not captured from a run).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import tool, { formatWalk, walkPattern } from "./index.ts";
import { testCtx } from "../../packages/sdk/src/testing.ts";

const DEFAULT_WALK = [
	"(    start capture 1",
	"\\w+  a word character, one or more",
	")    end capture 1",
	"\\s+  a whitespace character, one or more",
	"(    start capture 2",
	"\\d+  a digit, one or more",
	")    end capture 2",
].join("\n");

describe("regex-explainer walk", () => {
	it("walks the default pattern as the hand-written token list", () => {
		const tokens = walkPattern("(\\w+)\\s+(\\d+)", "");
		assert.equal(formatWalk(tokens), DEFAULT_WALK);
	});

	it("allows an optional group around a repeat", () => {
		const tokens = walkPattern("(a+)?", "");
		assert.equal(tokens.at(-1)?.source, ")?");
		assert.equal(tokens.at(-1)?.meaning, "end capture 1, optional");
	});

	it("refuses a nested unbounded repeat and does not match", () => {
		const output = tool.run({ pattern: "(a+)+", subject: "aaaaaaaa", flags: "none" }, testCtx());
		assert.equal(output.kind, "error");
		if (output.kind === "error") {
			assert.match(output.message, /nests a repeat/);
			assert.equal(output.input, "pattern");
		}
	});
});
