/**
 * The runtime, in a real browser.
 *
 * Everything in `packages/sdk` is provable in Node, and none of `packages/runtime` is: shadow DOM,
 * custom elements, workers, intersection observers and lazy chunks only exist in a browser. So this
 * suite drives the built bench with Playwright, and it is deliberately weighted towards the things a
 * unit test cannot see:
 *
 *  - **the lazy-loading guarantee** — a card must not fetch a tool's code until it is clicked;
 *  - **the failure paths** — a timeout, a crash, bad input, a tool that ignores its abort signal;
 *  - **the accessibility wiring** — labels, error association, the status region;
 *  - **the regression that motivated it** — a throttled progress frame must not land after the final
 *    result and overwrite it. That bug shipped a chart that appeared for one frame and vanished.
 *
 * It runs against `vite preview`, which this file starts and stops itself, so `pnpm test:bench` needs
 * no setup and CI needs no orchestration.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { type Browser, chromium } from "playwright";

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

let server: ChildProcess | undefined;
let browser: Browser;

before(async () => {
	server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
		cwd: import.meta.dirname,
		stdio: "ignore",
		detached: false,
	});
	// Wait for the port rather than sleeping: a fixed delay is either flaky or slow.
	const deadline = Date.now() + 20_000;
	for (;;) {
		try {
			const response = await fetch(`${BASE}/index.html`);
			if (response.ok) break;
		} catch {
			/* not up yet */
		}
		if (Date.now() > deadline) throw new Error("vite preview did not start");
		await new Promise((r) => setTimeout(r, 150));
	}
	browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? "chrome" });
});

after(async () => {
	await browser?.close();
	server?.kill("SIGTERM");
});

