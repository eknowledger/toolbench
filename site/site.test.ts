/**
 * The built site, checked: no broken internal link, no link to GitHub where the site has the page, the
 * landing page's figures equal their sources, and every example actually running in a browser. Run after
 * `pnpm site:build`, with `pnpm test:site`.
 *
 * Two layers, because each catches what the other cannot. The link and figure checks read the HTML files
 * and need no browser. The gallery and docs checks open the pages in Chrome, because a tool that renders
 * in a unit test can still fail to load in a page: a glob the bundler did not follow, a worker built as
 * iife, a chunk with the wrong base.
 *
 * `SITE_BASE` must match the build (`/` by default, `/toolbench/` for Pages).
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import { after, before, describe, it } from "node:test";
import { type Browser, chromium } from "playwright";
import { DOCS } from "./build/plugin.ts";
import { browsers, chartTypes, graphLayouts, stats } from "./build/stats.ts";

const DIST = join(import.meta.dirname, "dist");
const ROOT = join(import.meta.dirname, "..");
const TOOLS = join(ROOT, "tools");
const BASE = (process.env.SITE_BASE ?? "/").replace(/\/?$/, "/");
const GITHUB_FILE = /^https:\/\/github\.com\/eknowledger\/toolbench\/blob\/main\/([^#?]+)(?:#(.*))?$/;

if (!existsSync(join(DIST, "index.html"))) throw new Error(`No built site at ${DIST}. Run \`pnpm site:build\` first.`);

const pages = readdirSync(DIST).filter((f) => f.endsWith(".html"));
const html = new Map(pages.map((p) => [p, readFileSync(join(DIST, p), "utf8")]));
const ids = (text: string) => new Set([...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const toolIds = readdirSync(TOOLS, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name)
	.sort();
/** The anchors on a page, written as `<a ...>`, with their attributes. */
const anchors = (text: string) => [...text.matchAll(/<a\s([^>]*)>/g)].map((m) => m[1] ?? "");

