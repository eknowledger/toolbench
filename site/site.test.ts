/**
 * The built site, checked: no broken internal link, and every tool in `tools/` actually running in the
 * gallery. Run after `pnpm site:build`, with `pnpm test:site`.
 *
 * Two layers, because each catches what the other cannot. The link check reads the HTML files and needs
 * no browser, so it can run anywhere. The gallery check opens the pages in Chrome, because a tool that
 * renders in a unit test can still fail to load in a page: a glob the bundler did not follow, a worker
 * built as iife, a chunk with the wrong base.
 *
 * `SITE_BASE` must match the build (`/` by default, `/toolbench/` for Pages). `SITE_PLAYGROUND`, when set
 * to a built bench, also checks the playground link resolves; the Pages workflow sets it after copying
 * the bench into place.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import { after, before, describe, it } from "node:test";
import { type Browser, chromium } from "playwright";
import { families } from "./src/chart-families.ts";

const DIST = join(import.meta.dirname, "dist");
const TOOLS = join(import.meta.dirname, "..", "tools");
const BASE = (process.env.SITE_BASE ?? "/").replace(/\/?$/, "/");
const PLAYGROUND = process.env.SITE_PLAYGROUND;

if (!existsSync(join(DIST, "index.html"))) throw new Error(`No built site at ${DIST}. Run \`pnpm site:build\` first.`);

const pages = readdirSync(DIST).filter((f) => f.endsWith(".html"));
const html = new Map(pages.map((p) => [p, readFileSync(join(DIST, p), "utf8")]));
const ids = (text: string) => new Set([...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const toolIds = readdirSync(TOOLS, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name)
	.sort();

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
				// The bench is built and copied in separately, so it only exists in the assembled deploy.
				if (file === "playground/" || file.startsWith("playground/")) {
					if (raw !== "./playground/") broken.push(`${raw} (the playground is linked as ./playground/ only)`);
					else if (PLAYGROUND && !existsSync(join(PLAYGROUND, "index.html"))) broken.push(`${raw} (no bench at ${PLAYGROUND})`);
					continue;
				}
				if (file.endsWith("/")) file += "index.html";
				const target = join(DIST, file);
				if (!existsSync(target) || !statSync(target).isFile()) {
					broken.push(raw);
					continue;
				}
				if (query) {
					const family = new URLSearchParams(query).get("family");
					if (file !== "charts.html" || !family || !families.some((f) => f.id === family)) broken.push(`${raw} (unknown query)`);
				}
				if (hash && file.endsWith(".html") && !ids(html.get(file) ?? "").has(hash)) broken.push(`${raw} (no element with id "${hash}")`);
			}
			assert.deepEqual(broken, [], `${page} has links that go nowhere`);
		});
	}

	it("the gallery lists exactly the tools in tools/", () => {
		const listed = [...(html.get("gallery.html") ?? "").matchAll(/data-pick="([^"]+)"/g)].map((m) => m[1]).sort();
		assert.deepEqual(listed, toolIds);
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

describe("figures on the landing page", () => {
	// The page's own words: code samples and drawings removed, since a manifest quoting a tool's own
	// "version": "1.0.0" or an SVG path's coordinates are not figures the page claims.
	const landing = (html.get("index.html") ?? "").replace(/<pre[\s\S]*?<\/pre>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
	const root = join(import.meta.dirname, "..");

	it("quotes the runtime's size exactly as the README publishes it, and no other size", () => {
		// The same row and pattern scripts/size-check.mjs --update writes. Every "n KB" on the page must be
		// that figure: an allowlist, so a second hand-typed number fails here rather than drifting.
		const published = /\| Runtime[^|]*\| ([\d.]+) KB/.exec(readFileSync(join(root, "README.md"), "utf8"))?.[1];
		assert.ok(published, "README.md has no runtime size row");
		const quoted = [...landing.matchAll(/(\d+(?:\.\d+)?)\s*KB/g)].map((m) => m[1]);
		assert.ok(quoted.length > 0, "the landing page quotes no size");
		assert.deepEqual([...new Set(quoted)], [published]);
	});

	it("quotes the runtime's version from its package.json, and no other version", () => {
		const { version } = JSON.parse(readFileSync(join(root, "packages/runtime/package.json"), "utf8")) as { version: string };
		const quoted = [...landing.matchAll(/\b(\d+\.\d+\.\d+)\b/g)].map((m) => m[1]);
		assert.ok(quoted.length > 0, "the landing page quotes no version");
		assert.deepEqual([...new Set(quoted)], [version]);
	});
});

describe("the gallery in a browser", () => {
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
			page.on("console", (m) => {
				if (m.type() === "error") errors.push(m.text());
			});
			await page.goto(`${origin}gallery.html#${id}`);
			const host = page.locator(`#${id} tool-host`);
			await host.locator(".tb-run, .tb-output").first().waitFor({ timeout: 10_000 });
			// autoRun tools may have no Run button; everything else is run the way a reader would.
			const run = host.locator(".tb-run");
			if (await run.count()) await run.click();
			await host.locator(".tb-output [data-kind]").first().waitFor({ timeout: 10_000 });
			const kind = await host.locator(".tb-output [data-kind]").first().getAttribute("data-kind");
			assert.notEqual(kind, "error", `${id} returned an error for its own defaults`);
			assert.deepEqual(errors, [], `${id} logged errors`);
			await page.close();
		});
	}

	it("the chart showcase draws every chart of its default family", async () => {
		const page = await browser.newPage();
		await page.goto(`${origin}charts.html`);
		const expected = families.find((f) => f.id === "bars")?.cases.length ?? 0;
		await page.waitForFunction(
			(n) => [...document.querySelectorAll("tool-host")].filter((h) => h.shadowRoot?.querySelector("svg")).length === n,
			expected,
			{ timeout: 15_000 },
		);
		await page.close();
	});
});
