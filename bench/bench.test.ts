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
import { type Browser, type BrowserType, chromium, firefox, type Page, webkit } from "playwright";

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

const ENGINES = { chromium, firefox, webkit } as const;
type EngineName = keyof typeof ENGINES;

/**
 * Which engine the suite launches. CI sets this per matrix leg. Unset still means Chromium, so
 * `pnpm test:bench` locally keeps working, and `CHROME_CHANNEL` still picks system Chrome vs the
 * bundled Chromium.
 */
function requestedEngine(): EngineName {
	/*
	 * ⚠️ Required under CI, defaulted only locally.
	 *
	 * Defaulting everywhere hides the failure that matters: drop `PLAYWRIGHT_BROWSER` from the workflow and
	 * all three legs quietly run Chromium, three green checks report cross-engine coverage that does not
	 * exist, and the assertion below still passes because both the default and the expectation collapse to
	 * the same value. Under CI an unset variable is a configuration bug, so it is loud.
	 */
	const raw = process.env.PLAYWRIGHT_BROWSER?.toLowerCase();
	if (raw === undefined) {
		if (process.env.CI) {
			throw new Error("PLAYWRIGHT_BROWSER is unset under CI. Every leg would run Chromium and report as if it had not.");
		}
		return "chromium";
	}
	if (raw in ENGINES) return raw as EngineName;
	throw new Error(`Unknown PLAYWRIGHT_BROWSER="${process.env.PLAYWRIGHT_BROWSER}". Use chromium, firefox, or webkit.`);
}

async function launchBrowser(): Promise<Browser> {
	const name = requestedEngine();
	const engine: BrowserType = ENGINES[name];
	if (name === "chromium") {
		return engine.launch({ channel: process.env.CHROME_CHANNEL ?? "chrome" });
	}
	return engine.launch();
}

let server: ChildProcess | undefined;
let browser: Browser;
let engineName: EngineName;

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
	engineName = requestedEngine();
	browser = await launchBrowser();
});

after(async () => {
	await browser?.close();
	server?.kill("SIGTERM");
});