describe("links in the built site", () => {
	for (const page of pages) {
		it(`${page}: every internal href and src resolves`, () => {
			const text = html.get(page) ?? "";
			const broken: string[] = [];
			for (const m of text.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
				const raw = (m[1] ?? "").replace(/&amp;/g, "&");
				if (/^(?:[a-z]+:|\/\/)/i.test(raw)) continue;
				const [beforeHash = "", hash = ""] = raw.split("#");
				const [path = "", query = ""] = beforeHash.split("?");
				let file: string;
				if (path === "") file = page;
				else if (path.startsWith("/")) {
					if (!path.startsWith(BASE)) {
						broken.push(`${raw} (outside the base ${BASE})`);
						continue;
					}
					file = path.slice(BASE.length);
				} else file = normalize(path);
				if (file.endsWith("/")) file += "index.html";
				const target = join(DIST, file);
				if (!existsSync(target) || !statSync(target).isFile()) {
					broken.push(raw);
					continue;
				}
				if (query) broken.push(`${raw} (no page here takes a query)`);
				if (hash && file.endsWith(".html") && !ids(html.get(file) ?? "").has(hash)) broken.push(`${raw} (no element with id "${hash}")`);
			}
			assert.deepEqual(broken, [], `${page} has links that go nowhere`);
		});

		it(`${page}: links to the site's own page wherever there is one, not to GitHub`, () => {
			const offenders: string[] = [];
			for (const attrs of anchors(html.get(page) ?? "")) {
				const href = /href="([^"]*)"/.exec(attrs)?.[1]?.replace(/&amp;/g, "&") ?? "";
				const m = GITHUB_FILE.exec(href);
				// The one deliberate exception: a docs page's link to its own source file.
				if (!m || attrs.includes("data-source-file")) continue;
				const [, file = "", hash = ""] = m;
				const local = DOCS.find((d) => d.file === file && (hash === "" || ids(html.get(d.page) ?? "").has(hash)));
				if (local) offenders.push(`${href} (the site has ./${local.page}${hash ? `#${hash}` : ""})`);
			}
			assert.deepEqual(offenders, []);
		});
	}

	it("the gallery lists exactly the tools in tools/", () => {
		const listed = [...(html.get("gallery.html") ?? "").matchAll(/data-tool="([^"]+)"/g)].map((m) => m[1]).sort();
		assert.deepEqual(listed, toolIds);
	});

	it("the site's own example tools link only to pages the site has", () => {
		// The runtime draws these links, so the static scan above never sees them.
		const dir = join(import.meta.dirname, "examples");
		for (const id of readdirSync(dir)) {
			const m = JSON.parse(readFileSync(join(dir, id, "tool.json"), "utf8")) as { links?: { href: string }[] };
			for (const { href } of m.links ?? []) {
				if (/^[a-z]+:/i.test(href)) continue;
				const [path = "", hash = ""] = href.replace(/^\.\//, "").split("#");
				assert.ok(html.has(path), `${id} links to ${href}, which the site does not have`);
				if (hash) assert.ok(ids(html.get(path) ?? "").has(hash), `${id} links to ${href}, which has no such heading`);
			}
		}
	});

	it("nothing links to the retired playground or charts page", () => {
		for (const [page, text] of html) assert.doesNotMatch(text, /href="\.\/(?:playground\/|charts\.html)/, page);
	});
});

describe("the Inputs reference", () => {
	/*
	 * The page is generated from types.ts, so it can only fall behind the SDK if the generator stops reading
	 * something. Hold it to the SDK's own list: every input type has its row and its section, and nothing more.
	 */
	it("has a row and a section for exactly the SDK's input types", async () => {
		const { INPUT_TYPES } = (await import("../packages/sdk/src/index.ts")) as { INPUT_TYPES: readonly string[] };
		const page = html.get("docs-ref-inputs.html") ?? "";
		const sections = [...page.matchAll(/<h2 id="([^"]+)">/g)].map((m) => m[1]).filter((id) => !["types", "common-attributes", "validation-rules"].includes(id ?? ""));
		assert.deepEqual(sections, [...INPUT_TYPES]);
		for (const t of INPUT_TYPES) assert.ok(page.includes(`href="#${t}"`), `the Types table has no row for ${t}`);
	});

	it("shows the validator's own messages", async () => {
		const page = html.get("docs-ref-inputs.html") ?? "";
		// One message, checked against the source text, so a page of invented messages would fail.
		assert.ok(page.includes("a select needs at least two options; with one, use a fixed value"));
		assert.ok(readFileSync(join(import.meta.dirname, "../packages/sdk/src/validate.ts"), "utf8").includes("a select needs at least two options; with one, use a fixed value"));
	});
});

describe("the Results reference", () => {
	it("has a row and a section for exactly the SDK's result kinds", async () => {
		const { OUTPUT_KINDS } = (await import("../packages/sdk/src/index.ts")) as { OUTPUT_KINDS: readonly string[] };
		const page = html.get("docs-ref-results.html") ?? "";
		const sections = [...page.matchAll(/<h2 id="([^"]+)">/g)].map((m) => m[1]).filter((id) => !["kinds", "common-attributes"].includes(id ?? ""));
		assert.deepEqual([...sections].sort(), [...OUTPUT_KINDS].sort());
		for (const k of OUTPUT_KINDS) assert.ok(page.includes(`href="#${k}"`), `the Kinds table has no row for ${k}`);
	});
});

describe("the Host API reference", () => {
	it("lists every attribute the element observes, and no other", () => {
		const element = readFileSync(join(import.meta.dirname, "../packages/runtime/src/element.ts"), "utf8");
		const observed = JSON.parse(/observedAttributes = (\[[^\]]+\])/.exec(element)?.[1] ?? "[]") as string[];
		const page = html.get("docs-ref-host.html") ?? "";
		const section = page.slice(page.indexOf('id="element-attributes"'), page.indexOf('id="properties-and-methods"'));
		const listed = [...section.matchAll(/<tr><td><code>([\w-]+)<\/code>/g)].map((m) => m[1]);
		assert.deepEqual([...listed].sort(), [...observed].sort());
	});

	it("lists every event the element dispatches", () => {
		// The element dispatches through #emit("tool-…") and the share chunk through new CustomEvent("tool-share").
		const src = (f: string) => readFileSync(join(import.meta.dirname, "../packages/runtime/src", f), "utf8");
		const code = src("element.ts") + src("share.ts");
		const dispatched = [...new Set([...code.matchAll(/(?:#emit\(|new CustomEvent\()"(tool-[\w-]+)"/g)].map((m) => m[1]))].sort();
		assert.ok(dispatched.length > 0, "found no dispatched events to check against");
		const page = html.get("docs-ref-host.html") ?? "";
		const section = page.slice(page.indexOf('id="events"'), page.indexOf('id="sources"'));
		const listed = [...section.matchAll(/<tr><td><code>(tool-[\w-]+)<\/code>/g)].map((m) => m[1]);
		assert.deepEqual([...listed].sort(), dispatched);
	});
});

describe("llms.txt and reference.json", () => {
	it("are built beside the pages, describe the current contract, and hold every input type and result kind", async () => {
		const { INPUT_TYPES, OUTPUT_KINDS, SDK_VERSION } = (await import("../packages/sdk/src/index.ts")) as { INPUT_TYPES: readonly string[]; OUTPUT_KINDS: readonly string[]; SDK_VERSION: number };
		const data = JSON.parse(readFileSync(join(DIST, "reference.json"), "utf8")) as { contract: number; inputs: { types: { type: string }[] }; results: { kinds: { kind: string }[] } };
		assert.equal(data.contract, SDK_VERSION);
		assert.deepEqual(data.inputs.types.map((t) => t.type), [...INPUT_TYPES]);
		assert.deepEqual(data.results.kinds.map((k) => k.kind).sort(), [...OUTPUT_KINDS].sort());
		const text = readFileSync(join(DIST, "llms.txt"), "utf8");
		assert.ok(text.startsWith("# Toolbench\n"));
		for (const k of OUTPUT_KINDS) assert.ok(text.includes(`## ${k}\n`), `llms.txt has no section for ${k}`);
		assert.ok(!text.includes("<!-- site:"), "a site-only marker leaked into llms.txt");
	});
});

describe("figures on the landing page", () => {
	// The page's own words: code samples and drawings removed, since a manifest quoting a tool's own
	// "version": "1.0.0" or an SVG path's coordinates are not figures the page claims.
	const landing = (html.get("index.html") ?? "").replace(/<pre[\s\S]*?<\/pre>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "");

	it("quotes the runtime's size exactly as the README publishes it, and no other size", () => {
		// The same row and pattern scripts/size-check.mjs --update writes. Every "n KB" on the page must be
		// that figure: an allowlist, so a second hand-typed number fails here rather than drifting.
		const published = /\| Runtime[^|]*\| ([\d.]+) KB/.exec(readFileSync(join(ROOT, "README.md"), "utf8"))?.[1];
		assert.ok(published, "README.md has no runtime size row");
		const quoted = [...landing.matchAll(/(\d+(?:\.\d+)?)\s*KB/g)].map((m) => m[1]);
		assert.ok(quoted.length > 0, "the landing page quotes no size");
		assert.deepEqual([...new Set(quoted)], [published]);
	});

	it("quotes the runtime's version from its package.json, and no other version", () => {
		const { version } = JSON.parse(readFileSync(join(ROOT, "packages/runtime/package.json"), "utf8")) as { version: string };
		const quoted = [...landing.matchAll(/\b(\d+\.\d+\.\d+)\b/g)].map((m) => m[1]);
		assert.ok(quoted.length > 0, "the landing page quotes no version");
		assert.deepEqual([...new Set(quoted)], [version]);
	});

	it("shows exactly the stat tiles its sources give, with their values", () => {
		const tiles = [...landing.matchAll(/data-stat="([^"]+)"><span class="stat-value">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]);
		assert.deepEqual(
			tiles,
			stats().map((s) => [s.id, s.value]),
		);
	});

	it("derives the figures the way their owners state them", () => {
		// Read independently of stats.ts where possible, so a parsing slip in one shows in the other.
		const byId = Object.fromEntries(stats().map((s) => [s.id, s.value]));
		assert.equal(byId.contract, `v${/SDK_VERSION = (\d+)/.exec(readFileSync(join(ROOT, "packages/sdk/src/version.ts"), "utf8"))?.[1]}`);
		assert.equal(byId.dependencies, "0");
		// Seven series shapes and five chart kinds of their own, as the SDK's types state them today.
		assert.deepEqual(chartTypes(), ["line", "area", "bar", "points", "step", "band", "box", "heatmap", "pie", "radar", "treemap", "venn"]);
		assert.equal(byId.charts, String(chartTypes().length));
		assert.deepEqual(graphLayouts(), ["layered", "tree", "radial", "force", "manual"]);
		assert.equal(byId.layouts, "5");
	});

	it("names the browsers the suite runs in, and labels them for a screen reader", () => {
		assert.deepEqual(browsers(), ["Chrome", "Firefox", "Safari"]);
		const tile = /data-stat="browsers" aria-label="([^"]+)"/.exec(landing)?.[1];
		assert.equal(tile, "Tested in Chrome, Firefox and Safari");
	});
});

const TYPES: Record<string, string> = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".json": "application/json",
	".txt": "text/plain",
};

describe("the site in a browser", () => {
	let server: Server;
	let browser: Browser;
	let origin = "";

	before(async () => {
		server = createServer((req, res) => {
			const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
			const rel = path.startsWith(BASE) ? path.slice(BASE.length) : null;
			const file = rel === null ? null : join(DIST, rel === "" || rel.endsWith("/") ? `${rel}index.html` : rel);
			if (!file || !file.startsWith(DIST) || !existsSync(file)) {
				res.writeHead(404).end();
				return;
			}
			res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
		});
		// Port 0: the OS picks a free one, so this never collides with a dev server or the bench suite.
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}${BASE}`;
		browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? "chrome" });
	});
	after(async () => {
		await browser?.close();
		server?.close();
	});

	for (const id of toolIds) {
		it(`${id} renders, runs, and draws a result`, async () => {
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on("pageerror", (e) => errors.push(e.message));
			await page.goto(`${origin}gallery.html#tool-${id}`);
			const host = page.locator(`#tool-${id} .card-live tool-host`);
			await host.locator(".tb-run, .tb-output").first().waitFor({ timeout: 10_000 });
			// autoRun tools may have no Run button; everything else is run the way a reader would.
			const run = host.locator(".tb-run");
			if (await run.count()) await run.click();
			await host.locator(".tb-output [data-kind]").first().waitFor({ timeout: 10_000 });
			const kind = await host.locator(".tb-output [data-kind]").first().getAttribute("data-kind");
			assert.notEqual(kind, "error", `${id} returned an error for its own defaults`);
			assert.deepEqual(errors, [], `${id} threw on the page`);
			await page.close();
		});
	}

	it("every gallery example draws, and every chart kind draws or says why not", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));
		await page.goto(`${origin}gallery.html`);
		// Page and embed hosts load as they come near, so walk the page the way a reader would.
		const height = await page.evaluate(() => document.body.scrollHeight);
		for (let y = 0; y < height; y += 700) {
			await page.evaluate((top) => scrollTo(0, top), y);
			await page.waitForTimeout(120);
		}
		await page.waitForFunction(
			() =>
				[...document.querySelectorAll("[id^='chart-'] .card-live tool-host")].every((h) => h.shadowRoot?.querySelector(".tb-output [data-kind], .tb-output svg")),
			undefined,
			{ timeout: 20_000 },
		);
		const blank = await page.evaluate(() =>
			[...document.querySelectorAll(".card-live tool-host")]
				.filter((h) => !h.shadowRoot || h.shadowRoot.childElementCount === 0)
				.map((h) => h.getAttribute("tool")),
		);
		assert.deepEqual(blank, [], "these examples drew nothing");
		assert.deepEqual(errors, []);
		await page.close();
	});

	it("a card's tabs follow the ARIA pattern from the keyboard", async () => {
		const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		await page.goto(`${origin}gallery.html#tool-histogram`);
		const card = page.locator("#tool-histogram");
		const tabs = card.locator("[role=tab]");
		const names = await tabs.allTextContents();
		assert.deepEqual(names, ["Live", "tool.json", "index.ts", "Embed"]);
		await tabs.first().focus();
		await page.keyboard.press("ArrowRight");
		assert.equal(await page.evaluate(() => document.activeElement?.textContent), "tool.json");
		assert.equal(await tabs.nth(1).getAttribute("aria-selected"), "true");
		assert.equal(await tabs.nth(0).getAttribute("tabindex"), "-1");
		assert.equal(await card.locator("#tool-histogram-panel-1").isVisible(), true);
		await page.keyboard.press("End");
		assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Embed");
		await page.keyboard.press("ArrowRight");
		assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Live", "Right from the last tab wraps to the first");
		await page.keyboard.press("Home");
		assert.equal(await tabs.nth(0).getAttribute("aria-selected"), "true");
		await page.close();
	});

	it("a card keeps its size and its tool's state across a tab switch", async () => {
		const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		await page.goto(`${origin}gallery.html#tool-utf8-bytes`);
		const card = page.locator("#tool-utf8-bytes");
		const host = card.locator(".card-live tool-host");
		await host.locator(".tb-textarea").fill("state kept");
		await host.locator(".tb-run").click();
		await host.locator(".tb-output [data-kind]").first().waitFor();
		const before = await card.boundingBox();
		await card.locator("[role=tab]", { hasText: "index.ts" }).click();
		const during = await card.boundingBox();
		assert.equal(during?.height, before?.height, "the card changed height when the tab changed");
		await card.locator("[role=tab]", { hasText: "Live" }).click();
		assert.equal(await host.locator(".tb-textarea").inputValue(), "state kept");
		assert.ok(await host.locator(".tb-output [data-kind]").count(), "the result was lost");
		await page.close();
	});

	/*
	 * A graph wider than its card was drawn past the card's right edge and cut off, with no scrollbar, because
	 * the runtime's frame clips and the graph's container grew to the drawing. Every graph, at a desktop and a
	 * phone width, must fit inside its frame, and the wide ones must offer full size, which scrolls.
	 */
	for (const width of [1440, 390]) {
		it(`every gallery graph fits its card at ${width}px, and a wide one opens at full size and scrolls`, async () => {
			const page = await browser.newPage({ viewport: { width, height: 900 } });
			await page.goto(`${origin}gallery.html#graphs`);
			const cards = page.locator("#graphs article");
			const n = await cards.count();
			assert.ok(n >= 5, `expected the graph families, found ${n} cards`);
			let wide = 0;
			for (let i = 0; i < n; i++) {
				const card = cards.nth(i);
				await card.scrollIntoViewIfNeeded();
				const svg = card.locator("tool-host .tb-graph-plot svg");
				await svg.waitFor();
				const read = () =>
					card.locator("tool-host").evaluate((host) => {
						const root = host.shadowRoot as ShadowRoot;
						const plot = root.querySelector(".tb-graph-plot") as HTMLElement;
						const frame = root.querySelector(".tb") as HTMLElement;
						const pic = plot.querySelector("svg") as SVGSVGElement;
						return { natural: Number(pic.getAttribute("width")), drawn: pic.getBoundingClientRect().width, plot: plot.clientWidth, scroll: plot.scrollWidth, frame: frame.clientWidth, frameScroll: frame.scrollWidth };
					});
				const fit = await read();
				const name = await card.locator("h3").innerText();
				assert.ok(fit.drawn <= fit.plot + 1, `${name}: drawn ${fit.drawn}px in a ${fit.plot}px plot`);
				assert.ok(fit.frameScroll <= fit.frame, `${name}: the frame overflows, ${fit.frameScroll} > ${fit.frame}`);
				// The runtime's own expand and fit toggle, in the tool's shadow root.
				const button = card.locator("tool-host .tb-graph-wide");
				assert.equal(await button.isVisible(), fit.natural > fit.plot + 1, `${name}: the expand toggle should show exactly when the graph is wider than its card`);
				if (fit.natural <= fit.plot + 1) continue;
				wide++;
				await button.click();
				assert.equal(await button.getAttribute("aria-pressed"), "true");
				const full = await read();
				assert.ok(Math.abs(full.drawn - full.natural) <= 1, `${name}: full size drew ${full.drawn}px of ${full.natural}px`);
				assert.ok(full.scroll > full.plot, `${name}: full size should scroll inside the plot`);
				assert.ok(full.frameScroll <= full.frame, `${name}: full size overflows the frame`);
				await button.click();
			}
			assert.ok(wide > 0, "no graph was wider than its card, so the full-size path went untested");
			await page.close();
		});
	}

	it("a code block copies its code without the line numbers, and says so", async () => {
		const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
		const page = await context.newPage();
		await page.goto(`${origin}docs.html`);
		const block = page.locator(".codeblock").first();
		const expected = await block.evaluate((b) => [...b.querySelectorAll(".cl")].map((l) => (l.textContent === " " ? "" : l.textContent)).join("\n"));
		await block.locator("[data-copy-code]").focus();
		await page.keyboard.press("Enter");
		await page.waitForFunction(() => document.getElementById("copy-status")?.textContent);
		assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
		assert.doesNotMatch(expected, /^1/, "the first line number was copied");
		assert.equal(await page.locator("#copy-status").getAttribute("role"), "status");
		await context.close();
	});

	/*
	 * The three sidebars marked "where you are" three ways: a grey fill and white bar on the docs list, an amber bar
	 * on "On this page", and nothing at all in the gallery. Each must mark exactly one link, and mark it the same way.
	 */
	it("every sidebar marks where the reader is, one link, with the same amber bar", async () => {
		const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		const bar = (selector: string) =>
			page.locator(selector).evaluateAll((links) =>
				links.map((a) => {
					// A bar drawn outside the list's scroll box is clipped away, which is how a top-level link lost it.
					let box = a.parentElement;
					while (box && !/auto|scroll|hidden/.test(getComputedStyle(box).overflowX)) box = box.parentElement;
					const clipped = box ? a.getBoundingClientRect().left < box.getBoundingClientRect().left - 0.5 : false;
					return { shadow: getComputedStyle(a).boxShadow, weight: getComputedStyle(a).fontWeight, fill: getComputedStyle(a).backgroundColor, clipped };
				}),
			);
		await page.goto(`${origin}docs-authoring.html`);
		await page.evaluate(() => document.querySelectorAll(".prose h2[id]")[2]?.scrollIntoView());
		await page.waitForTimeout(300);
		const docsNav = await bar(".docs-nav a[aria-current]");
		const toc = await bar(".docs-toc a[aria-current]");
		await page.goto(`${origin}gallery.html`);
		// Cards above load their tools as they come into view and grow, which can push the section back down, so
		// scroll until it stays put rather than once.
		for (let i = 0; i < 10; i++) {
			await page.evaluate(() => document.getElementById("samples")?.scrollIntoView());
			await page.waitForTimeout(300);
			if ((await page.locator(".gallery-nav a[aria-current]").getAttribute("href")) === "#samples") break;
		}
		const gallery = await bar(".gallery-nav a[aria-current]");
		assert.equal(await page.locator(".gallery-nav a[aria-current]").getAttribute("href"), "#samples");
		// And a top-level gallery entry, whose bar the scroll box used to clip.
		await page.evaluate(() => document.getElementById("graphs")?.scrollIntoView());
		await page.waitForTimeout(300);
		const topLevel = await bar(".gallery-nav a[aria-current]");
		for (const [name, marked] of [["docs list", docsNav], ["On this page", toc], ["gallery", gallery], ["a top-level gallery entry", topLevel]] as const) {
			assert.equal(marked.length, 1, `${name}: ${marked.length} links marked`);
			assert.deepEqual(marked[0], toc[0], `${name} marks the current link differently from On this page`);
		}
		await page.close();
	});

	/*
	 * Nothing on a docs page may run past its column unless it sits inside something that scrolls: on a phone
	 * a file path in inline code ran 9px off the architecture page. Every built docs page, at two widths.
	 */
	for (const width of [1440, 390]) {
		it(`no docs page overflows its column at ${width}px`, async () => {
			const page = await browser.newPage({ viewport: { width, height: 900 } });
			const docs = pages.filter((f) => /^docs.*\.html$/.test(f));
			assert.ok(docs.length >= 5, `found ${docs.length} docs pages`);
			for (const name of docs) {
				await page.goto(`${origin}${name}`);
				const bad = await page.evaluate((w) => {
					const out: string[] = [];
					if (document.documentElement.scrollWidth > w + 1) out.push(`the page is ${document.documentElement.scrollWidth}px wide`);
					const scrolls = (el: Element | null) => {
						for (let p = el; p && p !== document.body; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return true;
						return false;
					};
					for (const el of document.querySelectorAll(".prose *")) {
						if (el.closest(".visually-hidden")) continue;
						const cs = getComputedStyle(el);
						if (cs.display === "inline" || el.clientWidth === 0) continue;
						if (el.scrollWidth > el.clientWidth + 1 && !scrolls(el)) out.push(`${el.tagName.toLowerCase()} ${el.clientWidth}/${el.scrollWidth}: ${el.textContent?.slice(0, 60)}`);
					}
					return out.slice(0, 5);
				}, width);
				assert.deepEqual(bad, [], `${name} at ${width}px`);
			}
			await page.close();
		});
	}

	it("'On this page' marks the section in view as the reader scrolls", async () => {
		const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		await page.goto(`${origin}docs-authoring.html`);
		const target = await page.locator(".docs-toc a").nth(5).getAttribute("href");
		await page.evaluate((hash) => document.getElementById(hash?.slice(1) ?? "")?.scrollIntoView(), target);
		await page.waitForTimeout(300);
		assert.equal(await page.locator(".docs-toc a[aria-current]").getAttribute("href"), target);
		await page.close();
	});

	it("the docs draw their diagrams without loading a diagram library", async () => {
		const page = await browser.newPage();
		const scripts: string[] = [];
		page.on("request", (r) => {
			if (r.resourceType() === "script") scripts.push(new URL(r.url()).pathname);
		});
		await page.goto(`${origin}docs-architecture.html`, { waitUntil: "networkidle" });
		assert.ok((await page.locator("figure.diagram svg").count()) >= 8);
		// An allowlist: the page's own entry and the shared chunks the site builds, nothing else.
		for (const s of scripts) assert.match(s, /\/assets\/(?:docs|theme|copy|site-panels)-[\w-]+\.js$/, s);
		await page.close();
	});
});