describe("card mode — the facade", () => {
	it("ships no tool code until it is clicked, and exactly one chunk when it is", async () => {
		const page = await browser.newPage();
		const scripts: string[] = [];
		page.on("request", (request) => {
			if (request.resourceType() === "script") scripts.push(request.url());
		});
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		await page.waitForSelector("tool-host[tool=percentiles]");

		const isToolChunk = (url: string) => /\/assets\/tool-percentiles-[^/]+\.js$/.test(url);
		assert.equal(
			scripts.filter(isToolChunk).length,
			0,
			`a card fetched its tool's code before being clicked: ${scripts.join(", ")}`,
		);
		// And the card really is a facade: no form until it is activated.
		assert.equal(
			await page.locator("tool-host[tool=percentiles]").first().locator(".tb-form").count(),
			0,
			"an unactivated card should have no form",
		);

		await page.locator("tool-host[tool=percentiles]").first().locator(".tb-facade").click();
		await page.locator("tool-host[tool=percentiles]").first().locator(".tb-form").waitFor();
		assert.equal(scripts.filter(isToolChunk).length, 1, "exactly one tool chunk should arrive on the click");
		await page.close();
	});

	it("loads a worker tool's code into the worker only, never onto the main thread", async () => {
		/*
		 * Vite builds the worker in a separate Rollup pass, so every tool reachable from it is emitted
		 * twice: `tool-<id>` for the main thread and `worker-tool-<id>` for the worker. Before those
		 * names existed the worker's copies were all called `index-*.js`, and the duplication was
		 * invisible — which is the argument for asserting an allowlist rather than a denylist.
		 *
		 * queue-explorer declares thread: "worker", so running it must fetch the worker copy and must
		 * NOT fetch the main-thread copy. Fetching both would mean the code was parsed twice.
		 */
		const page = await browser.newPage();
		const scripts: string[] = [];
		page.on("request", (request) => {
			if (request.resourceType() === "script") scripts.push(request.url());
		});
		await page.goto(`${BASE}/tool.html?id=queue-explorer`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> .tb-run").click();
		await page.waitForFunction(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-chart"), null, {
			timeout: 15_000,
		});

		const loaded = (re: RegExp) => scripts.filter((url) => re.test(url));
		assert.equal(
			loaded(/\/assets\/worker-tool-queue-explorer-[^/]+\.js$/).length,
			1,
			`the worker's copy of the tool should be fetched exactly once: ${scripts.join(", ")}`,
		);
		assert.equal(
			loaded(/\/assets\/tool-queue-explorer-[^/]+\.js$/).length,
			0,
			"the main-thread copy must never be fetched for a worker-mode tool",
		);
		assert.equal(loaded(/\/assets\/index-[^/]+\.js$/).length, 0, "no tool should load under an anonymous chunk name");
		await page.close();
	});

	it("renders a seeded result as static markup, with no JavaScript run at all", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		/*
		 * The seed is inline JSON in the page source — what a server-rendering host emits. It must show
		 * before activation, which is what makes a card useful with scripting off.
		 */
		const seeded = await page.$$eval("tool-host[tool=percentiles]", (hosts) =>
			hosts
				.map((h) => (h as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot.textContent ?? "")
				.filter((text) => text.includes("1200")),
		);
		assert.ok(seeded.length > 0, "the seeded card should show its precomputed result before anything runs");
		await page.close();
	});

	it("does not run on activation — Run is the trigger, and it does something", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		// The unseeded card, so there is nothing on screen to confuse a result with.
		const host = page.locator("tool-host[tool=queue-explorer]").first();
		await host.locator(".tb-facade").click();
		await host.locator(".tb-form").waitFor();

		assert.equal(await host.locator(".tb-output > *").count(), 0, "activation must not run the tool");
		assert.match(String(await host.locator(".tb-status").textContent()), /press Run/);

		await host.locator(".tb-run").click();
		/*
		 * Any result will do — a card renders only the FIRST part of a group, and this tool's first part
		 * is its chart, not its fields. Asserting on a specific renderer here was the test being
		 * specific about the wrong thing.
		 */
		await host.locator(".tb-output > *").first().waitFor({ timeout: 15_000 });
		assert.ok((await host.locator(".tb-output > *").count()) > 0, "Run produces a result");
		await page.close();
	});

	it("marks a result stale when an input changes, and does not re-run by itself", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const host = page.locator("tool-host[tool=percentiles]").first();
		await host.locator(".tb-facade").click();
		await host.locator(".tb-form").waitFor();
		await host.locator(".tb-run").click();
		await host.locator(".tb-out-fields").first().waitFor();
		const first = await host.locator(".tb-output").textContent();

		await host.locator("textarea").fill("1 2 nope");
		await page.waitForTimeout(600); // longer than any debounce would have been
		assert.equal(
			await host.locator(".tb-output").textContent(),
			first,
			"typing must not re-run the tool — the previous result stays until Run is pressed",
		);
		assert.equal(await host.locator(".tb-output[data-stale]").count(), 1, "but it is marked stale");
		assert.match(String(await host.locator(".tb-status").textContent()), /inputs changed/);

		await host.locator(".tb-run").click();
		await host.locator(".tb-out-error").waitFor();
		const errorText = await host.locator(".tb-error-message").textContent();
		assert.match(String(errorText), /"nope" is not a number/);
		assert.ok(!String(errorText).endsWith("…"), "an error must never be abbreviated");
		assert.equal(await host.locator(".tb-output[data-stale]").count(), 0, "and running clears the stale mark");
		await page.close();
	});

	it("truncates a card's fields but never an error", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const host = page.locator("tool-host[tool=percentiles]").first();
		await host.locator(".tb-facade").click();
		await host.locator(".tb-form").waitFor();
		await host.locator(".tb-run").click();
		await host.locator(".tb-more").first().waitFor();
		const fieldCount = await host.locator(".tb-field").count();
		assert.ok(fieldCount <= 4, `a card should show at most cardFields (4), showed ${fieldCount}`);
		await page.close();
	});
});

