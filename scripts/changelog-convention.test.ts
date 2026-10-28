/**
 * Release notes follow the What's new convention (CONTRIBUTING.md, "Writing a changeset"), checked where
 * `pnpm check` sees it: a pending changeset that breaks it fails here, in its own pull request, rather than
 * in the site build after the release has been cut.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { inline } from "../site/build/markdown.ts";
import { CHANGELOGS, parseChangelog, safeLink } from "../site/build/whats-new.ts";

const ROOT = join(import.meta.dirname, "..");

describe("the What's new convention", () => {
	for (const file of CHANGELOGS) {
		it(`${file}: every entry of every release leads with a kind, a name and one sentence`, () => {
			const parsed = parseChangelog(readFileSync(join(ROOT, file), "utf8"), file);
			assert.ok(parsed.size > 0);
		});
	}

	/*
	 * ⚠️ One test for every pending changeset, not one test each. A release deletes the changesets it
	 * consumed, so a test per file made the suite's documented count fall by seventeen the moment 0.15.0
	 * merged, and main's build failed on a count that no code had changed.
	 */
	it("every pending changeset follows it", () => {
		const pending = readdirSync(join(ROOT, ".changeset")).filter((f) => f.endsWith(".md") && f !== "README.md");
		for (const name of pending) {
			const body = readFileSync(join(ROOT, ".changeset", name), "utf8").replace(/^---\n[\s\S]*?\n---\n+/, "");
			// As changesets will write it: the first line on the bullet, the rest indented beneath.
			const [first = "", ...rest] = body.trim().split("\n");
			const entry = `## 9.9.9\n\n### Patch Changes\n\n- ${first}\n${rest.map((l) => (l ? `  ${l}` : "")).join("\n")}\n`;
			assert.ok((parseChangelog(entry, `.changeset/${name}`).get("9.9.9") ?? []).length > 0, `.changeset/${name}`);
		}
	});

	/*
	 * The expected items are written by hand from the convention's text, not printed from the parser: a
	 * changelog-github prefix, the comment's four keys, an issue link the page drops, a second item further
	 * down the same entry, a sub-bullet that is detail and not an item, and a dependency line that is skipped.
	 */
	it("reads an entry the way the convention describes", () => {
		const text = [
			"# @toolbench/runtime",
			"",
			"## 1.2.0",
			"",
			"### Minor Changes",
			"",
			'- [#1](https://x/pull/1) [`abc1234`](https://x/commit/abc) Thanks [@me](https://x/me)! - **New: Reset button.** Puts a tool\'s inputs back. ([#9](https://x/issues/9)) <!-- whats-new: gallery=reset docs=docs.html#reset shot=reset label="On by default" -->',
			"  ",
			"  Longer detail that the page does not show.",
			"  ",
			"  - **New:** a sub-bullet, which is detail.",
			"  ",
			"  **Fixed: Second thing.** Also shipped here.",
			"",
			"### Patch Changes",
			"",
			"- Updated dependencies []:",
			"  - @toolbench/sdk@1.2.0",
			"",
		].join("\n");
		const items = parseChangelog(text, "test").get("1.2.0");
		assert.deepEqual(items, [
			{ kind: "new", name: "Reset button", line: "Puts a tool's inputs back.", gallery: "reset", docs: "docs.html#reset", shot: "reset", label: "On by default", from: "test 1.2.0" },
			{ kind: "fixed", name: "Second thing", line: "Also shipped here.", from: "test 1.2.0" },
		]);
	});

	it("refuses an entry without a kind and a name, and a line of two sentences", () => {
		const entry = (s: string) => `## 1.0.0\n\n- ${s}\n`;
		assert.throws(() => parseChangelog(entry("Published source maps now contain their sources."), "t"), /does not start with \*\*New: Name\.\*\*/);
		assert.throws(() => parseChangelog(entry("**New: Thing.** One. Two."), "t"), /more than one sentence/);
		assert.throws(() => parseChangelog(entry("**New: Thing.** Fine. <!-- whats-new: page=x -->"), "t"), /unknown key "page"/);
	});

	/*
	 * The comment's values go into attributes and the line is rendered as markup, so a crafted entry must
	 * fail the build, naming itself, rather than reach the page.
	 */
	it("refuses a link value that could break out of its attribute", () => {
		const entry = (comment: string) => `## 1.0.0\n\n- **New: Thing.** Fine. <!-- whats-new: ${comment} -->\n`;
		assert.throws(() => parseChangelog(entry('shot=x"onclick=alert(1)'), "t"), /"Thing" has shot=/);
		assert.throws(() => parseChangelog(entry('shot="a b"'), "t"), /"Thing" has shot=a b; it must be/);
		assert.throws(() => parseChangelog(entry("gallery=reset\"><script>"), "t"), /"Thing" has gallery=/);
		assert.throws(() => parseChangelog(entry("docs=javascript:alert(1)"), "t"), /"Thing" has docs=javascript:alert\(1\)/);
		assert.throws(() => parseChangelog(entry("docs=https://example.com/x.html"), "t"), /"Thing" has docs=/);
		assert.throws(() => parseChangelog(entry("docs=../secret.html"), "t"), /"Thing" has docs=/);
		// What the convention does allow still parses.
		assert.equal(parseChangelog(entry("gallery=tool-utf8-bytes docs=docs-ref-host.html#element-attributes shot=chart-phone"), "t").get("1.0.0")?.[0]?.shot, "chart-phone");
	});

	it("refuses a line with raw markup or a link to another scheme", () => {
		const entry = (line: string) => `## 1.0.0\n\n- **New: Thing.** ${line}\n`;
		assert.throws(() => parseChangelog(entry("Draws <img src=x onerror=alert(1)> here."), "t"), /"Thing" has a "<" in its line outside a code span/);
		assert.throws(() => parseChangelog(entry("See <details> for more."), "t"), /outside a code span/);
		assert.throws(() => parseChangelog(entry("See [the docs](javascript:alert(1))."), "t"), /"Thing" links to javascript:/);
		assert.throws(() => parseChangelog(entry("See [the docs](data:text/html,x)."), "t"), /"Thing" links to data:/);
		// Markup inside a code span is shown as text, and http(s) and relative links are fine.
		assert.equal(parseChangelog(entry("One type lists every `<tool-host>` attribute."), "t").get("1.0.0")?.length, 1);
		assert.equal(parseChangelog(entry("See [the docs](https://example.com) or [this](./docs.html)."), "t").get("1.0.0")?.length, 1);
	});
});