describe("the engine under test", () => {
	it("launched the browser PLAYWRIGHT_BROWSER asked for", () => {
		assert.equal(browser.browserType().name(), engineName);
	});
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
		 *
		 * ⚠️ Playwright's page request listener does not classify worker-module imports the same way
		 * on every engine. Measured against this suite: Chromium emits them as `script`, WebKit as
		 * `xhr`, and Firefox emits the worker entry but not the inner `import()`. The worker's own
		 * performance timeline lists the chunk on all three, so that is the observation that holds.
		 */
		const page = await browser.newPage();
		const urls: string[] = [];
		page.on("request", (request) => {
			urls.push(request.url());
		});
		await page.goto(`${BASE}/tool.html?id=queue-explorer`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> .tb-run").click();
		await page.waitForFunction(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-chart"), null, {
			timeout: 15_000,
		});

		const workerUrls: string[] = [];
		for (const worker of page.workers()) {
			workerUrls.push(
				...(await worker.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name))),
			);
		}

		const loaded = (list: string[], re: RegExp) => list.filter((url) => re.test(url));
		const workerTool = /\/assets\/worker-tool-queue-explorer-[^/]+\.js$/;
		assert.equal(
			loaded(workerUrls, workerTool).length,
			1,
			`the worker must import its copy of the tool exactly once: page=[${urls.join(", ")}] worker=[${workerUrls.join(", ")}]`,
		);
		assert.equal(
			loaded(urls, /\/assets\/tool-queue-explorer-[^/]+\.js$/).length,
			0,
			"the main-thread copy must never be fetched for a worker-mode tool",
		);
		assert.equal(loaded(urls, /\/assets\/index-[^/]+\.js$/).length, 0, "no tool should load under an anonymous chunk name");
		await page.close();
	});

	it("renders a seeded result as static markup, with no JavaScript run at all", async () => {
		/*
		 * ⚠️ The seed is COMPUTED at build time by the SDK's seed(), not hand-written. The version this
		 * replaced was hardcoded JSON and was already wrong: it claimed p50 = 24 where the tool computes
		 * 28. Nobody noticed, because a seed is only visible to readers who do not press Run.
		 *
		 * So this asserts the seed agrees with the tool rather than merely existing. Any drift, from a
		 * hardcoded value creeping back or the plugin silently failing, fails here.
		 */
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		// `[tool=percentiles]` as well as `[data-seed]`: a second seeded card arrived and this selector
		// matched both, which is a strict-mode violation rather than a failure of the thing being tested.
		const host = page.locator("tool-host[tool=percentiles][data-seed]");
		await host.scrollIntoViewIfNeeded();

		const raw = await host.locator("script[data-toolbench-seed]").textContent();
		assert.ok(raw, "the build must have injected a seed");
		assert.doesNotMatch(raw, /<\/script/i, "serialiseSeed must not leave a closing script tag in the markup");

		const seedOutput = JSON.parse(raw) as { kind: string; fields: { label: string; value: string }[] };
		assert.equal(seedOutput.kind, "fields", "a card seeds the first part of a group, not the whole thing");
		const p50 = seedOutput.fields.find((f) => f.label === "p50")?.value;

		// The same numbers must be on screen before anything is clicked, and before any form exists.
		const shown = await page.evaluate(() => {
			const card = document.querySelector("tool-host[tool=percentiles][data-seed]");
			return {
				fields: [...(card?.shadowRoot?.querySelectorAll(".tb-field") ?? [])].map((f) => f.textContent?.replace(/\s+/g, " ").trim()),
				hint: card?.shadowRoot?.querySelector(".tb-facade-hint")?.textContent,
				hasForm: Boolean(card?.shadowRoot?.querySelector(".tb-form")),
			};
		});
		assert.ok(shown.fields.some((f) => f?.includes(`p50${p50}`)), `the rendered card must show the seeded p50 (${p50}): ${shown.fields.join(" | ")}`);
		assert.equal(shown.hint, "Try it", "a seeded card invites a try rather than announcing itself as unopened");
		assert.equal(shown.hasForm, false, "and it is still a facade: nothing has loaded");
		await page.close();
	});

	it("keeps the seed usable with JavaScript disabled, which is the whole point", async () => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const raw = await page.locator("tool-host[tool=percentiles][data-seed] script[data-toolbench-seed]").textContent();
		assert.match(String(raw), /"p50"/, "the result must be in the served markup, not produced by script");
		await page.close();
		await context.close();
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

	it("shows every primary input, not just the first", async () => {
		/*
		 * ⚠️ This was `find` rather than `filter` in the runtime, so a manifest marking two inputs primary
		 * got one and nothing said why. A question that needs two numbers cannot be asked with one: a queue
		 * card offering an arrival rate without a service time sizes nothing.
		 */
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator('tool-host[parts="2"]');
		await card.locator(".tb-facade").click();
		await card.locator(".tb-form").waitFor();
		const ids = await card.evaluate((host) =>
			[...(host as HTMLElement).shadowRoot!.querySelectorAll(".tb-form input, .tb-form select")].map((el) => el.id),
		);
		assert.deepEqual(ids, ["in-arrivals", "in-service"], "both primary inputs belong on the card");
		await page.close();
	});

	it("renders as many parts as the host asked for, and says what it left out", async () => {
		/*
		 * A compact group used to render exactly one part. One is too few for a tool whose answer is a number
		 * AND a curve: the number alone hides how steep the curve is, and the curve alone is anonymous lines.
		 */
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator('tool-host[parts="2"]');
		const shape = await card.evaluate((host) => {
			const root = (host as HTMLElement).shadowRoot!;
			return {
				chart: root.querySelectorAll("svg").length,
				fields: root.querySelectorAll(".tb-field").length,
				more: root.querySelector(".tb-more")?.textContent ?? "",
			};
		});
		assert.equal(shape.chart, 1, "the first part, a chart");
		assert.ok(shape.fields > 0, "and the second part, its fields");
		assert.match(shape.more, /more field/, "with an honest count of what did not fit");
		await page.close();
	});

	it("keeps a chart's legend when compact, because two unnamed lines say nothing", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator('tool-host[parts="2"]');
		const legend = await card.evaluate((host) =>
			[...(host as HTMLElement).shadowRoot!.querySelectorAll(".tb-legend li")].map((li) => li.textContent?.trim()),
		);
		assert.equal(legend.length, 2, "one entry per series");
		// The unit belongs in the key, since a compact chart has no axis titles to carry it.
		assert.ok(
			legend.every((entry) => /\(.+\)/.test(entry ?? "")),
			`each entry should name its unit, got ${JSON.stringify(legend)}`,
		);
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
				/*
				 * ⚠️ `.tb-announce`, not `.tb-status`. A result summary is announced rather than displayed: it is
				 * what a screen reader needs and what a sighted reader does not, since it describes something
				 * already on screen. The visible line carries only what a reader can act on.
				 */
				status: root?.querySelector(".tb-announce")?.textContent ?? "",
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

describe("sample inputs — contract version 3", () => {
	/*
	 * A sample row is only visible here. Node can prove the manifest declares samples and that each one
	 * runs, and nothing more: whether a click reaches the controls, whether focus survives it, whether the
	 * row is drawn on a card, and whether the group has an accessible name are all browser facts.
	 *
	 * percentiles declares four samples and does not set autoRun, so a click must fill and stop. histogram
	 * declares four and does set it, so a click there must fill *and* run, and the run's own announcement
	 * must stand instead of the "filled with" one. Both branches of #applySample are covered below.
	 *
	 * ⚠️ This comment previously said no tool on the bench sets autoRun. The json-code fixture always did;
	 * what it lacked was samples, which is what the branch needs. Close enough to true to survive review,
	 * and wrong in the way that matters.
	 */
	it("fills the form on a click and does not run the tool", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-samples");
		const before = await page.locator("#host >> .tb-textarea").inputValue();

		await page.locator('#host >> .tb-sample:text-is("Not a number")').click();
		const after = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			return {
				values: (root?.querySelector(".tb-textarea") as HTMLTextAreaElement | null)?.value ?? "",
				results: root?.querySelector(".tb-output")?.children.length ?? -1,
				status: root?.querySelector(".tb-status")?.textContent ?? "",
			};
		});

		assert.notEqual(after.values, before, "the click must reach the control, not only the values behind it");
		// This is the sample whose input the tool rejects, so the non-numeric token proves which one landed.
		assert.match(after.values, /18ms/, `expected the "Not a number" sample's values, got: ${after.values}`);
		assert.equal(after.results, 0, "a sample fills the form; it must not run the tool");
		assert.match(after.status, /Not a number/, `the status must name the sample that was applied: ${after.status}`);
		assert.match(after.status, /press Run/, "and still say what to do next");
		await page.close();
	});

	it("sets several inputs at once, and leaves the ones a sample does not name alone", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-samples");
		const before = await page.locator("#host >> .tb-textarea").inputValue();

		await page.locator('#host >> .tb-sample:text-is("Definitions disagree")').click();
		const both = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			return {
				values: (root?.querySelector(".tb-textarea") as HTMLTextAreaElement | null)?.value ?? "",
				method: (root?.querySelector(".tb-select") as HTMLSelectElement | null)?.value ?? "",
			};
		});
		assert.notEqual(both.values, before, "the sample sets the measurements");
		assert.equal(both.method, "linear", "and the definition, in the same click");

		/*
		 * "Two clusters" names `values` only. The partial-fill rule says `method` keeps what the reader
		 * left in it, so the linear choice above must survive. A sample that reset every unnamed input to
		 * its default would pass every other assertion here.
		 */
		await page.locator('#host >> .tb-sample:text-is("Two clusters")').click();
		const partial = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			return {
				values: (root?.querySelector(".tb-textarea") as HTMLTextAreaElement | null)?.value ?? "",
				method: (root?.querySelector(".tb-select") as HTMLSelectElement | null)?.value ?? "",
			};
		});
		assert.notEqual(partial.values, both.values, "the second sample replaces the measurements");
		assert.equal(partial.method, "linear", "an input the sample does not name keeps the reader's choice");
		await page.close();
	});

	it("marks an existing result stale rather than leaving it looking current", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-out-fields").first().waitFor({ timeout: 15_000 });
		const drawn = await page.locator("#host >> .tb-output").textContent();

		await page.locator('#host >> .tb-sample:text-is("Definitions agree")').click();
		assert.equal(await page.locator("#host >> .tb-output[data-stale]").count(), 1, "the old result belongs to the old inputs");
		assert.equal(await page.locator("#host >> .tb-run[data-attention]").count(), 1, "and Run is where the reader has to go next");
		assert.equal(
			await page.locator("#host >> .tb-output").textContent(),
			drawn,
			"the previous result stays on screen: clearing it would lose the comparison the sample exists to make",
		);
		await page.close();
	});

	it("styles Run attention as a fill, not a focus ring", async () => {
		/*
		 * data-attention means "press this next". :focus-visible means "the keyboard is here".
		 * They used to share a ring, so after a sample click a keyboard reader could take Run's
		 * halo as focus and press Enter, which would re-fire the pill. The fill is the cue, and
		 * it is paint, so prefers-reduced-motion still sees it. The focus outline is unchanged.
		 */
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> .tb-run").waitFor();

		const readRun = () =>
			page.evaluate(() => {
				const run = document.querySelector("#host")?.shadowRoot?.querySelector(".tb-run");
				if (!run) return null;
				const cs = getComputedStyle(run);
				return {
					attention: run.hasAttribute("data-attention"),
					background: cs.backgroundColor,
					outlineStyle: cs.outlineStyle,
					outlineWidth: cs.outlineWidth,
					outlineOffset: cs.outlineOffset,
					boxShadow: cs.boxShadow,
					/*
					 * Everything else a ring could be drawn with. Read so the assertion below can be an
					 * allowlist of what attention is allowed to change, rather than a list of the two
					 * mechanisms someone happened to think of.
					 */
					borderStyle: cs.borderStyle,
					borderWidth: cs.borderWidth,
					borderColor: cs.borderColor,
					filter: cs.filter,
					textDecorationLine: cs.textDecorationLine,
					focusVisible: run.matches(":focus-visible"),
				};
			});

		const colourDistance = (a: string, b: string) => {
			const rgb = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
			const A = rgb(a);
			const B = rgb(b);
			return Math.hypot((A[0] ?? 0) - (B[0] ?? 0), (A[1] ?? 0) - (B[1] ?? 0), (A[2] ?? 0) - (B[2] ?? 0));
		};

		const wearsRing = (cue: NonNullable<Awaited<ReturnType<typeof readRun>>>) => {
			const outline = cue.outlineStyle !== "none" && Number.parseFloat(cue.outlineWidth) > 0;
			return outline || cue.boxShadow !== "none";
		};

		/*
		 * The allowlist, and the reason it is one. Naming the two mechanisms attention must not use
		 * only catches the two mechanisms somebody thought of: a ring drawn with a border, a
		 * drop-shadow filter or an underline would pass a denylist untouched. So instead, assert that
		 * attention changes the fill and NOTHING else, which fails whatever the next ring is made of.
		 */
		const ringProperties = ["outlineStyle", "outlineWidth", "boxShadow", "borderStyle", "borderWidth", "borderColor", "filter", "textDecorationLine"] as const;
		const assertOnlyTheFillMoved = (
			idle: NonNullable<Awaited<ReturnType<typeof readRun>>>,
			attention: NonNullable<Awaited<ReturnType<typeof readRun>>>,
			label: string,
		) => {
			for (const property of ringProperties) {
				assert.equal(
					attention[property],
					idle[property],
					`${label}: attention changed ${property} (${idle[property]} -> ${attention[property]}). Attention is a fill, and every other property here is a way of drawing a ring.`,
				);
			}
		};

		const assertFillNotRing = (
			idle: NonNullable<Awaited<ReturnType<typeof readRun>>>,
			attention: NonNullable<Awaited<ReturnType<typeof readRun>>>,
			label: string,
		) => {
			assert.equal(attention.attention, true, `${label}: data-attention is set`);
			assert.ok(
				!wearsRing(attention),
				`${label}: attention must not draw a ring (outline=${attention.outlineStyle} ${attention.outlineWidth}, shadow=${attention.boxShadow})`,
			);
			assert.ok(
				colourDistance(idle.background, attention.background) > 20,
				`${label}: attention must be a noticeable fill change (${idle.background} -> ${attention.background})`,
			);
			assertOnlyTheFillMoved(idle, attention, label);
		};

		for (const theme of ["light", "dark"] as const) {
			await page.locator(`.theme-switch button[data-mode="${theme}"]`).click();

			await page.locator("#host >> .tb-run").click();
			await page.locator("#host >> .tb-output > *").first().waitFor({ timeout: 15_000 });
			const idle = await readRun();
			assert.ok(idle, `${theme}: Run exists after a run`);
			assert.equal(idle.attention, false, `${theme}: a fresh result is not asking to be pressed`);

			// Last sample, so the next Tab lands on Run with both states on one button.
			await page.locator('#host >> .tb-sample:text-is("Not a number")').click();
			const attention = await readRun();
			assert.ok(attention, `${theme}: Run exists after the sample`);
			assertFillNotRing(idle, attention, theme);

			await page.keyboard.press("Tab");
			const both = await readRun();
			assert.ok(both, `${theme}: Run exists when focused`);
			assert.equal(both.focusVisible, true, `${theme}: Tab must put :focus-visible on Run`);
			assert.equal(both.attention, true, `${theme}: attention stays on while focused`);
			assert.equal(both.outlineStyle, "solid", `${theme}: :focus-visible is still a solid outline`);
			assert.equal(both.outlineWidth, "2px", `${theme}: :focus-visible width is unchanged`);
			assert.equal(both.outlineOffset, "2px", `${theme}: :focus-visible offset is unchanged`);
			assert.ok(
				colourDistance(idle.background, both.background) > 20,
				`${theme}: the fill remains when the focus ring is also on`,
			);
		}

		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.locator('.theme-switch button[data-mode="light"]').click();
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-output > *").first().waitFor({ timeout: 15_000 });
		const idleReduced = await readRun();
		assert.ok(idleReduced, "reduced-motion: Run exists");
		await page.locator('#host >> .tb-sample:text-is("Two clusters")').click();
		const attentionReduced = await readRun();
		assert.ok(attentionReduced, "reduced-motion: Run exists after the sample");
		assertFillNotRing(idleReduced, attentionReduced, "prefers-reduced-motion");

		await page.close();
	});

	it("names the row from its visible label and works from the keyboard", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-samples");

		const wiring = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			const row = root?.querySelector(".tb-samples");
			const labelId = row?.getAttribute("aria-labelledby") ?? "";
			return {
				role: row?.getAttribute("role"),
				labelId,
				// ⚠️ An aria-labelledby pointing outside the shadow root resolves to nothing, and the group
				// then has no accessible name at all. This repo has shipped that mistake before.
				labelText: labelId ? (root?.getElementById(labelId)?.textContent ?? null) : null,
				pills: [...(row?.querySelectorAll(".tb-sample") ?? [])].map((b) => ({
					tag: b.tagName,
					type: b.getAttribute("type"),
					label: b.textContent,
				})),
			};
		});
		assert.equal(wiring.role, "group", "a set of related controls announces itself as one");
		assert.ok(wiring.labelId, "the group must point at a label");
		assert.equal(wiring.labelText, "Try:", "and that label is the text on screen, not an invisible copy of it");
		assert.equal(wiring.pills.length, 4, "percentiles declares four samples");
		assert.ok(wiring.pills.every((p) => p.tag === "BUTTON"), `each sample must be a real button: ${wiring.pills.map((p) => p.tag).join(", ")}`);
		assert.ok(wiring.pills.every((p) => p.type === "button"), "and not a submit button inside the fieldset");

		// The row sits after the form, so a Tab out of the last control lands on the first pill.
		await page.locator("#host >> .tb-select").focus();
		await page.keyboard.press("Tab");
		const focused = await page.evaluate(() => {
			const active = document.querySelector("#host")?.shadowRoot?.activeElement;
			return { cls: active?.className ?? "", label: active?.textContent ?? "" };
		});
		assert.equal(focused.cls, "tb-sample", `Tab should reach a sample pill, landed on ".${focused.cls}"`);

		const before = await page.locator("#host >> .tb-textarea").inputValue();
		await page.keyboard.press("Enter");
		const afterEnter = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			return {
				values: (root?.querySelector(".tb-textarea") as HTMLTextAreaElement | null)?.value ?? "",
				status: root?.querySelector(".tb-status")?.textContent ?? "",
				focusedLabel: root?.activeElement?.textContent ?? "",
				focusedClass: root?.activeElement?.className ?? "",
			};
		});
		assert.notEqual(afterEnter.values, before, "Enter on a focused pill fills the form, exactly as a click does");
		assert.match(afterEnter.status, new RegExp(String(focused.label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "and names the pill that was pressed");
		/*
		 * The runtime writes control values in place rather than rebuilding the form, specifically so that
		 * the pill you just pressed still has focus. Re-rendering would drop a keyboard reader back to the
		 * top of the document with no idea whether anything happened.
		 */
		assert.equal(afterEnter.focusedClass, "tb-sample", "focus must stay on the pill");
		assert.equal(afterEnter.focusedLabel, focused.label, "and on the same pill");
		await page.close();
	});

	it("draws no row on a card, where there is only room for one input and Run", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator("tool-host[tool=percentiles]").first();
		await card.locator(".tb-facade").click();
		await card.locator(".tb-form").waitFor();
		assert.equal(await card.locator(".tb-samples").count(), 0, "a row of buttons would crowd out the result a card exists to show");
		assert.equal(await card.locator(".tb-sample").count(), 0, "including a stray pill outside the row");
		await page.close();
	});

	it("draws the row in embed mode too", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/article.html`, { waitUntil: "load" });
		// article.html carries two percentiles hosts now; this one is about the plain embed, not the capped one.
		const embedded = page.locator("tool-host[tool=percentiles]:not(#expandable)");
		await embedded.scrollIntoViewIfNeeded();
		await embedded.locator(".tb-samples").waitFor();
		assert.equal(await embedded.locator(".tb-sample").count(), 4, "an embedded tool has the full form, so it has the samples too");
		await page.close();
	});

	/*
	 * The other branch of #applySample. percentiles above proves a sample fills and stops; histogram sets
	 * `autoRun`, so the same click must also produce a result, and the status must be the run's own rather
	 * than the "filled with, press Run" one, which would now be telling the reader to do something already
	 * done.
	 */
	it("runs the tool as well, for a tool that sets autoRun", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=histogram`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-samples");

		/*
		 * ⚠️ `autoRun` fires from #inputChanged only, never on load, so there is no result on the page yet.
		 * Asserting that first is what stops "a result exists afterwards" from being true either way.
		 */
		const before = await page.locator("#host >> .tb-textarea").inputValue();
		assert.equal(
			await page.evaluate(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-output")?.children.length ?? -1),
			0,
			"autoRun means as the reader types, not on arrival: a fresh page must show no result",
		);

		await page.locator('#host >> .tb-sample:text-is("One spike")').click();
		await page.waitForSelector("#host >> .tb-out-chart", { timeout: 10_000 });
		const after = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			return {
				values: (root?.querySelector(".tb-textarea") as HTMLTextAreaElement | null)?.value ?? "",
				results: root?.querySelector(".tb-output")?.children.length ?? -1,
				status: root?.querySelector(".tb-status")?.textContent ?? "",
			};
		});

		assert.notEqual(after.values, before, "the click must reach the control");
		assert.ok(after.results > 0, "an autoRun tool must draw a result from the click, not wait for Run");
		assert.doesNotMatch(after.status, /press Run/, `the run already happened, so the status must not ask for it: ${after.status}`);
		await page.close();
	});
});