describe("bytes output — contract version 2", () => {
	it("aligns its columns, marks every range, and names them in a legend", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const host = page.locator('tool-host[tool="utf8-bytes"][mode="page"]');
		await host.scrollIntoViewIfNeeded();
		await host.locator(".tb-run").click();
		await host.locator(".tb-out-bytes").waitFor({ timeout: 15_000 });

		const dump = await page.evaluate(() => {
			const root = document.querySelector('tool-host[tool="utf8-bytes"][mode="page"]')?.shadowRoot;
			const gutters = [...(root?.querySelectorAll(".tb-bytes-ascii") ?? [])];
			return {
				rows: root?.querySelectorAll(".tb-bytes-row").length ?? 0,
				// One <span data-tone> per highlighted byte, in BOTH the hex column and the gutter.
				marked: root?.querySelectorAll(".tb-byte[data-tone]").length ?? 0,
				legend: [...(root?.querySelectorAll(".tb-bytes-legend li") ?? [])].map((li) => li.textContent?.trim()),
				status: root?.querySelector(".tb-status")?.textContent ?? "",
				/*
				 * The columns must line up across rows. Each row was its own grid in the first version,
				 * so a short final row sized its own hex column and pushed its gutter left of the row
				 * above. Comparing the gutters' x positions is the cheapest assertion that catches it.
				 */
				gutterLefts: gutters.map((g) => Math.round(g.getBoundingClientRect().left)),
				// A visible highlight, not the near-white wash the first version used.
				markedBg: root?.querySelector('.tb-bytes-hex .tb-byte[data-tone="normal"]')
					? getComputedStyle(root.querySelector('.tb-bytes-hex .tb-byte[data-tone="normal"]') as Element).backgroundColor
					: "",
			};
		});

		assert.equal(dump.rows, 2, "19 bytes at 16 per row is two rows");
		// 4 multi-byte characters spanning 12 bytes, marked in the hex column and the gutter.
		assert.equal(dump.marked, 24, `expected 12 bytes marked in two columns, got ${dump.marked}`);
		assert.equal(dump.legend.length, 4, "every named range appears in the legend");
		assert.match(String(dump.legend[3]), /U\+1F44B/, "including the four-byte one that wraps rows");
		assert.ok(
			dump.legend.every((entry) => /\d+ bytes? at 0x[0-9a-f]{4}/.test(String(entry))),
			`each legend entry states its size and offset: ${dump.legend.join(" | ")}`,
		);

		assert.equal(new Set(dump.gutterLefts).size, 1, `the ASCII gutters must align across rows, got ${dump.gutterLefts.join(", ")}`);

		assert.notEqual(dump.markedBg, "rgba(0, 0, 0, 0)", "a marked byte must have a visible background");
		assert.match(dump.status, /19 bytes, 4 ranges marked/);
		assert.doesNotMatch(dump.status, /fields marked/, "'fields' means something else in this sentence");
		await page.close();
	});

	it("truncates a long dump on a card but never silently", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator('#cards tool-host[tool="utf8-bytes"]').first();
		await card.locator(".tb-facade").click();
		await card.locator(".tb-form").waitFor();
		// A card renders only the first part of a group, and this tool's first part is its fields.
		await card.locator(".tb-run").click();
		await card.locator(".tb-output > *").first().waitFor({ timeout: 15_000 });
		assert.ok((await card.locator(".tb-output > *").count()) > 0);
		await page.close();
	});
});

describe("page mode", () => {
	it("renders the chart and keeps it — a late progress frame must not overwrite the result", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=queue-explorer`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> .tb-run").click();
		await page.waitForFunction(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-chart"), null, { timeout: 15_000 });
		// Wait well past the last animation frame the run could have queued.
		await page.waitForTimeout(1200);
		const state = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			return {
				chart: Boolean(root?.querySelector(".tb-out-chart svg")),
				dataTable: Boolean(root?.querySelector(".tb-chart-data table")),
				groups: [...(root?.querySelectorAll(".tb-field-group h4") ?? [])].map((h) => h.textContent),
			};
		});
		assert.ok(state.chart, "the chart should still be there after the run settles");
		assert.ok(state.dataTable, "a chart must ship its data as a table for anyone who cannot see it");
		assert.deepEqual(state.groups, ["Formula", "Simulation"], "both halves of the result should render");
		await page.close();
	});

	it("shows every input on a page and only the primary one on a card", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=queue-explorer`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		assert.equal(await page.locator("#host >> .tb-field-row").count(), 4, "page mode shows all four inputs");
		assert.equal(
			await page.locator("#host >> .tb-progress:not([hidden])").count(),
			0,
			"the progress bar stays out of the way until a run is actually slow",
		);

		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator("tool-host[tool=queue-explorer]").first();
		await card.locator(".tb-facade").click();
		await card.locator(".tb-form").waitFor();
		assert.equal(await card.locator(".tb-field-row").count(), 1, "card mode shows only the primary input");
		await page.close();
	});
});