describe("the link check on what is rendered", () => {
	/*
	 * The parse-time check reads raw text with a regex of its own. This one runs inside inline()'s link
	 * replacement, on the href it is about to write, so it holds even for a line the first check misread.
	 */
	it("refuses a scheme other than http(s) at render time, and lets relative and http(s) links through", () => {
		const render = (line: string) => inline(line, { linkFor: safeLink("Test") });
		for (const href of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x"]) assert.throws(() => render(`see [this](${href})`), /only relative and http\(s\) links/, href);
		for (const href of ["./gallery.html#reset", "https://example.com/a", "docs.html"]) assert.match(render(`see [this](${href})`), /<a href="/, href);
	});

	it("refuses a control character in a line", () => {
		assert.throws(() => parseChangelog("## 1.0.0\n\n- **Fixed: Thing.** A line with a \u0007 bell.\n", "t"), /control character/);
	});
});

describe("raw HTML in a What's new line", () => {
	it("renders as text whatever the code-span rules make of it", () => {
		const render = (line: string) => inline(line, { linkFor: safeLink("Test"), noRawTags: true });
		for (const line of ["``<b onmouseover=alert(1)>x</b>``", "`a``<img src=x onerror=alert(1)>", "<details open><summary>x</summary></details>", "<strong onclick=alert(1)>x</strong>"]) {
			const html = render(line);
			// Only the renderer's own tags, and none of them carrying an attribute but an href.
			assert.ok(!/<(?!\/?(?:code|strong|em|a)\b)[a-z]/i.test(html), `${line} rendered a raw tag: ${html}`);
			assert.ok(![...html.matchAll(/<[a-z]+\s([^>]*)>/gi)].some((m) => !/^href="[^"]*"$/.test(m[1] ?? "")), `${line} rendered an attribute: ${html}`);
		}
	});
});