describe("host values and run — runtime API", () => {
	/*
	 * A host example button cannot reach the form: it lives in the shadow root. `values` and `run()`
	 * are the primitive that makes those buttons possible without every tool reimplementing examples
	 * as a select. Node can prove coerce and the partial merge. Whether a write reaches the controls,
	 * whether it runs the tool, whether a still-closed card accepts it, and whether `run()` after it
	 * produces a result are browser facts.
	 */
	type HostApi = HTMLElement & {
		values: Record<string, string | number | boolean>;
		run: (options?: { focus?: boolean }) => Promise<void>;
	};

	/*
	 * Focus follows the person who acted. A reader pressing Run is asking to be taken to the answer; a page
	 * calling run() on load is not, and moving focus there drops the reader out of whatever they were doing.
	 * Asserted in both directions, because the default is the one a host gets by accident.
	 */
	it("leaves focus alone when the host runs it, and moves it only when asked", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");

		const quiet = await page.locator("#host").evaluate(async (el) => {
			const host = el as HostApi;
			const root = host.shadowRoot as ShadowRoot;
			(root.querySelector(".tb-textarea") as HTMLTextAreaElement).focus();
			const before = root.activeElement?.className ?? "";
			await host.run();
			return { before, after: root.activeElement?.className ?? "", drawn: (root.querySelector(".tb-output")?.children.length ?? 0) > 0 };
		});
		assert.ok(quiet.drawn, "the host's run must still produce a result");
		assert.equal(quiet.after, quiet.before, `run() must not move focus: ${quiet.before} -> ${quiet.after}`);

		const asked = await page.locator("#host").evaluate(async (el) => {
			const host = el as HostApi;
			const root = host.shadowRoot as ShadowRoot;
			(root.querySelector(".tb-textarea") as HTMLTextAreaElement).focus();
			await host.run({ focus: true });
			return root.activeElement?.className ?? "";
		});
		assert.match(asked, /tb-output/, "run({ focus: true }) is how a host opts into being taken to the result");
		await page.close();
	});

	it("applies a partial set and does not run the tool", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		const before = await page.locator("#host >> .tb-textarea").inputValue();

		const after = await page.locator("#host").evaluate((el) => {
			const host = el as HostApi;
			host.values = { method: "linear" };
			const root = host.shadowRoot;
			return {
				values: (root?.querySelector(".tb-textarea") as HTMLTextAreaElement | null)?.value ?? "",
				method: (root?.querySelector(".tb-select") as HTMLSelectElement | null)?.value ?? "",
				results: root?.querySelector(".tb-output")?.children.length ?? -1,
				snapshot: { ...host.values },
			};
		});

		assert.equal(after.values, before, "an input the host did not name keeps its current value");
		assert.equal(after.method, "linear", "the named input is written into the live control");
		assert.equal(after.results, 0, "setting values must not run the tool");
		assert.equal(after.snapshot.method, "linear", "the getter returns the applied value");
		assert.equal(after.snapshot.values, before, "and the input the host left alone");
		await page.close();
	});

	it("clamps and refuses the way typing does", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=queue-explorer`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");

		const clamped = await page.locator("#host").evaluate((el) => {
			const host = el as HostApi;
			host.values = { arrivals: 99999, service: -10, samples: 50, seed: 42 };
			const root = host.shadowRoot;
			const numberAt = (id: string) => Number((root?.querySelector(`#${id}`) as HTMLInputElement | null)?.value);
			return {
				arrivals: numberAt("in-arrivals"),
				service: numberAt("in-service"),
				samples: numberAt("in-samples"),
				seed: numberAt("in-seed"),
				fromGetter: host.values,
			};
		});

		assert.equal(clamped.arrivals, 5000, "a number above max clamps, it is not trusted");
		assert.equal(clamped.service, 0.1, "a number below min clamps");
		assert.equal(clamped.samples, 1000, "same for a different input's min");
		assert.equal(clamped.seed, 42, "an in-range value is kept");
		assert.equal(clamped.fromGetter.arrivals, 5000, "the getter sees the clamped value, not the raw one");
		await page.close();
	});

	it("refuses an invalid select and truncates text to maxLength", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");

		const select = await page.locator("#host").evaluate((el) => {
			const host = el as HostApi;
			host.values = { method: "bogus" };
			return (host.shadowRoot?.querySelector(".tb-select") as HTMLSelectElement | null)?.value ?? "";
		});
		assert.equal(select, "nearest", "an option the tool does not declare falls back to the default");

		await page.goto(`${BASE}/tool.html?id=utf8-bytes`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		const truncated = await page.locator("#host").evaluate((el) => {
			const host = el as HostApi;
			host.values = { text: "x".repeat(600) };
			return ((host.shadowRoot?.querySelector(".tb-textarea") as HTMLTextAreaElement | null)?.value ?? "").length;
		});
		assert.equal(truncated, 512, "a string longer than maxLength is cut, the same limit typing hits");
		await page.close();
	});

	it("marks an existing result stale and leaves it on screen", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-out-fields").first().waitFor({ timeout: 15_000 });
		const drawn = await page.locator("#host >> .tb-output").textContent();

		await page.locator("#host").evaluate((el) => {
			(el as HostApi).values = { values: "1 2 3 4 5" };
		});
		await page.waitForTimeout(400);

		assert.equal(await page.locator("#host >> .tb-output[data-stale]").count(), 1, "the old result belongs to the old inputs");
		assert.equal(await page.locator("#host >> .tb-run[data-attention]").count(), 1, "and Run is where the reader has to go next");
		assert.equal(
			await page.locator("#host >> .tb-output").textContent(),
			drawn,
			"setting values must not re-run: the previous result stays until the host calls run()",
		);
		assert.match(String(await page.locator("#host >> .tb-status").textContent()), /inputs changed/);
		await page.close();
	});

	it("prefills a card before anyone opens it", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator("tool-host[tool=percentiles][data-seed]");
		await card.waitFor();

		const before = await card.evaluate((el) => {
			const host = el as HostApi;
			host.values = { values: "1 2 3 4 5", method: "linear" };
			return {
				hasForm: Boolean(host.shadowRoot?.querySelector(".tb-form")),
				snapshot: { ...host.values },
			};
		});
		assert.equal(before.hasForm, false, "the card is still a facade");
		assert.equal(before.snapshot.values, "1 2 3 4 5", "the getter already reflects the prefill");

		await card.locator(".tb-facade").click();
		await card.locator(".tb-form").waitFor();

		const after = await card.evaluate((el) => {
			const host = el as HostApi;
			const root = host.shadowRoot;
			return {
				values: (root?.querySelector(".tb-textarea") as HTMLTextAreaElement | null)?.value ?? "",
				method: host.values.method,
				hasSelect: Boolean(root?.querySelector(".tb-select")),
				stale: Boolean(root?.querySelector(".tb-output[data-stale]")),
				status: root?.querySelector(".tb-status")?.textContent ?? "",
			};
		});
		assert.equal(after.values, "1 2 3 4 5", "the form opens already filled");
		assert.equal(after.hasSelect, false, "a card does not render the non-primary select");
		assert.equal(after.method, "linear", "the prefill still lands on the hidden input, which is what Run will use");
		assert.equal(after.stale, true, "the seeded default result is stale: it is not this form's answer");
		assert.match(after.status, /inputs changed/);
		await page.close();
	});

	it("runs when the host calls run() after setting values, including on a closed card", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator("tool-host[tool=utf8-bytes]").first();
		await card.waitFor();

		await card.evaluate(async (el) => {
			const host = el as HostApi;
			host.values = { text: "abc" };
			await host.run();
		});
		await card.locator(".tb-output > *").first().waitFor({ timeout: 15_000 });

		const result = await card.evaluate((el) => {
			const root = (el as HTMLElement).shadowRoot;
			return {
				text: (root?.querySelector(".tb-textarea") as HTMLTextAreaElement | null)?.value ?? "",
				stale: Boolean(root?.querySelector(".tb-output[data-stale]")),
				fields: [...(root?.querySelectorAll(".tb-field") ?? [])].map((f) => f.textContent?.replace(/\s+/g, " ").trim()),
			};
		});
		assert.equal(result.text, "abc", "run() used the prefilled values, not the defaults");
		assert.equal(result.stale, false, "a completed run is current");
		assert.ok(
			result.fields.some((f) => f?.includes("3")),
			`the result should be for "abc" (3 bytes), got: ${result.fields.join(" | ")}`,
		);
		await page.close();
	});

	it("still works on a tool that ships no samples", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=utf8-bytes`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		assert.equal(await page.locator("#host >> .tb-samples").count(), 0, "utf8-bytes is the plain path: no sample row");

		await page.locator("#host").evaluate(async (el) => {
			const host = el as HostApi;
			host.values = { text: "A" };
			await host.run();
		});
		await page.locator("#host >> .tb-output > *").first().waitFor({ timeout: 15_000 });
		const text = await page.locator("#host >> .tb-textarea").inputValue();
		assert.equal(text, "A");
		assert.ok((await page.locator("#host >> .tb-output > *").count()) > 0, "run() after values still produces a result");
		await page.close();
	});
});

describe("a repaint keeps what was on screen", () => {
	/*
	 * `#paint` rebuilds the shadow tree, and `mode` and `parts` are both in `observedAttributes`, so a
	 * host is invited to set them from page context. Doing that after a run used to empty the output.
	 *
	 * ⚠️ The seeded case was the worse one, and it is why this is a defect rather than a rough edge.
	 * `#paint` ends by drawing the seed, so a seeded host did not go blank: it silently reverted to the
	 * defaults' result while the reader's own inputs sat in the form above it, with nothing saying the
	 * two no longer matched. Blank is recoverable by pressing Run. Plausible and wrong is not.
	 *
	 * Browser-only. The bug is in the interaction between attribute changes, a rebuilt shadow tree and
	 * the seed, and none of those exist in Node.
	 */
	type HostApi = HTMLElement & { values: Record<string, string | number | boolean>; run: () => Promise<void> };

	/** What the reader can actually see, as text, so a comparison does not depend on element identity. */
	const shown = (page: Page) =>
		page.locator("#host").evaluate((el) => {
			const output = (el as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot.querySelector(".tb-output");
			return {
				fields: output?.querySelectorAll(".tb-field").length ?? 0,
				text: (output?.textContent ?? "").replace(/\s+/g, " ").trim(),
				stale: output?.hasAttribute("data-stale") ?? false,
			};
		});

	it("redraws the result after an observed attribute changes, rather than emptying it", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-output > *").first().waitFor({ timeout: 15_000 });

		const before = await shown(page);
		assert.ok(before.fields > 0, `expected a result to compare against, got: ${JSON.stringify(before)}`);

		/*
		 * ⚠️ `more`, not `parts`. This test used `parts="2"`, which was a no-op outside card mode when it was
		 * written and is not any more: the cap works in every mode now, so setting it legitimately truncates
		 * a page-mode result and the output is SUPPOSED to change. `more="link"` is the default, so setting
		 * it explicitly triggers `attributeChangedCallback` and a full repaint while changing nothing that
		 * is drawn, which is exactly the event this test is about.
		 */
		await page.evaluate(() => document.querySelector("#host")?.setAttribute("more", "link"));
		const after = await shown(page);

		assert.equal(after.text, before.text, "the reader's result must survive a repaint unchanged");
		assert.equal(after.fields, before.fields, "and with the same fields");
		await page.close();
	});

	it("redraws an error, not just a result", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		// A refusal this tool documents: grouped thousands are ambiguous, so it declines rather than guessing.
		await page.locator("#host >> .tb-textarea").fill("1,204 2,000");
		await page.locator("#host >> .tb-run").click();
		await page.waitForSelector("#host >> .tb-out-error");

		const before = await page.locator("#host >> .tb-error-message").textContent();
		await page.evaluate(() => document.querySelector("#host")?.setAttribute("more", "link"));
		await page.waitForSelector("#host >> .tb-out-error");
		assert.equal(await page.locator("#host >> .tb-error-message").textContent(), before, "an error is also what was on screen");
		await page.close();
	});

	/*
	 * ⚠️ Two things about this test took a failed CI run each, and both are about picking the right host.
	 *
	 * It has to be an ACTIVATED card. A closed card renders its seed straight into `.tb-body` inside the
	 * facade button and never calls `#draw`, so it cannot exercise this path and has no `.tb-output` to
	 * read. The seed reaches `#draw` only once the card is open: the one state where "has never run" and
	 * "has an output area" are both true, which is exactly the fallback being asserted.
	 *
	 * And it has to be the SEEDED card. `tool-host[tool=percentiles]` matches several hosts on this page,
	 * because `gallery.ts` appends one per live example into `#cards` and `#themed`, both of which sit
	 * above the hand-written seeded card in the markup. `.first()` therefore picked a card with no seed,
	 * which activates perfectly happily and draws nothing, so the failure looked like the fix not working.
	 * `[data-seed]` is the attribute the page uses to ask for one, so it is the honest selector.
	 */
	it("still falls back to the seed for an activated host that has never run", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator("tool-host[tool=percentiles][data-seed]");
		await card.scrollIntoViewIfNeeded();
		await card.locator(".tb-facade").click();
		await card.locator(".tb-form").waitFor();
		await card.locator(".tb-output .tb-value").first().waitFor();

		const before = await card.locator(".tb-output .tb-value").first().textContent();
		const status = await card.locator(".tb-status").textContent();
		assert.match(String(status), /default result/, "this must be the seed, not something that was run");

		await page.evaluate(() => document.querySelector("tool-host[tool=percentiles][data-seed]")?.setAttribute("parts", "2"));
		/*
		 * This card's seed is a `fields` output, not a group, so `parts` changes nothing a reader can see:
		 * the whole event is a repaint. That is the point. Before this change the repaint emptied it.
		 */
		await card.locator(".tb-output .tb-value").first().waitFor();
		assert.equal(await card.locator(".tb-output .tb-value").first().textContent(), before, "the seed must still be there");
		assert.match(String(await card.locator(".tb-status").textContent()), /default result/, "and still be described as the seed");
		await page.close();
	});

	it("does not mark a real result stale just because an attribute changed", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		/*
		 * Via the host API, so `#hostWroteValues` is set. That flag is what asks `#paint` to mark the seed
		 * stale, and before this change it fired on every later repaint too, dimming an answer that was
		 * still correct for the inputs on screen.
		 */
		await page.locator("#host").evaluate(async (el) => {
			const host = el as HostApi;
			host.values = { values: "1 2 3 4 5 6 7 8 9 10" };
			await host.run();
		});
		await page.locator("#host >> .tb-output > *").first().waitFor({ timeout: 15_000 });

		await page.evaluate(() => document.querySelector("#host")?.setAttribute("parts", "2"));
		assert.equal((await shown(page)).stale, false, "the form and the result still agree, so nothing should be marked stale");
		await page.close();
	});
});