describe("embed mode", () => {
	it("puts two tools in one article, one on the main thread and one in a worker", async () => {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(String(error)));
		await page.goto(`${BASE}/article.html`, { waitUntil: "load" });
		for (const id of ["percentiles", "queue-explorer"]) {
			const embedded = page.locator(`tool-host[tool=${id}]`);
			await embedded.scrollIntoViewIfNeeded();
			await embedded.locator(".tb-run").waitFor();
			await embedded.locator(".tb-run").click();
			await page.waitForFunction(
				(toolId) => document.querySelector(`tool-host[tool=${toolId}]`)?.shadowRoot?.querySelector(".tb-output")?.children.length,
				id,
				{ timeout: 15_000 },
			);
		}
		const both = await page.evaluate(() =>
			[...document.querySelectorAll("tool-host")].map((host) => ({
				id: host.getAttribute("tool"),
				hasOutput: Boolean(host.shadowRoot?.querySelector(".tb-output")?.children.length),
				hasTitle: Boolean(host.shadowRoot?.querySelector(".tb-name")),
			})),
		);
		assert.equal(both.length, 2);
		assert.ok(both.every((t) => t.hasOutput), "both embedded tools should produce a result");
		assert.ok(both.every((t) => !t.hasTitle), "embed mode omits the title — the prose provides the context");
		assert.deepEqual(errors, []);
		await page.close();
	});
});

describe("failure paths", () => {
	it("kills a tool that spins forever and says so", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		// The page-mode one, at the bottom: the two cards above it show the same tool compactly.
		const host = page.locator('tool-host[tool=stress][mode="page"]');
		await host.scrollIntoViewIfNeeded();
		await host.locator(".tb-form").waitFor();
		await host.locator("select").selectOption("spin");
		await host.locator(".tb-run").click();

		await page.waitForFunction(
			() => document.querySelector('tool-host[tool=stress][mode="page"]')?.shadowRoot?.querySelector(".tb-out-error"),
			null,
			{ timeout: 10_000 },
		);
		const message = await host.locator(".tb-error-message").textContent();
		assert.match(String(message), /did not finish within 1500ms/);

		// And the page is still alive — which is the entire argument for worker mode.
		assert.equal(await page.evaluate(() => 1 + 1), 2);

		// A fresh worker must be spawned after a kill: the next run has to work.
		await host.locator("select").selectOption("fine");
		await host.locator(".tb-run").click();
		await page.waitForFunction(
			() => document.querySelector('tool-host[tool=stress][mode="page"]')?.shadowRoot?.textContent?.includes("worked normally"),
			null,
			{ timeout: 10_000 },
		);
		await page.close();
	});

	it("distinguishes a bug in the tool from bad input", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const host = page.locator('tool-host[tool=stress][mode="page"]');
		await host.scrollIntoViewIfNeeded();
		await host.locator(".tb-form").waitFor();

		await host.locator("select").selectOption("throw");
		await host.locator(".tb-run").click();
		await page.waitForFunction(() => document.querySelector('tool-host[tool=stress][mode="page"]')?.shadowRoot?.textContent?.includes("hit a bug"));
		assert.match(String(await host.locator(".tb-error-message").textContent()), /hit a bug.*cannot read properties/s);

		await host.locator("select").selectOption("bad-input");
		await host.locator(".tb-run").click();
		await page.waitForFunction(() => document.querySelector('tool-host[tool=stress][mode="page"]')?.shadowRoot?.textContent?.includes("not something I can work with"));
		const invalid = await page.evaluate(() =>
			document.querySelector('tool-host[tool=stress][mode="page"]')?.shadowRoot?.querySelector('[aria-invalid="true"]')?.id,
		);
		assert.equal(invalid, "in-mode", "an error naming an input should mark that control invalid");
		await page.close();
	});

	it("says something useful when the tool does not exist", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const text = await page.$eval("tool-host[tool=not-a-real-tool]", (host) =>
			(host as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot.textContent,
		);
		assert.match(String(text), /No tool with id "not-a-real-tool"/);
		assert.match(String(text), /percentiles/, "and it should list what does exist");
		await page.close();
	});
});

