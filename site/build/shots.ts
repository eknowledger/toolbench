/**
 * `pnpm site:shots`: photograph the gallery cards the What's new page links to, in light and dark, into the
 * committed folder the build reads (site/public/whats-new/).
 *
 * Run it after adding `shot=<name>` to a changeset, or when a card changes enough that its picture is
 * wrong. It is not part of the build, on purpose: the build needs no browser, and fails, naming this
 * command, when a shot it links to is missing. This builds the site with that check relaxed, serves the
 * build, and takes each shot of the card `gallery=` names, as JPEG at quality 80 and 1x. The pictures are
 * committed: as 2x PNG the first twelve were 3.1 MB, as these 1.2 MB.
 *
 *   pnpm site:shots            every shot
 *   pnpm site:shots reset copy only these
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { SHOTS_DIR, shotItems } from "./whats-new.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const DIST = join(ROOT, "site/dist");
const OUT = join(ROOT, SHOTS_DIR);

/** What a shot needs beyond "the whole card at a desktop width". Keyed by shot name. */
const TWEAKS: Record<string, { width?: number; act?: (card: Locator, page: Page) => Promise<void> }> = {
	// Reset shows only once an input differs from where the tool started.
	reset: {
		act: async (card) => {
			const input = card.locator("tool-host input:not([type=hidden]), tool-host textarea").first();
			await input.fill("7");
			// Without this the picture is of a focus ring as much as of the button.
			await input.blur();
			await card.locator("tool-host .tb-reset").first().waitFor({ state: "visible", timeout: 5_000 });
		},
	},
	// The fix was about phones, so the picture is a phone.
	"chart-phone": { width: 390 },
};

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".png": "image/png" };

const only = new Set(process.argv.slice(2));
const items = shotItems().filter((i) => only.size === 0 || only.has(i.shot ?? ""));
if (only.size && items.length !== only.size) throw new Error(`No shot named ${[...only].filter((n) => !items.some((i) => i.shot === n)).join(", ")} in either CHANGELOG.md`);

execFileSync("pnpm", ["--filter", "@toolbench/site", "build"], { cwd: ROOT, stdio: "inherit", env: { ...process.env, SITE_SHOTS: "pending", SITE_BASE: "/" } });

const server = createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname).slice(1);
	const file = join(DIST, path === "" ? "index.html" : path);
	if (!file.startsWith(DIST) || !existsSync(file)) return void res.writeHead(404).end();
	res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
const origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? "chrome" });
try {
	for (const item of items) {
		const tweak = TWEAKS[item.shot ?? ""] ?? {};
		for (const scheme of ["light", "dark"] as const) {
			const context = await browser.newContext({ viewport: { width: tweak.width ?? 1280, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
			const page = await context.newPage();
			await page.goto(`${origin}gallery.html#${item.gallery}`);
			// The sticky top bar would otherwise sit over the top of a card taller than the window.
			await page.addStyleTag({ content: ".topbar { position: static !important; }" });
			const card = page.locator(`[id="${item.gallery}"]`);
			await card.scrollIntoViewIfNeeded();
			const hosts = card.locator(".card-live tool-host");
			for (let n = 0; n < (await hosts.count()); n++) {
				await hosts.nth(n).scrollIntoViewIfNeeded();
				await hosts.nth(n).locator(".tb-form, .tb-output [data-kind]").first().waitFor({ timeout: 10_000 });
			}
			// A chart is final once it carries data-fitted; a graph once its picture is drawn.
			await page.waitForFunction(
				(id) =>
					[...document.querySelectorAll(`[id="${id}"] .card-live tool-host`)].every((h) => {
						const root = h.shadowRoot;
						if (!root) return false;
						const charts = [...root.querySelectorAll(".tb-out-chart")];
						if (charts.some((c) => !c.hasAttribute("data-fitted"))) return false;
						return !root.querySelector(".tb-graph-plot") || !!root.querySelector(".tb-graph-plot svg");
					}),
				item.gallery,
				{ timeout: 15_000 },
			);
			if (tweak.act) await tweak.act(card, page);
			// Let a hover or a transition the action started settle before the picture.
			await page.mouse.move(0, 0);
			await page.waitForTimeout(400);
			const file = join(OUT, `${item.shot}-${scheme}.jpg`);
			await card.screenshot({ path: file, type: "jpeg", quality: 80, animations: "disabled" });
			console.log(`${item.shot}-${scheme}.jpg  ${item.name} (gallery#${item.gallery})`);
			await context.close();
		}
	}
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${items.length * 2} screenshots in ${SHOTS_DIR}/. Run \`pnpm site:build\` to build with them.`);