describe("expanding a truncated result in place", () => {
	/*
	 * The surface is prose: `article.html` carries a third host, `parts="1" more="expand"`, next to the
	 * uncapped one so the difference is visible on the page rather than only in a test.
	 *
	 * All of this is browser-only. Node can prove the renderer emits a button; whether pressing it reveals
	 * the parts, whether focus survives, and above all whether the tool runs a second time are facts about
	 * a live document.
	 */
	const host = (page: Page) => page.locator("tool-host#expandable");

	/** Runs it once and waits for the capped result. */
	async function runIt(page: Page) {
		await page.goto(`${BASE}/article.html`, { waitUntil: "load" });
		const h = host(page);
		await h.scrollIntoViewIfNeeded();
		await h.locator(".tb-form").waitFor();
		await h.locator(".tb-run").click();
		await h.locator(".tb-disclose").waitFor({ timeout: 15_000 });
		return h;
	}

	it("caps a group in embed mode and offers a button, not a line pointing elsewhere", async () => {
		const page = await browser.newPage();
		const h = await runIt(page);

		// percentiles returns a group of three, so one shown and two hidden.
		assert.equal(await h.locator(".tb-disclose").textContent(), "Show 2 more results");
		assert.equal(await h.locator(".tb-disclose").getAttribute("aria-expanded"), "false");
		assert.equal(await h.locator(".tb-rest").count(), 1, "the hidden parts must already be in the DOM");
		assert.equal(await h.locator(".tb-rest").isVisible(), false, "and hidden");
		// The wording that was wrong for prose must be gone, not merely supplemented.
		assert.equal(await h.locator(".tb-more").count(), 0, "no static notice when the host asked for a control");
		assert.doesNotMatch((await h.locator(".tb-output").textContent()) ?? "", /on the full tool/);
		await page.close();
	});

	it("reveals exactly the hidden parts, and collapses again", async () => {
		const page = await browser.newPage();
		const h = await runIt(page);
		const partsWhenOpen = await page.evaluate(
			() => document.querySelector("tool-host#expandable")?.shadowRoot?.querySelectorAll(".tb-rest > *").length ?? -1,
		);
		assert.equal(partsWhenOpen, 2, "two parts were hidden, so two must be revealed");

		await h.locator(".tb-disclose").click();
		assert.equal(await h.locator(".tb-rest").isVisible(), true);
		assert.equal(await h.locator(".tb-disclose").getAttribute("aria-expanded"), "true");
		assert.equal(await h.locator(".tb-disclose").textContent(), "Hide 2 results", "the label has to say what it will do next");

		await h.locator(".tb-disclose").click();
		assert.equal(await h.locator(".tb-rest").isVisible(), false, "two-way: the reader can have their paragraph back");
		assert.equal(await h.locator(".tb-disclose").textContent(), "Show 2 more results");
		await page.close();
	});

	it("keeps focus on the button across the toggle", async () => {
		const page = await browser.newPage();
		const h = await runIt(page);
		await h.locator(".tb-disclose").focus();
		await page.keyboard.press("Enter");
		assert.equal(await h.locator(".tb-rest").isVisible(), true, "keyboard operable, because it is a real button");
		/*
		 * Focus is inside a shadow root, so document.activeElement is the host. Asking the root for its own
		 * activeElement is the only way to see which control actually holds it.
		 */
		const focused = await page.evaluate(
			() => document.querySelector("tool-host#expandable")?.shadowRoot?.activeElement?.className ?? "",
		);
		assert.match(focused, /tb-disclose/, "focus must not fall back to the root, or the reader loses their place");
		await page.close();
	});

	it("expands without running the tool again", async () => {
		const page = await browser.newPage();
		/*
		 * ⚠️ This is the assertion the whole design rests on, so it is measured rather than reasoned about.
		 * percentiles runs on the main thread, so there is no request to count: the tool's chunk is fetched
		 * once and `run` is called in-page. Counting calls means patching the module, which the bench cannot
		 * reach. What it can do is watch for the work: a re-run repaints the output, so the element identity
		 * of the first part changes. A pure reveal leaves it untouched.
		 */
		const h = await runIt(page);
		await page.evaluate(() => {
			const root = document.querySelector("tool-host#expandable")?.shadowRoot;
			const first = root?.querySelector(".tb-group > *");
			if (first) (first as HTMLElement & { dataset: DOMStringMap }).dataset.witness = "1";
		});

		await h.locator(".tb-disclose").click();
		const survived = await page.evaluate(
			() => (document.querySelector("tool-host#expandable")?.shadowRoot?.querySelector(".tb-group > *") as HTMLElement | null)?.dataset.witness ?? null,
		);
		assert.equal(survived, "1", "the already-drawn part must be the same element: a re-render would have replaced it");
		await page.close();
	});

	it("stays expanded across a re-run", async () => {
		const page = await browser.newPage();
		const h = await runIt(page);
		await h.locator(".tb-disclose").click();
		assert.equal(await h.locator(".tb-rest").isVisible(), true);

		await h.locator(".tb-textarea").fill("1 2 3 4 5 6 7 8 9 10");
		await h.locator(".tb-run").click();
		await h.locator(".tb-disclose").waitFor({ timeout: 15_000 });
		assert.equal(await h.locator(".tb-rest").isVisible(), true, "the reader asked for the whole answer, not for one answer");
		assert.equal(await h.locator(".tb-disclose").getAttribute("aria-expanded"), "true");
		await page.close();
	});

	it("offers no control when nothing is hidden", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/article.html`, { waitUntil: "load" });
		const h = host(page);
		await h.scrollIntoViewIfNeeded();
		await h.locator(".tb-form").waitFor();
		// Three parts and a cap of three: an empty disclosure is worse than no disclosure.
		await page.evaluate(() => document.querySelector("tool-host#expandable")?.setAttribute("parts", "3"));
		await h.locator(".tb-run").click();
		await h.locator(".tb-output > *").first().waitFor({ timeout: 15_000 });
		assert.equal(await h.locator(".tb-disclose").count(), 0, "nothing hidden, so nothing to press");
		assert.equal(await h.locator(".tb-more").count(), 0);
		await page.close();
	});

	it("leaves an embedded tool with no parts attribute showing everything", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/article.html`, { waitUntil: "load" });
		/*
		 * Backward compatibility, asserted on the host that was already on this page. Making the cap work
		 * outside card mode must not start truncating embeds that never asked for it, which is the one way
		 * this change could reach an existing consumer.
		 */
		const plain = page.locator("tool-host[tool=percentiles]:not(#expandable)").first();
		await plain.scrollIntoViewIfNeeded();
		await plain.locator(".tb-form").waitFor();
		await plain.locator(".tb-run").click();
		await plain.locator(".tb-group > *").first().waitFor({ timeout: 15_000 });
		assert.equal(await plain.locator(".tb-group > *").count(), 3, "an uncapped embed still shows every part");
		assert.equal(await plain.locator(".tb-disclose").count(), 0);
		assert.equal(await plain.locator(".tb-more").count(), 0);
		await page.close();
	});
});