describe("accessibility wiring", () => {
	it("labels every control, describes it, and announces results in a status region", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=queue-explorer`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		const wiring = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			const controls = [...(root?.querySelectorAll("input, select, textarea") ?? [])] as HTMLInputElement[];
			return {
				count: controls.length,
				labelled: controls.every((c) => Boolean(root?.querySelector(`label[for="${c.id}"]`))),
				described: controls.every((c) => (c.getAttribute("aria-describedby") ?? "").length > 0),
				describedResolves: controls.every((c) =>
					(c.getAttribute("aria-describedby") ?? "").split(" ").every((id) => Boolean(root?.getElementById(id))),
				),
				status: root?.querySelector('[role="status"]')?.getAttribute("aria-live"),
				runButton: root?.querySelector(".tb-run")?.textContent,
				numberInputsBounded: controls
					.filter((c) => c.type === "number")
					.every((c) => c.hasAttribute("min") && c.hasAttribute("max")),
			};
		});
		assert.equal(wiring.count, 4);
		assert.ok(wiring.labelled, "every control needs a real label");
		assert.ok(wiring.described, "every control should point at its description");
		assert.ok(wiring.describedResolves, "aria-describedby must reference ids that exist");
		assert.equal(wiring.status, "polite");
		assert.equal(wiring.runButton, "Run", "there is always an explicit Run button");
		assert.ok(wiring.numberInputsBounded, "a number input carries its bounds — the only guard on a runaway input");
		await page.close();
	});

	it("follows an explicit theme choice, not just the system preference", async () => {
		/*
		 * ⚠️ The case a real host actually has, and the one that is easy to get wrong.
		 *
		 * The runtime's default tokens use light-dark(), which resolves against the used `color-scheme`
		 * and knows nothing about a CSS class. Nearly every site toggles a class: Tailwind's `dark:`,
		 * Fuwari, most themes. A host that toggles the class and stops there gets light tools on a dark
		 * page, and it reads as a framework bug rather than a missing line.
		 *
		 * So this launches with the SYSTEM preference set to light and then chooses dark explicitly. If
		 * the tool only ever followed the OS, this would pass while the real integration failed.
		 */
		const page = await browser.newPage({ colorScheme: "light" });
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const bg = async () =>
			page.evaluate(() => {
				const shell = document.querySelector("#cards tool-host")?.shadowRoot?.querySelector(".tb");
				return shell ? getComputedStyle(shell).backgroundColor : "";
			});

		await page.locator('.theme-switch button[data-mode="light"]').first().click();
		const light = await bg();
		await page.locator('.theme-switch button[data-mode="dark"]').first().click();
		await page.waitForTimeout(150);
		const dark = await bg();

		assert.notEqual(dark, light, "an explicit dark choice must reach inside the shadow root");
		const brightness = (colour: string) =>
			(colour.match(/\d+/g) ?? ["255"]).slice(0, 3).reduce((sum, n) => sum + Number(n), 0);
		assert.ok(brightness(dark) < brightness(light), `dark should be darker: light=${light} dark=${dark}`);

		// And the host's own class is set too, because a host needs one for its own chrome.
		const wiring = await page.evaluate(() => ({
			cls: document.documentElement.classList.contains("dark"),
			scheme: document.documentElement.style.colorScheme,
			controls: document.querySelectorAll(".theme-switch").length,
		}));
		assert.equal(wiring.cls, true, "the class a host styles its own chrome with");
		assert.equal(wiring.scheme, "dark", "and the color-scheme that actually reaches the tools");
		assert.equal(wiring.controls, 1, "install must be idempotent: two entry points call it");
		await page.close();
	});

	it("themes entirely through custom properties set by the host", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const accents = await page.evaluate(() => {
			const read = (host: Element) => getComputedStyle(host).getPropertyValue("--tb-accent").trim();
			const plain = document.querySelector("#cards tool-host");
			const themed = document.querySelector("#themed tool-host");
			return { plain: plain ? read(plain) : "", themed: themed ? read(themed) : "" };
		});
		assert.notEqual(accents.themed, accents.plain, "the themed section should resolve a different accent");
		assert.equal(accents.themed, "#0b6b5f");
		await page.close();
	});
});