describe("the chart renderer is its own chunk", () => {
	/*
	 * The saving is only real if the chunk stays unfetched for pages that never draw a chart, and the
	 * feature only works if it is fetched before one is drawn. Both halves are browser facts: a Node test
	 * cannot see a network request, and the whole point of the split is what does not arrive.
	 */
	const chartChunk = /\/assets\/chart-[^/]+\.js$/;

	it("is not fetched by a tool that draws no chart", async () => {
		const page = await browser.newPage();
		const scripts: string[] = [];
		page.on("request", (request) => {
			if (request.resourceType() === "script") scripts.push(request.url());
		});
		// percentiles returns fields and a table. Its manifest does not list `series`, so nothing should
		// pull the chart renderer in, before or after a run.
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-out-fields").first().waitFor({ timeout: 15_000 });

		assert.deepEqual(
			scripts.filter((url) => chartChunk.test(url)),
			[],
			"a page with no chart must not download the chart renderer",
		);
		await page.close();
	});

	it("is fetched before a chart tool paints, so the draw stays synchronous", async () => {
		const page = await browser.newPage();
		const scripts: string[] = [];
		page.on("request", (request) => {
			if (request.resourceType() === "script") scripts.push(request.url());
		});
		await page.goto(`${BASE}/tool.html?id=queue-explorer`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");

		// Fetched on preparation, before anything is run: the manifest declares `series`, and `#prepare`
		// awaits the chunk so `render` never has to be asynchronous.
		assert.equal(
			scripts.filter((url) => chartChunk.test(url)).length,
			1,
			`the chart chunk should arrive once, before the first run: ${scripts.join(", ")}`,
		);

		await page.locator("#host >> .tb-run").click();
		await page.waitForFunction(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-chart svg"), null, {
			timeout: 15_000,
		});
		assert.equal(
			scripts.filter((url) => chartChunk.test(url)).length,
			1,
			"and exactly once: the module is cached, not re-imported per draw",
		);
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

	it("shows every input on a page and only the primary ones on a card", async () => {
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
		/*
		 * Two, not one. This asserted 1 until the runtime started honouring every `primary` input rather than
		 * the first, which is what lets a card ask a question that needs two numbers.
		 */
		assert.equal(await card.locator(".tb-field-row").count(), 2, "card mode shows the primary inputs only");
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
			// `:not(#expandable)` because the capped demo host is also a percentiles embed on this page.
			const embedded = page.locator(`tool-host[tool=${id}]:not(#expandable)`);
			await embedded.scrollIntoViewIfNeeded();
			await embedded.locator(".tb-run").waitFor();
			await embedded.locator(".tb-run").click();
			await page.waitForFunction(
				(toolId) => document.querySelector(`tool-host[tool=${toolId}]:not(#expandable)`)?.shadowRoot?.querySelector(".tb-output")?.children.length,
				id,
				{ timeout: 15_000 },
			);
		}
		// Still exactly these two: the parts/more demo is a third host on this page and has its own tests.
		const both = await page.evaluate(() =>
			[...document.querySelectorAll("tool-host:not(#expandable)")].map((host) => ({
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
		await page.goto(`${BASE}/failure.html`, { waitUntil: "load" });
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
		await page.goto(`${BASE}/failure.html`, { waitUntil: "load" });
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

	/*
	 * The reason regex-explainer is a worker at all, asserted against the shape its own guard does not
	 * catch. `(a|aa)+$` nests no repeat, so the nested-repeat refusal in the walk passes it through to the
	 * engine, and against 45 characters it takes 28 s in Node. The manifest allows 2 s.
	 *
	 * ⚠️ This test first asserted the timeout message, and it was engine-specific. Measured in CI:
	 * Chromium and Firefox grind and hit the 2 s timeout; **WebKit returns quickly**, because
	 * JavaScriptCore gives up on a runaway backtrack instead of running it out. No error ever appeared
	 * there, and it was not a race: the 2 s timer lives on the main thread and fires whatever the worker
	 * is doing, so if it had not fired the match had already finished.
	 *
	 * That difference is an argument for this change rather than a complication of it. One engine in
	 * three declines to hang, which is exactly the sort of thing a tool must not depend on. So the
	 * assertion is the property that holds on all three: the reader gets an answer or a timeout, quickly,
	 * and the page keeps answering throughout. The timeout bound is still checked, but only on the
	 * engines that reach it.
	 */
	it("either answers or times out on a catastrophic regex, and never freezes the page", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=regex-explainer`, { waitUntil: "load" });
		const host = page.locator("#host");
		await host.scrollIntoViewIfNeeded();
		await host.locator(".tb-form").waitFor();

		// A text input is `.tb-input`; the pattern is the only one here, since subject is a textarea.
		await host.locator(".tb-input").fill("(a|aa)+$");
		await host.locator(".tb-textarea").fill(`${"a".repeat(45)}b`);
		await host.locator(".tb-run").click();

		/*
		 * 8 s against a 2 s timeout: long enough that a slow runner is not called a hang, short enough
		 * that an actual hang still fails here rather than waiting for the suite's own limit.
		 */
		await page.waitForFunction(
			() => (document.querySelector("#host")?.shadowRoot?.querySelector(".tb-output")?.children.length ?? 0) > 0,
			null,
			{ timeout: 8_000 },
		);
		const timedOut = await page.evaluate(() => {
			const error = document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-error");
			return error ? (error.querySelector(".tb-error-message")?.textContent ?? "") : null;
		});
		if (timedOut !== null) assert.match(timedOut, /did not finish within 2000ms/, "a timeout must report the bound the manifest declared");

		// The whole claim of worker mode: whichever way it went, the page was never blocked.
		assert.equal(await page.evaluate(() => 1 + 1), 2, "the page must still be answering, which is what the worker buys");
		await page.close();
	});

	it("says something useful when the tool does not exist", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/failure.html`, { waitUntil: "load" });
		const text = await page.$eval("tool-host[tool=not-a-real-tool]", (host) =>
			(host as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot.textContent,
		);
		assert.match(String(text), /No tool with id "not-a-real-tool"/);
		assert.match(String(text), /percentiles/, "and it should list what does exist");
		await page.close();
	});
});

describe("lifecycle status", () => {
	it("refuses to activate a retired tool, explains, and renders its links", async () => {
		const page = await browser.newPage();
		const scripts: string[] = [];
		page.on("request", (request) => {
			if (request.resourceType() === "script") scripts.push(request.url());
		});
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const host = page.locator('#lifecycle tool-host[tool=retired][mode="page"]');
		await host.scrollIntoViewIfNeeded();
		await host.locator(".tb-retired").waitFor();

		const dump = await page.evaluate(() => {
			const el = document.querySelector('#lifecycle tool-host[tool=retired][mode="page"]');
			const root = el?.shadowRoot;
			return {
				status: el?.getAttribute("data-status") ?? "",
				mark: root?.querySelector(".tb-mark")?.textContent ?? "",
				retired: root?.querySelector(".tb-retired")?.textContent ?? "",
				hasForm: Boolean(root?.querySelector(".tb-form")),
				hasRun: Boolean(root?.querySelector(".tb-run")),
				links: [...(root?.querySelectorAll(".tb-foot a") ?? [])].map((a) => ({
					href: a.getAttribute("href"),
					label: a.textContent,
				})),
			};
		});
		assert.equal(dump.status, "retired");
		assert.match(dump.mark, /Retired/);
		assert.match(dump.retired, /no longer runs/);
		assert.match(dump.retired, /way onward/);
		assert.equal(dump.hasForm, false, "a retired tool must not paint a form");
		assert.equal(dump.hasRun, false, "or a Run button");
		assert.deepEqual(dump.links, [
			{ href: "/tool.html?id=percentiles", label: "Use percentiles instead" },
			{ href: "/index.html#retired-note", label: "Why it was retired" },
		]);
		assert.equal(
			scripts.filter((url) => /\/assets\/tool-retired-[^/]+\.js$/.test(url)).length,
			0,
			`a retired tool must not fetch its code: ${scripts.join(", ")}`,
		);
		await page.close();
	});

	it("does not treat a retired card as a live facade", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator("#lifecycle-cards tool-host[tool=retired]");
		await card.scrollIntoViewIfNeeded();
		await card.locator(".tb-retired").waitFor();
		assert.equal(await card.locator(".tb-facade").count(), 0, "there is nothing to click");
		assert.equal(await card.locator(".tb-form").count(), 0);
		assert.match(String(await card.locator(".tb-retired").textContent()), /no longer runs/);
		assert.equal(await card.locator('.tb-foot a[href="/tool.html?id=percentiles"]').count(), 1);
		await page.close();
	});

	it("marks a deprecated tool so a host can style it, and still runs", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const host = page.locator('#lifecycle tool-host[tool=deprecated][mode="page"]');
		await host.scrollIntoViewIfNeeded();
		await host.locator(".tb-form").waitFor();

		const before = await page.evaluate(() => {
			const el = document.querySelector('#lifecycle tool-host[tool=deprecated][mode="page"]');
			const mark = el?.shadowRoot?.querySelector(".tb-mark");
			return {
				status: el?.getAttribute("data-status") ?? "",
				mark: mark?.textContent ?? "",
				markColor: mark ? getComputedStyle(mark).color : "",
			};
		});
		assert.equal(before.status, "deprecated", "data-status on the host is the hook a page styles against");
		assert.match(before.mark, /Deprecated/);
		assert.notEqual(before.markColor, "", "the marker is painted, not a class with no style");
		assert.notEqual(before.markColor, "rgba(0, 0, 0, 0)", "and it is not transparent");

		await host.locator(".tb-run").click();
		await page.waitForFunction(() =>
			document.querySelector('#lifecycle tool-host[tool=deprecated][mode="page"]')?.shadowRoot?.textContent?.includes("still runs"),
		);
		await page.close();
	});

	it("does not treat a deprecated tool as a live card", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		assert.equal(await page.locator("#cards tool-host[tool=deprecated]").count(), 0, "not among the live cards");
		assert.equal(await page.locator("#cards tool-host[tool=retired]").count(), 0, "and retired is not there either");
		assert.equal(await page.locator("#cards tool-host[tool=percentiles]").count(), 1, "live tools stay in the grid");

		const card = page.locator("#lifecycle-cards tool-host[tool=deprecated]");
		await card.scrollIntoViewIfNeeded();
		await card.locator(".tb-mark").waitFor();
		assert.equal(await card.locator(".tb-facade").count(), 0, "the compact slot is not a click-to-activate facade");
		assert.equal(await card.locator(".tb-form").count(), 0, "and it does not open a form");
		assert.match(String(await card.locator(".tb-mark").textContent()), /Deprecated/);
		assert.equal(await card.getAttribute("data-status"), "deprecated");
		// The name is a link on every compact card. The foot is the extra affordance a
		// deprecated card has instead of a click-to-activate facade.
		assert.equal(
			// Relative, not origin-absolute: the bench's pageUrl is `./tool.html` so the same markup works
			// at `/` locally and under a project Pages path. An absolute href would 404 there.
			await card.locator('.tb-foot a[href="./tool.html?id=deprecated"]').count(),
			1,
			"the way to run it is the full page",
		);
		await page.close();
	});
});

describe("accessibility wiring", () => {
	it("names the facade button with the visible try/open hint, not just Open plus the tool name", async () => {
		/*
		 * WCAG 2.5.3 (Label in Name). The facade is one button wrapping the card body. Its visible
		 * affordance is "Try it" (seeded) or "Open this tool" (not). An aria-label of
		 * "Open ${name}" hid that text, so a speech-input user saying "click Try it" matched nothing.
		 *
		 * ⚠️ axe reports this only when the experimental `label-content-name-mismatch` rule is
		 * enabled by id. Default tags, even a run that asks for every WCAG 2.1 rule, skip it.
		 */
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		await page.waitForSelector("#cards tool-host[tool=percentiles]");
		await page.waitForSelector("tool-host[tool=percentiles][data-seed]");

		const names = await page.evaluate(() => {
			const read = (host: Element | null) => {
				const root = host?.shadowRoot;
				const hint = root?.querySelector(".tb-facade-hint")?.textContent ?? "";
				const name = root?.querySelector(".tb-facade")?.getAttribute("aria-label") ?? "";
				return { hint, name };
			};
			return {
				seeded: read(document.querySelector("tool-host[tool=percentiles][data-seed]")),
				unseeded: read(document.querySelector("#cards tool-host[tool=percentiles]")),
			};
		});

		assert.equal(names.seeded.hint, "Try it");
		assert.ok(
			names.seeded.name.includes(names.seeded.hint),
			`seeded facade name "${names.seeded.name}" must contain the visible hint "${names.seeded.hint}"`,
		);
		assert.match(names.seeded.name, /Percentiles/, "and still names the tool, so the card is not anonymous");

		assert.equal(names.unseeded.hint, "Open this tool");
		assert.ok(
			names.unseeded.name.includes(names.unseeded.hint),
			`unseeded facade name "${names.unseeded.name}" must contain the visible hint "${names.unseeded.hint}"`,
		);
		assert.match(names.unseeded.name, /Percentiles/);
		await page.close();
	});

	it("gives every title link a 24px-tall target, not just the text metrics", async () => {
		/*
		 * WCAG 2.5.8 (Target Size). `.tb-name` is 1.05rem with no padding, so the pageUrl anchor
		 * measured 160×20 against the 24px floor. The rule applies in every mode that uses the
		 * title link, not only compact; today that is card mode.
		 *
		 * ⚠️ axe reports this only with `wcag22aa` in the tag list. A tag list that stops at
		 * WCAG 2.1 never evaluates it.
		 */
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const closed = page.locator("#cards tool-host[tool=percentiles]");
		await closed.locator(".tb-name a").waitFor();

		const measure = async (host: ReturnType<typeof page.locator>) => {
			const link = host.locator(".tb-name a");
			const box = await link.boundingBox();
			const css = await link.evaluate((el) => {
				const style = getComputedStyle(el);
				return { minHeight: style.minHeight, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom };
			});
			return { box, css };
		};

		const onClosed = await measure(closed);
		const closedBox = onClosed.box;
		assert.ok(closedBox, "a card with pageUrl must make the title a link");
		assert.ok(
			closedBox.height >= 24,
			`closed-card title link is ${closedBox.height}px tall, need at least 24 (css min-height ${onClosed.css.minHeight})`,
		);
		assert.ok(closedBox.width >= 24, `closed-card title link is ${closedBox.width}px wide, need at least 24`);
		assert.equal(onClosed.css.minHeight, "24px", "the floor is documented in CSS, not only observed");
		assert.ok(parseFloat(onClosed.css.paddingTop) > 0 && parseFloat(onClosed.css.paddingBottom) > 0, "block padding is what grows the hit target into the head");

		// Same rule after activation: the title link is still there, still the same styles.
		await closed.locator(".tb-facade").click();
		await closed.locator(".tb-form").waitFor();
		const onOpen = await measure(closed);
		const openBox = onOpen.box;
		assert.ok(openBox, "the title stays a link after the card opens");
		assert.ok(openBox.height >= 24, `open-card title link is ${openBox.height}px tall, need at least 24`);
		assert.equal(onOpen.css.minHeight, "24px");
		await page.close();
	});

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

describe("host code highlight hook", () => {
	/*
	 * The expected source is JSON.stringify(JSON.parse('{"ok":true,"n":3}'), null, 2), written out
	 * by hand from that spec, not captured from a run. The fixture's default is that object.
	 */
	const pretty = '{\n  "ok": true,\n  "n": 3\n}';

	it("receives (source, lang) and puts the returned Node in the DOM", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const host = page.locator('tool-host[tool="json-code"][mode="page"]');
		await host.scrollIntoViewIfNeeded();
		await host.locator(".tb-run").waitFor();
		await host.locator(".tb-run").click();
		await host.locator(".tb-out-code").waitFor({ timeout: 15_000 });

		const painted = await page.evaluate(() => {
			const root = document.querySelector('tool-host[tool="json-code"][mode="page"]')?.shadowRoot;
			const block = root?.querySelector(".tb-out-code");
			const hook = root?.querySelector("[data-highlight-hook]");
			return {
				lang: block?.getAttribute("data-lang") ?? "",
				hookLang: hook?.getAttribute("data-highlight-lang") ?? "",
				text: hook?.textContent ?? "",
				tokens: [...(hook?.querySelectorAll("[data-tok]") ?? [])].map((el) => ({
					kind: el.getAttribute("data-tok"),
					text: el.textContent,
				})),
				directTextChild: hook?.firstChild?.nodeType === Node.TEXT_NODE && hook.childNodes.length === 1,
			};
		});

		assert.equal(painted.lang, "json", "the renderer still sets data-lang");
		assert.equal(painted.hookLang, "json", "the hook must see the language tag");
		assert.equal(painted.text, pretty, "the hook must see the source, and the Node must keep it readable");
		assert.equal(painted.directTextChild, false, "the text node was replaced, not left as a single text child");
		assert.ok(
			painted.tokens.some((t) => t.kind === "string" && t.text === '"ok"'),
			`expected a string token for "ok", got ${JSON.stringify(painted.tokens)}`,
		);
		assert.ok(
			painted.tokens.some((t) => t.kind === "keyword" && t.text === "true"),
			`expected a keyword token for true, got ${JSON.stringify(painted.tokens)}`,
		);
		assert.ok(
			painted.tokens.some((t) => t.kind === "number" && t.text === "3"),
			`expected a number token for 3, got ${JSON.stringify(painted.tokens)}`,
		);
		await page.close();
	});

	it("still renders readable plain text when the host omits the hook", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html?code=plain`, { waitUntil: "load" });
		const host = page.locator('tool-host[tool="json-code"][mode="page"]');
		await host.scrollIntoViewIfNeeded();
		await host.locator(".tb-run").waitFor();
		await host.locator(".tb-run").click();
		await host.locator(".tb-out-code").waitFor({ timeout: 15_000 });

		const plain = await page.evaluate(() => {
			const root = document.querySelector('tool-host[tool="json-code"][mode="page"]')?.shadowRoot;
			const code = root?.querySelector(".tb-out-code code");
			return {
				lang: root?.querySelector(".tb-out-code")?.getAttribute("data-lang") ?? "",
				text: code?.textContent ?? "",
				hook: Boolean(root?.querySelector("[data-highlight-hook]")),
				onlyText: Boolean(code && code.childNodes.length === 1 && code.firstChild?.nodeType === Node.TEXT_NODE),
			};
		});

		assert.equal(plain.lang, "json");
		assert.equal(plain.text, pretty, "without a hook the source is still there as preformatted text");
		assert.equal(plain.hook, false, "the demo highlighter must not run");
		assert.equal(plain.onlyText, true, "the existing path is a single text node inside <code>");
		await page.close();
	});

	/*
	 * A hook is host code, so the runtime has to keep drawing something readable whatever it is handed. Both
	 * fallbacks are four lines in `renderCode` that anybody would assume work; neither had a test. The bench
	 * installs a deliberately broken hook behind `?code=`, chosen inside `highlight.ts` so those instruments
	 * stay out of the chunk the README publishes.
	 */
	for (const [mode, what] of [
		["throw", "a hook that throws"],
		["string", "a hook that returns a string instead of a node"],
	] as const) {
		it(`falls back to plain text when the host passes ${what}`, async () => {
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on("pageerror", (error) => errors.push(String(error)));
			await page.goto(`${BASE}/index.html?code=${mode}`, { waitUntil: "load" });
			const host = page.locator('tool-host[tool="json-code"][mode="page"]');
			await host.scrollIntoViewIfNeeded();
			await host.locator(".tb-run").click();
			await host.locator(".tb-out-code").waitFor({ timeout: 15_000 });

			const shown = await page.evaluate(() => {
				const root = document.querySelector('tool-host[tool="json-code"][mode="page"]')?.shadowRoot;
				const code = root?.querySelector(".tb-out-code code");
				return {
					text: code?.textContent ?? "",
					hook: Boolean(root?.querySelector("[data-highlight-hook]")),
					onlyText: Boolean(code && code.childNodes.length === 1 && code.firstChild?.nodeType === Node.TEXT_NODE),
				};
			});
			// The same hand-derived expectation the no-hook test uses: a broken hook must be indistinguishable
			// from no hook at all, which is a stronger claim than "something readable appeared".
			assert.equal(shown.text, pretty, `a broken hook must fall back to the exact source: ${JSON.stringify(shown.text)}`);
			assert.equal(shown.onlyText, true, "the fallback is a text node, not partially built markup");
			assert.equal(shown.hook, false, "no hook marker, because the hook's output was discarded");
			// A string return must not be parsed as markup, which is the reason the hook returns a Node.
			assert.doesNotMatch(shown.text, /<em>/, "a string return must never reach the DOM as markup");
			assert.deepEqual(errors, [], "a broken hook must not surface as an uncaught page error");
			await page.close();
		});
	}

});

describe("live demo", () => {
	it("keeps the stress fixture off the landing page", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		await page.waitForSelector("#cards tool-host[tool=percentiles]");
		assert.equal(await page.locator("tool-host[tool=stress]").count(), 0, "a first visitor must not meet a deliberate crash");
		const footnote = await page.locator(".footnote").textContent();
		assert.match(String(footnote), /failure-modes/, "and the landing page has to say where that fixture went");
		await page.close();
	});

	it("keeps in-bench navigation relative, so a project Pages path can prefix it", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const hrefs = await page.$$eval("header.top nav.modes a", (anchors) => anchors.map((a) => a.getAttribute("href")));
		assert.ok(hrefs.length >= 3, "the three display-mode links are present");
		for (const href of hrefs) {
			assert.ok(
				href && href.startsWith("./"),
				`nav href must be relative to the current page, got ${href}`,
			);
		}
		await page.close();
	});

	it("links every example tool on the landing page back to tools/<id>/", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		await page.waitForSelector("#cards .source a");
		const links = await page.$$eval("#cards .source a", (anchors) =>
			anchors.map((a) => ({ href: a.getAttribute("href"), text: a.textContent })),
		);
		assert.ok(links.length >= 3, `expected a source link per example card, got ${links.length}`);
		for (const link of links) {
			assert.match(
				String(link.href),
				/^https:\/\/github\.com\/eknowledger\/toolbench\/tree\/main\/tools\/[a-z0-9-]+\/$/,
				`source href must be the tool directory, got ${link.href}`,
			);
			assert.match(String(link.text), /^Source: tools\/[a-z0-9-]+\/$/);
		}
		const seeded = await page.getAttribute('p.source[data-tool="percentiles"] a', "href");
		assert.equal(seeded, "https://github.com/eknowledger/toolbench/tree/main/tools/percentiles/");
		await page.close();
	});

	it("links the open tool page to its source directory", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.waitForSelector(".source a");
		const href = await page.getAttribute(".source a", "href");
		assert.equal(href, "https://github.com/eknowledger/toolbench/tree/main/tools/percentiles/");
		await page.close();
	});

	it("links embedded tools to their source directories", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/article.html`, { waitUntil: "load" });
		const hrefs = await page.$$eval(".source a", (anchors) => anchors.map((a) => a.getAttribute("href")));
		// Three hosts on this page now: the plain embed, queue-explorer, and the parts/more demo.
		assert.deepEqual(hrefs, [
			"https://github.com/eknowledger/toolbench/tree/main/tools/percentiles/",
			"https://github.com/eknowledger/toolbench/tree/main/tools/queue-explorer/",
			"https://github.com/eknowledger/toolbench/tree/main/tools/percentiles/",
		]);
		await page.close();
	});

	it("labels the stress fixture as intentional and points at bench/fixtures/stress/", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/failure.html`, { waitUntil: "load" });
		await page.locator('tool-host[tool=stress][mode="page"]').waitFor();
		const lead = await page.locator(".lead").textContent();
		assert.match(String(lead), /on purpose/, "a visitor landing here has to be told this crash is the demo");
		const href = await page.getAttribute('p.source[data-tool="stress"] a', "href");
		assert.equal(href, "https://github.com/eknowledger/toolbench/tree/main/bench/fixtures/stress/");
		await page.close();
	});
});
