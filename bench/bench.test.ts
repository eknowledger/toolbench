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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { type Browser, type BrowserType, chromium, firefox, type Locator, type Page, webkit } from "playwright";
import type { Ctx, Graph, Output, Tool } from "../packages/sdk/src/types.ts";
import type { GraphLayout } from "../packages/runtime/src/graph/model.ts";
import { layout } from "../packages/runtime/test/graph/all.ts";
import discreteSeries from "./fixtures/discrete-series/index.ts";
import graphFamilies, { graphs } from "./fixtures/graph-families/index.ts";
import wideOutput from "./fixtures/wide-output/index.ts";

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

/**
 * Until every chart on the page is the drawing a reader keeps. A chart is first drawn at a guessed width,
 * before it is on the page, and replaced by one laid out at its measured width; the runtime marks that one
 * `data-fitted` once a measurement finds nothing left to change (#236). Waiting a count of frames instead was
 * enough on a laptop and not on a loaded CI runner, where WebKit then pointed at a drawing about to be
 * replaced and read the readout of the wrong point. Charts with no box, a closed card's hidden preview, never
 * measure, so they are not waited on.
 */
const settled = (page: Page) =>
	page.waitForFunction(
		() => {
			const figures = [...document.querySelectorAll("tool-host")]
				.flatMap((h) => [...(h.shadowRoot?.querySelectorAll<HTMLElement>("figure.tb-out-chart") ?? [])])
				.filter((f) => f.getClientRects().length > 0);
			return figures.length > 0 && figures.every((f) => f.hasAttribute("data-fitted"));
		},
		null,
		{ timeout: 15_000 },
	);

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
	/*
	 * ⚠️ Refuse a port that is already answering, and fail if our server dies.
	 *
	 * With `--strictPort` a taken port makes this server exit at once, and with its output ignored nothing
	 * said so: the wait below then found the OTHER server ready and the whole suite ran against whatever
	 * build that was. A preview left running from another checkout held this port for over two weeks, and
	 * every run in that time tested its bundle instead of the one just built, passing and failing alike.
	 */
	const taken = await fetch(`${BASE}/index.html`).then(
		() => true,
		() => false,
	);
	if (taken) {
		throw new Error(`Something is already serving on port ${PORT}. Stop it: this suite must test its own build, not whatever that is.`);
	}
	let exited: string | undefined;
	let stderr = "";
	/*
	 * ⚠️ vite's own bin, run by this Node, in a process group of its own.
	 *
	 * It used to be `npx vite preview`, stopped with SIGTERM to npx. On Linux npx does not pass the signal
	 * on, so vite outlived the suite, and once its stderr was piped here for the message below, the
	 * orphan held the write end open and kept this process's event loop alive: every CI leg passed every
	 * test and then hung until the job timeout cancelled it. macOS delivered the signal, so it never
	 * showed locally. Running the bin directly removes the process that swallowed the signal, and the
	 * group kill in `after` reaches anything vite starts as well.
	 */
	server = spawn(process.execPath, [join(import.meta.dirname, "node_modules", "vite", "bin", "vite.js"), "preview", "--port", String(PORT), "--strictPort"], {
		cwd: import.meta.dirname,
		stdio: ["ignore", "ignore", "pipe"],
		detached: true,
	});
	server.stderr?.on("data", (chunk: Buffer) => {
		stderr += String(chunk);
	});
	server.on("exit", (code, signal) => {
		exited = `code ${code}, signal ${signal}`;
	});
	// Wait for the port rather than sleeping: a fixed delay is either flaky or slow.
	const deadline = Date.now() + 20_000;
	for (;;) {
		if (exited) throw new Error(`vite preview exited before it was ready (${exited}):\n${stderr}`);
		try {
			const response = await fetch(`${BASE}/index.html`);
			if (response.ok) break;
		} catch {
			/* not up yet */
		}
		if (Date.now() > deadline) throw new Error("vite preview did not start");
		await new Promise((r) => setTimeout(r, 150));
	}
	/*
	 * Ready, so stderr has done its job. Unreferenced rather than destroyed: neither the pipe nor the
	 * child may keep this process alive, but closing our end would leave vite writing its next warning
	 * into a pipe with no reader.
	 */
	(server.stderr as (NodeJS.ReadableStream & { unref?: () => void }) | null)?.unref?.();
	server.unref();
	engineName = requestedEngine();
	browser = await launchBrowser();
});

/** Stop the server's whole process group: SIGTERM, then SIGKILL if it has not gone within two seconds. */
async function stopServer(child: ChildProcess | undefined): Promise<void> {
	const pid = child?.pid;
	if (!child || pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
	const signal = (name: NodeJS.Signals) => {
		try {
			process.kill(-pid, name); // negative: the group `detached` gave it
		} catch {
			/* already gone */
		}
	};
	let timer: ReturnType<typeof setTimeout> | undefined;
	const gone = new Promise<boolean>((resolve) => child.once("exit", () => resolve(true)));
	const late = new Promise<boolean>((resolve) => {
		timer = setTimeout(() => resolve(false), 2_000);
	});
	signal("SIGTERM");
	if (!(await Promise.race([gone, late]))) signal("SIGKILL");
	clearTimeout(timer);
}

/**
 * Move focus forward one step the way a keyboard user of this engine and platform does.
 *
 * ⚠️ On macOS, WebKit's plain Tab visits only text fields and selects unless the system's "Keyboard
 * navigation" setting is on, which Playwright's WebKit does not inherit. From the percentiles select,
 * Tab went to the body, then the textarea, then back to the select, never reaching a sample pill or
 * Run; Option+Tab, WebKit's "every control" key, walked select, the four pills, Run, then the links,
 * the same order plain Tab gives in Chromium and Firefox. Linux WebKit tabs to buttons, and Alt+Tab in
 * Firefox does not move focus at all, so the modifier is for this one combination only.
 */
async function tabForward(page: Page): Promise<void> {
	await page.keyboard.press(engineName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
}

after(async () => {
	await browser?.close();
	await stopServer(server);
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
		// The worker also lays out large graphs (#152), and a tool that draws none must not fetch that layout.
		assert.deepEqual(loaded([...urls, ...workerUrls], /\/assets\/[^/]*graph[^/]*\.js$/), [], "a worker-mode tool fetches no graph code");
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
		// Nothing is on screen, so there is nothing to say: "press Run" only restated the button below it (#99).
		assert.equal(String(await host.locator(".tb-status").textContent()).trim(), "");

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
		assert.equal(await host.locator(".tb-status").textContent(), "inputs changed. Press Run", "a full stop, not an em dash (#42)");

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
		// The chart renderer is fetched when a chart is drawn (#97), so wait for its legend rather than read at load.
		await card.locator(".tb-legend li").first().waitFor();
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
		// By hand from the default "Héllo, 世界 👋": é is U+00E9, two bytes, after the one-byte H. A colon, not an em dash (#42).
		assert.equal(dump.legend[0], "U+00E9 é: 2 bytes at 0x0001");
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

	/*
	 * #148: every untoned range used to be the same accent, so adjacent ranges read as one block. The text is
	 * chosen by hand for seven multi-byte characters: é (2 bytes), 世 (3), 界 (3), 👋 (4), ñ (2), € (3) and
	 * 😀 (4), so ranges 2 and 3 touch, and the seventh has to come round to the first colour again.
	 */
	for (const scheme of ["light", "dark"] as const) {
		it(`tells untoned ranges apart by colour, matches the legend, and keeps 4.5:1 text (${scheme})`, async () => {
			const page = await browser.newPage({ colorScheme: scheme });
			await page.goto(`${BASE}/tool.html?id=utf8-bytes`, { waitUntil: "load" });
			await page.locator("#host").scrollIntoViewIfNeeded();
			await page.locator("#host >> .tb-run").waitFor();
			await page.evaluate(() => {
				(document.getElementById("host") as HTMLElement & { values: Record<string, unknown> }).values = { text: "é世界👋ñ€😀" };
			});
			await page.locator("#host >> .tb-run").click();
			await page.locator("#host >> .tb-bytes-legend li").nth(6).waitFor({ timeout: 15_000 });
			const seen = await page.evaluate(() => {
				const root = document.getElementById("host")?.shadowRoot;
				const lum = (rgb: string) => {
					const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
						const c = Number(v) / 255;
						return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
					}) as [number, number, number];
					return 0.2126 * r + 0.7152 * g + 0.0722 * b;
				};
				const ratio = (a: string, b: string) => {
					const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
					return (hi + 0.05) / (lo + 0.05);
				};
				const legend = [...(root?.querySelectorAll(".tb-bytes-legend li") ?? [])];
				const hexBytes = [...(root?.querySelectorAll(".tb-bytes-hex .tb-byte[data-series]") ?? [])];
				return {
					series: legend.map((li) => li.getAttribute("data-series")),
					swatches: legend.map((li) => getComputedStyle(li.querySelector(".tb-bytes-swatch") as Element).backgroundColor),
					// The first hex byte of each range, found by its label, which is also its hover text. The label is
					// whatever precedes the size and offset, not a fixed number of words: counting words matched only
					// while a separator happened to be one of them.
					marks: legend.map((li) => {
						const label = li.textContent?.replace(/: \d+ bytes? at 0x[0-9a-f]+$/i, "");
						const byte = hexBytes.find((b) => b.getAttribute("title") === label);
						return byte ? getComputedStyle(byte).backgroundColor : "missing";
					}),
					titles: hexBytes.map((b) => b.getAttribute("title")),
					worst: Math.min(...hexBytes.map((b) => ratio(getComputedStyle(b).color, getComputedStyle(b).backgroundColor))),
				};
			});
			assert.deepEqual(seen.series, ["1", "2", "3", "4", "5", "6", "1"], "the next series colour per range, round again after six");
			assert.deepEqual(seen.marks, seen.swatches, "each legend swatch is the colour of its range's bytes");
			assert.equal(new Set(seen.swatches.slice(0, 6)).size, 6, `six ranges, six colours: ${seen.swatches.join(" | ")}`);
			assert.notEqual(seen.marks[1], seen.marks[2], "two ranges that touch, 世 and 界, are different colours");
			assert.ok(seen.titles.every((t) => t !== null && t.length > 0), "and colour is not the only carrier: every marked byte keeps its label");
			assert.ok(seen.worst >= 4.5, `the hex digits on every mark need 4.5:1, the worst was ${seen.worst.toFixed(2)}`);
			await page.close();
		});
	}

	it("lets a tone win over the series colour", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		// A bytes result drawn as a seed, so a toned range sits between two untoned ones without a new fixture.
		await page.evaluate(() => {
			const host = document.createElement("tool-host") as HTMLElement & { seed: unknown };
			host.id = "toned-bytes";
			host.setAttribute("tool", "utf8-bytes");
			host.setAttribute("mode", "card");
			host.seed = {
				kind: "bytes",
				bytes: [1, 2, 3, 4, 5, 6],
				highlight: [
					{ at: 0, len: 2, label: "first" },
					{ at: 2, len: 2, label: "broken", tone: "bad" },
					{ at: 4, len: 2, label: "second" },
				],
			};
			document.body.append(host);
		});
		await page.locator("#toned-bytes >> .tb-bytes-legend li").nth(2).waitFor({ timeout: 15_000 });
		const legend = await page.evaluate(() =>
			[...(document.getElementById("toned-bytes")?.shadowRoot?.querySelectorAll(".tb-bytes-legend li") ?? [])].map((li) => ({
				tone: li.getAttribute("data-tone"),
				series: li.getAttribute("data-series"),
			})),
		);
		assert.deepEqual(legend, [
			{ tone: "normal", series: "1" },
			{ tone: "bad", series: null },
			{ tone: "normal", series: "2" },
		], "the bad range keeps its tone, and the next untoned range takes the next colour rather than skipping one");
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
		assert.match(after.status, /Press Run/, "and still say what to do next");
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

			await tabForward(page);
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
		await tabForward(page);
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

	it("gives an autoRun tool no Run button and no instruction to press one (#104)", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=histogram`, { waitUntil: "load" });
		await page.waitForSelector("#host >> .tb-out-chart", { timeout: 10_000 });
		const state = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			return { run: root?.querySelectorAll(".tb-run").length ?? -1, status: root?.querySelector(".tb-status")?.textContent ?? "" };
		});
		assert.equal(state.run, 0);
		assert.doesNotMatch(state.status, /press Run/i);
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
		 * ⚠️ An `autoRun` tool computes its default answer on arrival (#104), so a result is already on the
		 * page. What the sample has to prove is that it produces a DIFFERENT one, so the data table's text is
		 * compared before and after rather than asking whether any result exists.
		 */
		const before = await page.locator("#host >> .tb-textarea").inputValue();
		await page.waitForSelector("#host >> .tb-out-chart", { timeout: 10_000 });
		const tableOf = () => page.evaluate(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-chart-data table")?.textContent ?? "");
		const firstTable = await tableOf();
		assert.ok(firstTable.length > 0, "an autoRun tool shows its default result on arrival, with no Run button to press");

		await page.locator('#host >> .tb-sample:text-is("One spike")').click();
		await page.waitForFunction(
			(previous) => (document.querySelector("#host")?.shadowRoot?.querySelector(".tb-chart-data table")?.textContent ?? previous) !== previous,
			firstTable,
			{ timeout: 10_000 },
		);
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
		assert.doesNotMatch(after.status, /press Run/i, `the run already happened, so the status must not ask for it: ${after.status}`);
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

describe("host events: tool-input and tool-run (#212)", () => {
	/*
	 * A host keeping something in step with a tool (a deep link, analytics, its own Copy button) used to
	 * listen for the browser's own input, change and click events leaking out of the shadow root, which
	 * depends on how each control happens to be built and cannot see a run that nobody clicked. These are
	 * browser facts: whether the events cross the shadow boundary, how many fire per change, and whether
	 * the result is already drawn when `tool-run` arrives.
	 */
	type Seen = { type: string; values: Record<string, unknown>; ok?: boolean; error?: unknown; composed: boolean; bubbles: boolean; target: string; drawn: number; stale: boolean };
	type HostApi = HTMLElement & { values: Record<string, string | number | boolean>; run: (options?: { focus?: boolean }) => Promise<void> };

	/** Records every event on `document` from before the page's own scripts run, so upgrade is covered too. */
	async function recording(path: string): Promise<Page> {
		const page = await browser.newPage();
		await page.addInitScript(() => {
			const seen: unknown[] = [];
			(window as unknown as { seen: unknown[] }).seen = seen;
			for (const type of ["tool-input", "tool-run"]) {
				document.addEventListener(type, (event) => {
					const detail = (event as CustomEvent<Record<string, unknown>>).detail;
					const host = event.target as HTMLElement;
					const output = host.shadowRoot?.querySelector(".tb-output");
					seen.push({
						type,
						...JSON.parse(JSON.stringify(detail)),
						composed: event.composed,
						bubbles: event.bubbles,
						target: host.tagName,
						drawn: output?.children.length ?? -1,
						stale: output?.hasAttribute("data-stale") ?? false,
					});
				});
			}
		});
		await page.goto(`${BASE}/${path}`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		return page;
	}
	const seen = (page: Page) => page.evaluate(() => (window as unknown as { seen: Seen[] }).seen.splice(0));

	it("dispatches nothing while the element upgrades with its initial values, an autoRun tool's first answer included", async () => {
		const page = await recording("tool.html?id=percentiles");
		await page.waitForTimeout(300);
		assert.deepEqual(await seen(page), [], "opening a tool is not a change and not a run anyone asked for");
		await page.close();

		const auto = await recording("tool.html?id=histogram");
		await auto.waitForSelector("#host >> .tb-out-chart", { timeout: 10_000 });
		await auto.waitForTimeout(300);
		assert.deepEqual(await seen(auto), [], "an autoRun tool computes its default answer on arrival, and that is still upgrade");
		await auto.close();
	});

	it("dispatches tool-input once per keystroke and once per select change, composed and bubbling, with the new values", async () => {
		const page = await recording("tool.html?id=percentiles");
		await page.locator("#host >> .tb-textarea").focus();
		await page.keyboard.press("End");
		await page.keyboard.type(" 7 8");
		const typed = await seen(page);
		assert.equal(typed.length, 4, `four keystrokes, four events: ${typed.map((e) => e.type).join(", ")}`);
		assert.ok(typed.every((e) => e.type === "tool-input" && e.composed && e.bubbles && e.target === "TOOL-HOST"), "a host listens on the element, or anywhere above it");
		assert.match(String(typed.at(-1)?.values.values), / 7 8$/, "the detail carries the values after the change");

		await page.locator("#host >> .tb-select").selectOption("linear");
		const picked = await seen(page);
		assert.equal(picked.length, 1);
		assert.equal(picked[0]?.values.method, "linear");
		await page.close();
	});

	it("dispatches tool-input once for a sample, carrying every value the sample set", async () => {
		const page = await recording("tool.html?id=percentiles");
		await page.locator('#host >> .tb-sample:text-is("Definitions disagree")').click();
		const events = await seen(page);
		const now = await page.locator("#host").evaluate((el) => ({ ...(el as HostApi).values }));
		assert.equal(events.length, 1, `one click, one event: ${events.length}`);
		assert.equal(events[0]?.type, "tool-input");
		assert.deepEqual(events[0]?.values, now, "the detail is what `values` reads after the sample");
		await page.close();
	});

	it("dispatches tool-input once when the host sets values, with the clamped values, and not for a write that changes nothing", async () => {
		const page = await recording("tool.html?id=queue-explorer");
		const during = await page.locator("#host").evaluate((el) => {
			(el as HostApi).values = { arrivals: 99999 };
			return (window as unknown as { seen: Seen[] }).seen.length;
		});
		assert.equal(during, 1, "dispatched before the setter returns, so a host can rely on it in the same task");
		const events = await seen(page);
		assert.equal(events[0]?.values.arrivals, 5000, "the value the tool will run on, not the one the host wrote");

		await page.locator("#host").evaluate((el) => {
			(el as HostApi).values = { arrivals: 5000 };
		});
		assert.deepEqual(await seen(page), [], "the values did not change, so there is nothing to report");
		await page.close();
	});

	it("dispatches tool-run once for Run and once for run(), after the result is drawn", async () => {
		const page = await recording("tool.html?id=percentiles");
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-out-fields").first().waitFor({ timeout: 15_000 });
		await page.waitForTimeout(100);
		const pressed = await seen(page);
		assert.equal(pressed.length, 1, `one press, one event: ${pressed.map((e) => e.type).join(", ")}`);
		assert.equal(pressed[0]?.type, "tool-run");
		assert.equal(pressed[0]?.ok, true);
		assert.ok((pressed[0]?.drawn ?? 0) > 0 && !pressed[0]?.stale, "a listener reading the result finds this run's, already on screen");
		assert.equal(pressed[0]?.composed && pressed[0]?.bubbles, true);

		const fromCode = await page.locator("#host").evaluate(async (el) => {
			const host = el as HostApi;
			host.values = { values: "1 2 3 4 5" };
			(window as unknown as { seen: Seen[] }).seen.splice(0);
			await host.run();
			return (window as unknown as { seen: Seen[] }).seen.splice(0);
		});
		assert.equal(fromCode.length, 1, "run() from code is a run too, and settles before its promise does");
		assert.equal(fromCode[0]?.values.values, "1 2 3 4 5", "the values the run used");
		assert.ok((fromCode[0]?.drawn ?? 0) > 0 && !fromCode[0]?.stale);
		await page.close();
	});

	it("reports an error result and a thrown error as ok false, with the message", async () => {
		const page = await recording("tool.html?id=percentiles");
		await page.locator('#host >> .tb-sample:text-is("Not a number")').click();
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-out-error").waitFor({ timeout: 15_000 });
		const refused = (await seen(page)).filter((e) => e.type === "tool-run");
		assert.equal(refused.length, 1);
		assert.equal(refused[0]?.ok, false);
		assert.equal(typeof refused[0]?.error, "string");
		assert.ok(String(refused[0]?.error).length > 0);
		await page.close();

		const crash = await recording("tool.html?id=stress");
		await crash.locator("#host >> .tb-select").selectOption("throw");
		await crash.locator("#host >> .tb-run").click();
		await crash.waitForFunction(() => document.querySelector("#host")?.shadowRoot?.textContent?.includes("hit a bug"), undefined, { timeout: 15_000 });
		const thrown = (await seen(crash)).filter((e) => e.type === "tool-run");
		assert.equal(thrown.length, 1);
		assert.equal(thrown[0]?.ok, false);
		assert.match(String(thrown[0]?.error), /hit a bug/, "the same message the reader sees");
		await crash.close();
	});

	it("dispatches one tool-run for a burst of typing on an autoRun tool, not one per superseded run", async () => {
		const page = await recording("tool.html?id=histogram");
		await page.waitForSelector("#host >> .tb-out-chart", { timeout: 10_000 });
		await seen(page);
		await page.locator("#host >> .tb-textarea").focus();
		await page.keyboard.press("End");
		await page.keyboard.type(" 3 4");
		await page.waitForTimeout(600);
		const events = await seen(page);
		assert.equal(events.filter((e) => e.type === "tool-input").length, 4);
		const runs = events.filter((e) => e.type === "tool-run");
		assert.equal(runs.length, 1, `the debounce leaves one run: ${runs.length}`);
		assert.match(String(runs[0]?.values.values), / 3 4$/);
		await page.close();
	});
});

describe("a Reset control (#208)", () => {
	/*
	 * A reader who changed several inputs, or picked a sample, had no way back to where the tool started
	 * short of reloading the page. Whether the button is there only when it would do something, what it
	 * restores on a page that opened on its own values, where focus lands when it hides itself, and whether
	 * it costs the reader their undo are all browser facts.
	 */
	type HostApi = HTMLElement & { values: Record<string, string | number | boolean>; run: (options?: { focus?: boolean }) => Promise<void> };
	const state = (page: Page, selector = "#host") =>
		page.locator(selector).evaluate((el) => {
			const host = el as HostApi;
			const root = host.shadowRoot as ShadowRoot;
			const reset = root.querySelector<HTMLButtonElement>(".tb-reset");
			const output = root.querySelector(".tb-output");
			return {
				values: { ...host.values },
				reset: reset ? (reset.hidden ? "hidden" : "shown") : "absent",
				drawn: output?.children.length ?? -1,
				stale: output?.hasAttribute("data-stale") ?? false,
				focus: root.activeElement?.id || root.activeElement?.className || "",
				status: root.querySelector(".tb-status")?.textContent ?? "",
			};
		});

	async function open(path: string): Promise<Page> {
		const page = await browser.newPage();
		await page.addInitScript(() => {
			const resets: unknown[] = [];
			(window as unknown as { resets: unknown[] }).resets = resets;
			document.addEventListener("tool-reset", (event) => resets.push((event as CustomEvent).detail));
		});
		await page.goto(`${BASE}/${path}`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		return page;
	}

	it("is hidden at first, appears beside Run after an edit, and hides again when the values are back", async () => {
		const page = await open("tool.html?id=percentiles");
		assert.equal((await state(page)).reset, "hidden", "a button that would do nothing is not offered");
		await page.locator("#host >> .tb-select").selectOption("linear");
		assert.equal((await state(page)).reset, "shown");
		const button = page.locator("#host >> .tb-reset");
		assert.equal(await button.textContent(), "Reset");
		assert.equal(await button.getAttribute("aria-label"), "Reset inputs to their starting values");
		assert.equal(await button.getAttribute("type"), "button");
		assert.equal(await page.locator("#host >> .tb-actions > .tb-run + .tb-reset").count(), 1, "directly after Run, in the same row");
		const heights = await Promise.all([page.locator("#host >> .tb-run").boundingBox(), button.boundingBox()]);
		assert.ok(Math.abs((heights[0]?.height ?? 0) - (heights[1]?.height ?? -9)) < 0.5, `the pair stands the same height: ${heights.map((h) => h?.height).join(" vs ")}`);
		await page.locator("#host >> .tb-select").selectOption("nearest");
		assert.equal((await state(page)).reset, "hidden", "the reader put the value back by hand, so there is nothing to reset");
		await page.close();
	});

	it("restores the first render's values after two edits and a run, clears the result, and moves focus to the first input", async () => {
		const page = await open("tool.html?id=percentiles");
		const first = await state(page);
		await page.locator("#host >> .tb-textarea").fill("1 2 3");
		await page.locator("#host >> .tb-select").selectOption("linear");
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-out-fields").first().waitFor({ timeout: 15_000 });
		await page.locator("#host >> .tb-reset").click();
		const after = await state(page);
		assert.deepEqual(after.values, first.values, "every input back to its first value");
		assert.equal(await page.locator("#host >> .tb-textarea").inputValue(), String(first.values.values), "and the controls show it");
		assert.equal(await page.locator("#host >> .tb-select").inputValue(), "nearest");
		assert.equal(after.drawn, 0, "the result is cleared, as on first load");
		assert.equal(after.stale, false);
		assert.equal(after.reset, "hidden");
		assert.equal(after.focus, "in-values", "the button hid itself, so focus goes to the first input rather than the page");
		assert.equal(await page.locator("#host >> .tb-run[data-attention]").count(), 0);
		const resets = await page.evaluate(() => (window as unknown as { resets: unknown[] }).resets);
		assert.deepEqual(resets, [{ values: first.values }], "tool-reset once, with the restored values");
		await page.close();
	});

	it("undoes a sample from the keyboard: Tab from Run reaches it, Enter presses it", async () => {
		const page = await open("tool.html?id=percentiles");
		const first = await state(page);
		await page.locator('#host >> .tb-sample:text-is("Definitions disagree")').click();
		assert.equal((await state(page)).reset, "shown");
		await page.locator("#host >> .tb-run").focus();
		await tabForward(page);
		assert.equal((await state(page)).focus, "tb-reset", "the next stop after Run");
		await page.keyboard.press("Enter");
		const after = await state(page);
		assert.deepEqual(after.values, first.values);
		assert.equal(after.focus, "in-values");
		assert.match(after.status, /reset/i, "the status line says what happened, the only confirmation a screen reader gets");
		await page.close();
	});

	it("resets to the values a host opened the tool with, not the manifest's defaults", async () => {
		const page = await open("tool.html?id=percentiles");
		const embedded = await page.evaluate(() => {
			const host = document.createElement("tool-host") as HostApi;
			host.id = "prefilled";
			host.values = { values: "5 6 7", method: "linear" };
			host.setAttribute("tool", "percentiles");
			host.setAttribute("mode", "embed");
			document.body.append(host);
			return { ...host.values };
		});
		// An embed activates near the viewport, and this one was appended below the page's own tool.
		await page.locator("#prefilled").scrollIntoViewIfNeeded();
		await page.waitForSelector("#prefilled >> .tb-form");
		assert.deepEqual(embedded, { values: "5 6 7", method: "linear" });
		assert.equal((await state(page, "#prefilled")).reset, "hidden", "the host's values are the starting point");
		await page.locator("#prefilled >> .tb-textarea").fill("9");
		await page.locator("#prefilled >> .tb-reset").click();
		assert.deepEqual((await state(page, "#prefilled")).values, embedded);
		await page.close();
	});

	it("is not drawn with reset=\"none\", and goes when the attribute is set later", async () => {
		const page = await open("tool.html?id=percentiles");
		await page.locator("#host >> .tb-select").selectOption("linear");
		assert.equal((await state(page)).reset, "shown");
		await page.locator("#host").evaluate((el) => el.setAttribute("reset", "none"));
		assert.equal((await state(page)).reset, "absent", "a host opts out for a tool where it adds nothing");
		await page.close();
	});

	it("redraws an autoRun tool's default answer, since that is what first load showed", async () => {
		const page = await open("tool.html?id=histogram");
		await page.waitForSelector("#host >> .tb-out-chart", { timeout: 10_000 });
		const table = () => page.evaluate(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-chart-data table")?.textContent ?? "");
		const firstTable = await table();
		const first = await state(page);
		await page.locator('#host >> .tb-sample:text-is("One spike")').click();
		await page.waitForFunction((previous) => (document.querySelector("#host")?.shadowRoot?.querySelector(".tb-chart-data table")?.textContent ?? previous) !== previous, firstTable, { timeout: 10_000 });
		await page.locator("#host >> .tb-reset").click();
		await page.waitForFunction((wanted) => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-chart-data table")?.textContent === wanted, firstTable, { timeout: 10_000 });
		assert.deepEqual((await state(page)).values, first.values);
		await page.close();
	});

	it("keeps a typed burst one undo step, though the first key shows the button", async () => {
		const page = await open("tool.html?id=percentiles");
		const area = page.locator("#host >> .tb-textarea");
		const before = await area.inputValue();
		await area.click();
		await area.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
		await page.keyboard.type("abc def\n", { delay: 30 });
		assert.equal((await state(page)).reset, "shown");
		await page.waitForTimeout(400);
		await page.keyboard.press("ControlOrMeta+z");
		assert.equal(await area.inputValue(), before, "one undo takes back the whole burst, as in a plain textarea");
		await page.close();
	});
});

describe("the links attribute (#216)", () => {
	/*
	 * Outside a card the element draws the manifest's links under the tool. Embedded in an article, a tool
	 * with several references put a line of links between its answer and the prose that continues below,
	 * and on a page that already lists them they appeared twice. Hiding `.tb-foot` with CSS worked, but it
	 * lived in a stylesheet rather than in the element's API. What is drawn for each value is a DOM fact.
	 */
	type HostApi = HTMLElement & { links: string; run: () => Promise<void> };
	const foot = (page: Page, selector = "#host") =>
		page.locator(selector).evaluate((el) => {
			const root = el.shadowRoot as ShadowRoot;
			return {
				rows: root.querySelectorAll(".tb-foot").length,
				links: [...root.querySelectorAll(".tb-foot a")].map((a) => `${a.textContent} ${a.getAttribute("href")}`),
				property: (el as HostApi).links,
			};
		});
	async function open(path: string): Promise<Page> {
		const page = await browser.newPage();
		await page.goto(`${BASE}/${path}`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		return page;
	}
	const set = (page: Page, value: string, selector = "#host") => page.locator(selector).evaluate((el, v) => el.setAttribute("links", v), value);

	it("draws the manifest's links by default outside a card, and for a value it does not know", async () => {
		const page = await open("tool.html?id=queue-explorer");
		const all = await foot(page);
		assert.equal(all.links.length, 2, `queue-explorer declares two: ${all.links.join(" | ")}`);
		assert.equal(all.property, "all");
		await set(page, "some");
		assert.deepEqual((await foot(page)).links, all.links, "a typo keeps today's behaviour rather than hiding the links");
		await page.close();
	});

	it("page: only \"Open the full tool\", pointing at the tool's page", async () => {
		const page = await open("tool.html?id=queue-explorer");
		await set(page, "page");
		const shown = await foot(page);
		assert.deepEqual(shown.links, ["Open the full tool ./tool.html?id=queue-explorer"]);
		assert.equal(shown.property, "page");
		await page.close();
	});

	it("none: no row at all; the property writes the attribute and reads it back", async () => {
		const page = await open("tool.html?id=queue-explorer");
		const attribute = await page.locator("#host").evaluate((el) => {
			(el as HostApi).links = "none";
			return el.getAttribute("links");
		});
		assert.equal(attribute, "none");
		assert.deepEqual(await foot(page), { rows: 0, links: [], property: "none" });
		await page.close();
	});

	it("keeps the reader's inputs and result when it changes", async () => {
		const page = await open("tool.html?id=utf8-bytes");
		await page.locator("#host >> .tb-textarea").fill("abc");
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-output > *").first().waitFor({ timeout: 15_000 });
		const drawn = await page.locator("#host >> .tb-output").textContent();
		await set(page, "none");
		assert.equal(await page.locator("#host >> .tb-textarea").inputValue(), "abc");
		assert.equal(await page.locator("#host >> .tb-output").textContent(), drawn);
		await page.close();
	});

	it("leaves a retired tool's links, which its notice names as the way onward", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const selector = 'tool-host[tool=retired][mode="page"]';
		await page.locator(`${selector} >> .tb-retired`).waitFor();
		const before = await foot(page, selector);
		assert.equal(before.links.length, 2);
		for (const value of ["page", "none"]) {
			await set(page, value, selector);
			assert.deepEqual((await foot(page, selector)).links, before.links, `links="${value}" on a retired tool`);
		}
		await page.close();
	});

	it("takes a card's \"Open the full tool\" away with none, and leaves it for anything else", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const selector = "tool-host[tool=percentiles][data-seed]";
		await page.locator(`${selector} >> .tb-facade`).click();
		await page.locator(`${selector} >> .tb-form`).waitFor();
		const card = await foot(page, selector);
		assert.deepEqual(card.links, ["Open the full tool ./tool.html?id=percentiles"]);
		assert.equal(card.property, "page", "a card's default is the link to the full tool");
		await set(page, "all", selector);
		assert.deepEqual((await foot(page, selector)).links, card.links, "a card has no room for the manifest's links");
		await set(page, "none", selector);
		assert.equal((await foot(page, selector)).rows, 0);
		await page.close();
	});
});

describe("the share button (#227)", () => {
	/*
	 * Every host that wanted shareable links wrote the same code: a button, `host.values`, a filter for the
	 * inputs that must not go in a URL, a URL, and on load the same URL parsed back into `host.values`. Where
	 * the button lands in each mode, what it writes to the clipboard, and what a tool opens with from a link
	 * are browser facts. The clipboard is stubbed, as the Copy tests do, because Firefox and WebKit give an
	 * automated page no clipboard permission; one Chromium test reads the real one back.
	 */
	type Clipboard = "records" | "refuses" | "missing";
	type HostApi = HTMLElement & { values: Record<string, string | number | boolean> };
	const DEFAULT_VALUES = "12+14+15+15+16+18+19+21+24+28+31+35+42+51+68+91+140+220+480+1200";

	async function open(path: string, clipboard: Clipboard = "records", form = true): Promise<Page> {
		const page = await browser.newPage();
		await page.addInitScript((mode: Clipboard) => {
			const w = window as unknown as { copied: string[]; events: { type: string; detail: unknown }[] };
			w.copied = [];
			w.events = [];
			for (const type of ["tool-share", "tool-input"]) document.addEventListener(type, (event) => w.events.push({ type, detail: (event as CustomEvent).detail }));
			const stub =
				mode === "missing"
					? undefined
					: {
							writeText: (text: string) => {
								if (mode === "refuses") return Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
								w.copied.push(text);
								return Promise.resolve();
							},
						};
			Object.defineProperty(Navigator.prototype, "clipboard", { configurable: true, get: () => stub });
		}, clipboard);
		await page.goto(`${BASE}/${path}`, { waitUntil: "load" });
		if (form) {
			await page.locator("#host").scrollIntoViewIfNeeded();
			await page.waitForSelector("#host >> .tb-form");
		}
		return page;
	}
	const where = (page: Page, selector = "#host") =>
		page.locator(selector).evaluate((el) => {
			const button = el.shadowRoot?.querySelector<HTMLButtonElement>('[part~="share"]');
			if (!button) return "absent";
			return button.closest(".tb-head") ? "top" : button.closest(".tb-actions") ? "actions" : button.closest(".tb-share-top") ? "top" : "elsewhere";
		});
	const share = (page: Page) => page.locator('#host >> [part~="share"]');
	const recorded = (page: Page) =>
		page.evaluate(() => {
			const w = window as unknown as { copied: string[]; events: { type: string; detail: { url?: string; values?: Record<string, unknown> } }[] };
			return { copied: w.copied, events: w.events };
		});

	it("sits at the title row's end on a page, at the Run row's end in an embed, and nowhere on a card", async () => {
		const page = await open("tool.html?id=percentiles");
		assert.equal(await where(page), "top");
		assert.equal(await share(page).getAttribute("aria-label"), "Copy a link to this tool with its inputs");
		assert.equal(await share(page).getAttribute("type"), "button");
		const box = await share(page).boundingBox();
		assert.ok(box && Math.abs(box.width - 28) < 0.5 && Math.abs(box.height - 28) < 0.5, `a 28px icon button: ${box?.width} x ${box?.height}`);
		await page.close();

		const embed = await open("tool.html?id=percentiles&mode=embed");
		assert.equal(await where(embed), "actions");
		assert.equal(await embed.locator("#host >> .tb-actions > :last-child").evaluate((el) => el.matches(".tb-share-bar")), true, "the last thing in the row");
		await embed.close();

		const cards = await open("index.html", "records", false);
		const card = cards.locator("tool-host[tool=percentiles][data-seed]");
		await card.locator(".tb-facade").click();
		await card.locator(".tb-form").waitFor();
		assert.equal(await where(cards, "tool-host[tool=percentiles][data-seed]"), "absent", "a card has room for one input and Run");
		await cards.close();
	});

	it("moves with share-position or the host's sharePosition, and goes with share=none or the host's share: none", async () => {
		for (const [query, wanted] of [
			["&share-position=actions", "actions"],
			["&mode=embed&share-position=top", "top"],
			["&mode=embed&hostSharePosition=top", "top"],
			["&hostSharePosition=top&share-position=actions", "actions"],
			["&share=none", "absent"],
			["&hostShare=none", "absent"],
		] as const) {
			const page = await open(`tool.html?id=percentiles${query}`);
			assert.equal(await where(page), wanted, query);
			await page.close();
		}
	});

	it("shows a label beside the icon when given one, with the label first in its name", async () => {
		for (const query of ["&share-label=Copy+link", "&hostShareLabel=Copy+link"]) {
			const page = await open(`tool.html?id=percentiles${query}`);
			assert.equal((await share(page).textContent())?.trim(), "Copy link");
			assert.equal(await share(page).getAttribute("aria-label"), "Copy link: a link to this tool with its inputs");
			await page.close();
		}
	});

	it("copies the page URL with the inputs under the tool's id, says so for two seconds, and dispatches tool-share", async () => {
		const page = await open("tool.html?id=percentiles");
		await page.locator("#host >> .tb-select").selectOption("linear");
		await share(page).click();
		await page.waitForFunction(() => (window as unknown as { copied: string[] }).copied.length > 0);
		const url = `${BASE}/tool.html?id=percentiles&percentiles.values=${DEFAULT_VALUES}&percentiles.method=linear`;
		const { copied, events } = await recorded(page);
		assert.deepEqual(copied, [url], "the page's own query kept, each input as <tool id>.<input id>");
		const shared = events.filter((e) => e.type === "tool-share");
		assert.deepEqual(shared.map((e) => e.detail), [{ url, values: { values: DEFAULT_VALUES.replace(/\+/g, " "), method: "linear" } }]);
		const state = () =>
			page.locator("#host").evaluate((el) => {
				const root = el.shadowRoot as ShadowRoot;
				return { note: root.querySelector(".tb-share-note")?.textContent ?? "", announced: root.querySelector(".tb-announce")?.textContent ?? "", copied: root.querySelector('[part~="share"]')?.hasAttribute("data-copied") ?? false };
			});
		await page.waitForFunction(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-announce")?.textContent === "Link copied");
		assert.deepEqual(await state(), { note: "Link copied", announced: "Link copied", copied: true }, "a check mark and a note, heard through the status region");
		await page.waitForTimeout(2300);
		const later = await state();
		assert.equal(later.note, "", "the note goes, or it would claim a copy the reader has since replaced");
		assert.equal(later.copied, false, "and the icon is the link again");
		await page.close();
	});

	it("is reached by Tab from the Run row and pressed with Enter, in an embed", async () => {
		const page = await open("tool.html?id=utf8-bytes&mode=embed");
		await page.locator("#host >> .tb-run").focus();
		await tabForward(page);
		assert.equal(await page.locator("#host").evaluate((el) => el.shadowRoot?.activeElement?.getAttribute("part")), "share");
		await page.keyboard.press("Enter");
		await page.waitForFunction(() => (window as unknown as { copied: string[] }).copied.length > 0);
		await page.close();
	});

	it("opens with the values in the URL, as its starting values, and says nothing about it", async () => {
		const page = await open("tool.html?id=percentiles&percentiles.values=1+2+3&percentiles.method=linear&other.method=nearest");
		assert.equal(await page.locator("#host >> .tb-textarea").inputValue(), "1 2 3");
		assert.equal(await page.locator("#host >> .tb-select").inputValue(), "linear");
		assert.equal(await page.locator("#host >> .tb-reset").evaluate((el) => (el as HTMLElement).hidden), true, "a link's values are where Reset goes back to");
		assert.deepEqual((await recorded(page)).events, [], "opening a link is not a change");
		await page.close();

		const toggle = await open("tool.html?id=styled-output&styled-output.fixed=true");
		assert.equal(await toggle.locator("#host >> .tb-checkbox").isChecked(), true, "a toggle reads \"true\", not any non-empty string");
		await toggle.close();
		const off = await open("tool.html?id=styled-output&styled-output.fixed=false");
		assert.equal(await off.locator("#host >> .tb-checkbox").isChecked(), false);
		await off.close();
	});

	it("never writes or reads an input marked share: false", async () => {
		const page = await open("tool.html?id=share-private&share-private.count=5&share-private.token=leaked");
		assert.equal(await page.locator("#host >> #in-count").inputValue(), "5");
		assert.equal(await page.locator("#host >> #in-token").inputValue(), "", "a private input is not read from a link");
		await page.locator("#host >> #in-token").fill("secret");
		await share(page).click();
		await page.waitForFunction(() => (window as unknown as { copied: string[] }).copied.length > 0);
		const { copied, events } = await recorded(page);
		assert.deepEqual(copied, [`${BASE}/tool.html?id=share-private&share-private.count=5`], "the stale private value in the address is dropped too");
		assert.deepEqual(events.find((e) => e.type === "tool-share")?.detail.values, { count: 5 });
		await page.close();

		// A host's own reader handing back the private input, as a crafted link would, is filtered the same way.
		const crafted = await open(`tool.html?id=share-private&hostShareScheme=hash#${new URLSearchParams({ "share-private": JSON.stringify({ count: 7, token: "leaked" }) })}`);
		assert.equal(await crafted.locator("#host >> #in-count").inputValue(), "7");
		assert.equal(await crafted.locator("#host >> #in-token").inputValue(), "", "the same rule for the host's reader as for the default one");
		await crafted.locator("#host >> #in-token").fill("secret");
		await share(crafted).click();
		await crafted.waitForFunction(() => (window as unknown as { copied: string[] }).copied.length > 0);
		assert.deepEqual((await recorded(crafted)).events.find((e) => e.type === "tool-share")?.detail.values, { count: 7 }, "and the host's writer is never handed it");
		await crafted.close();
	});

	it("uses a host's own scheme, writing with its url and opening with its read", async () => {
		const page = await open("tool.html?id=percentiles&hostShareScheme=hash");
		await page.locator("#host >> .tb-select").selectOption("linear");
		await share(page).click();
		await page.waitForFunction(() => (window as unknown as { copied: string[] }).copied.length > 0);
		const values = { values: DEFAULT_VALUES.replace(/\+/g, " "), method: "linear" };
		const url = `${BASE}/tool.html?id=percentiles&hostShareScheme=hash#${new URLSearchParams({ percentiles: JSON.stringify(values) })}`;
		assert.deepEqual((await recorded(page)).copied, [url]);
		await page.close();

		const opened = await open(`tool.html?id=percentiles&hostShareScheme=hash&percentiles.method=midpoint#${new URLSearchParams({ percentiles: JSON.stringify({ values: "4 5", method: "linear" }) })}`);
		assert.equal(await opened.locator("#host >> .tb-textarea").inputValue(), "4 5", "the host's reader, not the default one");
		assert.equal(await opened.locator("#host >> .tb-select").inputValue(), "linear");
		await opened.close();
	});

	for (const clipboard of ["refuses", "missing"] as const) {
		it(`says so when the clipboard ${clipboard === "refuses" ? "refuses the write" : "does not exist"}, and shows the link to copy by hand`, async () => {
			const page = await open("tool.html?id=utf8-bytes", clipboard);
			await share(page).click();
			await page.waitForFunction(() => (document.querySelector("#host")?.shadowRoot?.querySelector(".tb-announce")?.textContent ?? "").length > 0);
			const state = await page.locator("#host").evaluate((el) => {
				const root = el.shadowRoot as ShadowRoot & { getSelection?: () => Selection | null };
				return {
					note: root.querySelector(".tb-share-note")?.textContent ?? "",
					announced: root.querySelector(".tb-announce")?.textContent ?? "",
					selected: root.getSelection?.()?.toString() ?? document.getSelection()?.toString() ?? "",
				};
			});
			// The default "Héllo, 世界 👋" form-encoded by hand: é is C3 A9, 世 E4 B8 96, 界 E7 95 8C, the wave F0 9F 91 8B.
			const url = `${BASE}/tool.html?id=utf8-bytes&utf8-bytes.text=H%C3%A9llo%2C+%E4%B8%96%E7%95%8C+%F0%9F%91%8B`;
			assert.equal(state.note, url, "the link itself, where the reader can see it");
			assert.equal(state.selected, url, "and selected, ready to copy");
			assert.equal(state.announced, "Copy failed. The link is selected, so you can copy it yourself");
			await page.close();
		});
	}

	it("puts the link on the real clipboard (Chromium, the one engine that lets an automated page read it back)", async () => {
		if (engineName !== "chromium") return;
		const context = await browser.newContext();
		await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
		const page = await context.newPage();
		await page.goto(`${BASE}/tool.html?id=utf8-bytes`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.waitForSelector("#host >> .tb-form");
		await page.locator("#host >> .tb-textarea").fill("abc");
		await share(page).click();
		await page.waitForFunction(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-announce")?.textContent === "Link copied");
		assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${BASE}/tool.html?id=utf8-bytes&utf8-bytes.text=abc`);
		await context.close();
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

	/*
	 * Focus across a REDRAW, which is the version that can actually break. Expanding rebuilds the output,
	 * so the button the reader pressed no longer exists and focus has to be put back by hand.
	 */
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

	it("expands without running the tool again, proven on a worker tool", async () => {
		const page = await browser.newPage();
		/*
		 * ⚠️ This is the assertion the whole design rests on, and it needs a WORKER tool to be worth
		 * anything. queue-explorer declares thread: "worker" and returns a group of two, so one part is
		 * hidden.
		 *
		 * The first version of this test watched for element identity on the main-thread tool, which broke
		 * as soon as expanding started redrawing, and would have proved little anyway: a main-thread re-run
		 * is synchronous too, so "the result is there immediately" is not evidence against one.
		 *
		 * Across a worker it is decisive. The click is dispatched and the result read inside ONE evaluate,
		 * so nothing can have crossed the message boundary and come back in between. If revealing needed the
		 * tool, there would be nothing to see yet.
		 */
		await page.goto(`${BASE}/tool.html?id=queue-explorer&parts=1&more=expand`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-disclose").waitFor({ timeout: 15_000 });
		assert.equal(await page.locator("#host >> .tb-disclose").textContent(), "Show 1 more result", "singular, with one part hidden");

		const sameTask = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			(root?.querySelector(".tb-disclose") as HTMLButtonElement | null)?.click();
			const rest = root?.querySelector(".tb-rest") as HTMLElement | null;
			return {
				revealed: rest !== null && rest !== undefined && !rest.hidden,
				parts: rest?.children.length ?? -1,
				expanded: root?.querySelector(".tb-disclose")?.getAttribute("aria-expanded") ?? null,
			};
		});

		assert.equal(sameTask.revealed, true, "revealed in the same task: a worker round trip could not have happened");
		assert.equal(sameTask.parts, 1, "and it is the part that was hidden");
		assert.equal(sameTask.expanded, "true");
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

	/*
	 * The same control in the other two modes, because "works in every mode" was a decision rather than an
	 * accident and each mode reaches the renderer by a different route: page mode from a URL, card mode only
	 * after activation.
	 */
	it("shows one notice, not two, and reveals the capped fields when opened", async () => {
		const page = await browser.newPage();
		/*
		 * Found on the bench rather than by a test: a card showed "+2 more fields" directly above
		 * "Show 2 more results", and the fields line survived expanding, so pressing the control that
		 * promised more still withheld some. The disclosure owns the whole truncation now.
		 *
		 * A card is the surface that shows it, because the field cap only applies in compact mode.
		 */
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator("tool-host#expandable-card");
		await card.scrollIntoViewIfNeeded();
		await card.locator(".tb-facade").click();
		await card.locator(".tb-form").waitFor();
		await card.locator(".tb-run").click();
		await card.locator(".tb-disclose").waitFor({ timeout: 15_000 });

		const collapsed = ((await card.locator(".tb-output").textContent()) ?? "").replace(/\s+/g, " ").trim();
		assert.doesNotMatch(collapsed, /more fields/, `the button is the only notice. Card drew: ${collapsed}`);
		const fieldsCollapsed = await card.locator(".tb-field").count();

		await card.locator(".tb-disclose").click();
		const opened = ((await card.locator(".tb-output").textContent()) ?? "").replace(/\s+/g, " ").trim();
		assert.doesNotMatch(opened, /more fields/, "and still the only notice once open");
		assert.ok(
			(await card.locator(".tb-field").count()) > fieldsCollapsed,
			"opening it must reveal the capped fields too, not just the other parts",
		);
		await page.close();
	});

	it("works in page mode, driven from the URL", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles&parts=1&more=expand`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-disclose").waitFor({ timeout: 15_000 });

		assert.equal(await page.locator("#host >> .tb-disclose").textContent(), "Show 2 more results");
		assert.equal(await page.locator("#host >> .tb-rest").isVisible(), false);
		await page.locator("#host >> .tb-disclose").click();
		assert.equal(await page.locator("#host >> .tb-rest").isVisible(), true, "page mode expands like any other");
		assert.equal(await page.locator("#host >> .tb-disclose").textContent(), "Hide 2 results");
		await page.close();
	});

	it("works in card mode once the card is open, and never on the closed facade", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator("tool-host#expandable-card");
		await card.scrollIntoViewIfNeeded();

		/*
		 * ⚠️ A closed card must not carry the button, and this is the assertion that keeps that true. The
		 * facade is itself one button, so a disclosure nested inside it could not be pressed without opening
		 * the card. `#paint` omits `more` on that path on purpose.
		 */
		await card.locator(".tb-facade").waitFor();
		assert.equal(await card.locator(".tb-disclose").count(), 0, "no disclosure inside the facade button");

		await card.locator(".tb-facade").click();
		await card.locator(".tb-form").waitFor();
		await card.locator(".tb-run").click();
		await card.locator(".tb-disclose").waitFor({ timeout: 15_000 });

		assert.equal(await card.locator(".tb-rest").isVisible(), false);
		await card.locator(".tb-disclose").click();
		assert.equal(await card.locator(".tb-rest").isVisible(), true, "an open card is just a small page");
		assert.equal(await card.locator(".tb-disclose").getAttribute("aria-expanded"), "true");
		await page.close();
	});

	it("leaves a card that does not opt in saying on the full tool", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		/*
		 * The backward-compatibility half for cards, which is where the default matters most: every existing
		 * consumer's cards go through this path. It has to be run first, not just looked at: this card's seed
		 * is a single `fields` output, so nothing is truncated until the tool produces its actual group of
		 * three. Then the cap of one bites and the notice must still be the old sentence, as text.
		 */
		const seeded = page.locator("tool-host[tool=percentiles][data-seed]");
		await seeded.scrollIntoViewIfNeeded();
		await seeded.locator(".tb-facade").click();
		await seeded.locator(".tb-form").waitFor();
		await seeded.locator(".tb-run").click();
		await seeded.locator(".tb-output > *").first().waitFor({ timeout: 15_000 });

		/*
		 * Asserted on the output's text rather than by waiting for `.tb-more` to appear. A missing element
		 * times out after 30 s and reports only which selector it wanted, which says nothing about what the
		 * card actually drew; this way a failure prints the DOM that exists.
		 */
		const text = ((await seeded.locator(".tb-output").textContent()) ?? "").replace(/\s+/g, " ").trim();
		assert.match(text, /on the full tool/, `a card that did not opt in must keep the old notice. Card drew: ${text}`);
		assert.equal(await seeded.locator(".tb-disclose").count(), 0, "no opt-in, no button");
		assert.equal(await seeded.locator(".tb-rest").count(), 0, "and nothing hidden in the DOM either");
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

	it("keeps a card's chart the same size when the rest is expanded (#100)", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const h = page.locator("#expandable-chart-card");
		await h.scrollIntoViewIfNeeded();
		await h.locator(".tb-facade").click();
		await h.locator(".tb-run").click();
		await h.locator(".tb-disclose").waitFor({ timeout: 15_000 });
		await settled(page);
		const size = () =>
			h.locator(".tb-out-chart svg").first().evaluate((svg) => {
				const box = svg.getBoundingClientRect();
				return { width: Math.round(box.width), height: Math.round(box.height), card: svg.closest(".tb-out-chart")?.classList.contains("tb-out-chart-card") };
			});
		const before = await size();
		assert.equal(before.card, true, "a card draws its chart at card size");
		await h.locator(".tb-disclose").click();
		await h.locator(".tb-disclose[aria-expanded=true]").waitFor();
		// Expanding draws the output again, and a chart's first drawing is replaced by its measured one (#210).
		await settled(page);
		const after = await size();
		assert.deepEqual(after, before, "expanding shows more parts; it does not redraw the chart already on screen at another size");
		await page.close();
	});
});

describe("bar chart geometry", () => {
	/*
	 * Reported by looking at the histogram tool: the first bar was drawn across the y axis. The cause is in
	 * the renderer rather than the tool, so it is asserted on geometry rather than on the tool's numbers.
	 *
	 * Browser-only, and not because of convenience: the chart is SVG produced from a layout computed at
	 * render time, so the only place the coordinates exist is a document.
	 */
	it("keeps every bar inside the plot area, not over the axis", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=histogram`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		// histogram is `autoRun`, so its default chart is drawn on arrival and there is no Run to press.
		await page.locator("#host >> .tb-out-chart svg").waitFor({ timeout: 15_000 });
		await settled(page);

		const geometry = await page.evaluate(() => {
			const svg = document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-chart svg");
			const bars = [...(svg?.querySelectorAll("rect.tb-bar") ?? [])];
			const num = (el: Element | null | undefined, name: string) => Number(el?.getAttribute(name));
			/*
			 * ⚠️ There are TWO `.tb-axis` lines, the vertical one first. Reading the plot's right edge from
			 * `querySelector(".tb-axis")` picks the y axis, whose x2 is the LEFT edge, and the test then
			 * failed claiming a bar at 572 was past an edge at 56. Taking the extremes across both lines is
			 * the reading that cannot pick the wrong one.
			 */
			const axes = [...(svg?.querySelectorAll("line.tb-axis") ?? [])];
			return {
				count: bars.length,
				axes: axes.length,
				left: Math.min(...axes.map((line) => num(line, "x1"))),
				right: Math.max(...axes.map((line) => num(line, "x2"))),
				first: num(bars[0], "x"),
				lastEnd: num(bars.at(-1), "x") + num(bars.at(-1), "width"),
			};
		});

		assert.ok(geometry.count > 1, `expected a bar chart, got ${geometry.count} bars`);
		assert.equal(geometry.axes, 2, "one vertical axis and one horizontal, which is what makes the bounds below meaningful");
		assert.ok(
			geometry.first >= geometry.left,
			`the first bar starts at ${geometry.first}, left of the axis at ${geometry.left}: it is drawn over the axis`,
		);
		assert.ok(
			geometry.lastEnd <= geometry.right,
			`the last bar ends at ${geometry.lastEnd}, past the plot's right edge at ${geometry.right}`,
		);
		await page.close();
	});

	it("still starts a line series at its first point", async () => {
		const page = await browser.newPage();
		/*
		 * The other half of the fix: only a bar chart gets the padding. A line genuinely begins at its first
		 * point, and padding its domain would open a gap before the data. queue-explorer draws lines only.
		 */
		await page.goto(`${BASE}/tool.html?id=queue-explorer`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-out-chart svg").waitFor({ timeout: 15_000 });
		await settled(page);

		const flush = await page.evaluate(() => {
			const svg = document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-chart svg");
			// Same hazard as above: both axes share the class, and both have x1 at the left edge, so this one
			// is safe either way. Spelled out so nobody "tidies" it into reading x2.
			const axisLeft = Number(svg?.querySelector("line.tb-axis")?.getAttribute("x1"));
			const path = svg?.querySelector("path.tb-line, path[class*=tb-line]")?.getAttribute("d") ?? "";
			const firstX = Number(/^M\s*([\d.-]+)/.exec(path)?.[1]);
			return { axisLeft, firstX, path: path.slice(0, 40) };
		});
		assert.ok(
			Math.abs(flush.firstX - flush.axisLeft) < 1,
			`a line should start on the axis at ${flush.axisLeft}, started at ${flush.firstX} (d="${flush.path}")`,
		);
		await page.close();
	});
});

describe("charts over whole-number x values (#111)", () => {
	/*
	 * Every expectation here is worked out from the data in `bench/fixtures/discrete-series`, not read off
	 * the renderer: frames 1 to 20, a deadline of 20n + 70 ms, arrivals of 20n + 30, and frame 5 lost.
	 */
	async function chartFor(value: string) {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		/*
		 * Through the host API, and waiting on the run itself. Selecting the option and waiting for "a chart"
		 * reads whichever chart is on screen first, which for an autoRun tool can be the default case.
		 */
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		await page.evaluate(async (c) => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: c };
			await host.run();
		}, value);
		await page.locator("#host >> .tb-out-chart svg").waitFor({ timeout: 15_000 });
		await settled(page);
		const read = await page.evaluate(() => {
			const svg = document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-chart svg");
			const num = (el: Element, name: string) => Number(el.getAttribute(name));
			const ticks = [...(svg?.querySelectorAll("text.tb-tick") ?? [])].map((t) => ({
				text: t.textContent ?? "",
				x: num(t, "x"),
				y: num(t, "y"),
				anchor: t.getAttribute("text-anchor"),
			}));
			const bars = [...(svg?.querySelectorAll("rect.tb-bar") ?? [])].map((r) => ({
				x: num(r, "x"),
				y: num(r, "y"),
				width: num(r, "width"),
				height: num(r, "height"),
				series: [...r.classList].find((c) => /^tb-s\d$/.test(c)) ?? "",
			}));
			const grid = [...(svg?.querySelectorAll("line.tb-grid") ?? [])].map((l) => num(l, "y1"));
			return { ticks, bars, grid };
		});
		await page.close();
		// y labels are right-anchored at the axis, x labels centred under the plot.
		return {
			...read,
			yLabels: read.ticks.filter((t) => t.anchor === "end").map((t) => t.text),
			xLabels: read.ticks.filter((t) => t.anchor === "middle").map((t) => t.text),
		};
	}

	async function marksFor(value: string) {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		await page.evaluate(async (c) => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: c };
			await host.run();
		}, value);
		await settled(page);
		await page.locator("#host >> .tb-out-chart svg .tb-marker").first().waitFor({ timeout: 15_000 });
		const read = await page.evaluate(() => {
			const figure = document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-chart");
			const markers = [...(figure?.querySelectorAll("svg path.tb-marker") ?? [])];
			const bySeries = (cls: string) => markers.filter((m) => m.classList.contains(cls));
			const shapeOf = (cls: string) => (bySeries(cls)[0]?.getAttribute("d") ?? "").replace(/[\d.,-]+/g, "#");
			return {
				lines: figure?.querySelectorAll("svg path.tb-line").length ?? -1,
				counts: ["tb-s1", "tb-s2", "tb-s3"].map((c) => bySeries(c).length),
				shapes: ["tb-s1", "tb-s2", "tb-s3"].map(shapeOf),
				keys: [...(figure?.querySelectorAll(".tb-legend .tb-swatch-marker") ?? [])].map((k) => k.getAttribute("data-marker")),
				svgs: figure?.querySelectorAll("svg").length ?? -1,
			};
		});
		await page.close();
		return read;
	}

	it("draws a marker at every value, one shape per series, and keys the legend by it (contract 4)", async () => {
		// "Arrives" has 19 values (frame 5 is lost), the two "Released" series 20 each.
		const marks = await marksFor("markers");
		assert.deepEqual(marks.counts, [19, 20, 20]);
		assert.equal(new Set(marks.shapes).size, 3, `three different marker shapes: ${marks.shapes.join(" | ")}`);
		assert.ok(marks.lines > 0, "markers: true keeps the line");
		assert.deepEqual(marks.keys, ["0", "1", "2"], "each legend key names its series' marker");
		assert.equal(marks.svgs, 1, "the keys are not extra SVGs: a chart is still one picture");
	});

	it("draws points alone, with no line to suggest a value between two frames (contract 4)", async () => {
		const marks = await marksFor("points");
		assert.equal(marks.lines, 0);
		assert.deepEqual(marks.counts, [19, 20, 20]);
	});

	it("fills an area from zero, and titles a second axis", async () => {
		// The send rate never falls below 24, but an area's height is its value, so the axis starts at 0.
		const area = await chartFor("area");
		assert.equal(area.yLabels[0], "0");
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		const titles = await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: "combo" };
			await host.run();
			return [...(host.shadowRoot?.querySelectorAll(".tb-plot text.tb-axis-label") ?? [])].map((t) => t.textContent);
		});
		assert.deepEqual(titles, ["Hour", "Calls", "Dropped (%)"]);
		await page.close();
	});

	it("labels a frame axis with whole frames, and a time axis in round steps", async () => {
		// Data runs from 50 (frame 1 arrives) to 470 (frame 20's deadline). Five intervals of 100 cover it.
		const chart = await chartFor("lines");
		assert.deepEqual(chart.yLabels, ["0", "100", "200", "300", "400", "500"]);
		assert.deepEqual(chart.xLabels, ["5", "10", "15", "20"]);
	});

	it("puts two bar series side by side, never on top of each other", async () => {
		const chart = await chartFor("two-bars");
		const first = chart.bars.filter((b) => b.series === "tb-s1");
		const second = chart.bars.filter((b) => b.series === "tb-s2");
		assert.equal(first.length, 20);
		assert.equal(second.length, 20);
		first.forEach((a, i) => {
			const b = second[i];
			assert.ok(b, `frame ${i + 1} has a bar in each series`);
			assert.ok(a.x + a.width <= b.x + 1e-6, `frame ${i + 1}: the first series ends at ${a.x + a.width}, the second starts at ${b.x}`);
		});
		// Repair at 330 leaves frames 5 to 12 late by 160, 140 ... 20, so the tallest second-series bar is frame 5.
		const tallest = second.reduce((best, bar, i) => (bar.height > (second[best]?.height ?? 0) ? i : best), 0);
		assert.equal(tallest, 4);
	});

	it("draws nothing for a series of zeros, on an axis that does not go below zero", async () => {
		const chart = await chartFor("zero-bars");
		assert.ok(chart.bars.every((b) => b.height === 0), `bar heights: ${chart.bars.map((b) => b.height).join(",")}`);
		assert.ok(chart.yLabels.every((label) => !label.startsWith("-") && !label.startsWith("−")), `y labels: ${chart.yLabels.join(", ")}`);
		// The value, not its spelling: a 0.2-step axis prints two decimals, which is the formatter's rule and not this fix.
		assert.equal(Number(chart.yLabels[0]), 0);
	});

	it("grows bars up and down from zero, not from the floor of the plot", async () => {
		// Values -10, 10, -30, 40: the scale is -40 to 40, and every bar has one edge on the zero gridline.
		const chart = await chartFor("signed-bars");
		const zeroTick = chart.ticks.find((t) => t.anchor === "end" && t.text === "0");
		assert.ok(zeroTick, `a 0 on the y axis, got ${chart.yLabels.join(", ")}`);
		// The gridline the 0 label sits on: the nearest, since the label is centred on it by the face's measured box.
		const zeroY = chart.grid.reduce((best, y) => (Math.abs(y - zeroTick.y) < Math.abs(best - zeroTick.y) ? y : best), Number.POSITIVE_INFINITY);
		const [minus10, plus10, minus30, plus40] = chart.bars;
		assert.ok(minus10 && plus10 && minus30 && plus40, "four bars");
		assert.ok(Math.abs(plus10.y + plus10.height - zeroY) < 0.5, "a positive bar ends on zero");
		assert.ok(Math.abs(minus10.y - zeroY) < 0.5, "a negative bar starts on zero");
		assert.ok(Math.abs(plus40.height - 4 * plus10.height) < 0.5, "40 is four times as tall as 10");
		assert.ok(Math.abs(minus30.height - 3 * minus10.height) < 0.5, "-30 is three times as tall as -10");
	});

	it("widens the scale to a threshold above the data, labels it, and keeps it out of the data (#114)", async () => {
		// Delays peak at 210 ms; the 400 ms limit is above all of them and must still be drawn.
		const chart = await chartFor("thresholds");
		assert.equal(chart.yLabels.at(-1), "400");
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: "thresholds" };
			await host.run();
		});
		await settled(page);
		const read = await page.evaluate(() => {
			const figure = document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-chart");
			return {
				rules: [...(figure?.querySelectorAll("line.tb-threshold") ?? [])].map((l) => l.getAttribute("data-tone")),
				labels: [...(figure?.querySelectorAll("text.tb-threshold-label") ?? [])].map((t) => t.textContent),
				columns: figure?.querySelectorAll(".tb-chart-data thead th").length,
				legend: figure?.querySelectorAll(".tb-legend li").length ?? 0,
			};
		});
		assert.deepEqual(read.rules, ["warn", "bad"]);
		assert.deepEqual(read.labels, ["150 ms, G.114 preferred", "400 ms, G.114 planning limit"]);
		assert.equal(read.columns, 2, "the data table has the x and the one series, not the thresholds");
		assert.equal(read.legend, 0, "one series and two thresholds: still no legend");
		await page.close();
	});

	it("draws a box from q1 to q3 with its median, whiskers and outliers, and reads all five numbers (#122)", async () => {
		const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		const read = await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: "box" };
			await host.run();
			const svg = host.shadowRoot?.querySelector(".tb-plot svg") as SVGSVGElement;
			const n = (el: Element | null, a: string) => Number(el?.getAttribute(a));
			const boxes = [...svg.querySelectorAll("rect.tb-box")];
			const medians = [...svg.querySelectorAll("line.tb-median")];
			return {
				boxes: boxes.length,
				outliers: svg.querySelectorAll("circle.tb-outlier").length,
				// Mobile, morning: q1 8, median 12, q3 18. The box is 10 units of value tall, the median 6 above q1... below q3.
				mobile: { top: n(boxes[2] ?? null, "y"), height: n(boxes[2] ?? null, "height"), median: n(medians[2] ?? null, "y1") },
				heads: host.shadowRoot?.querySelectorAll(".tb-chart-data thead th").length,
			};
		});
		assert.equal(read.boxes, 6, "three networks, two series");
		assert.equal(read.outliers, 5, "22, 41 and 47 in the morning; 31 and 55 in the evening");
		// (q3 - median) / (q3 - q1) = (18 - 12) / (18 - 8) = 0.6 of the box, measured from its top.
		assert.ok(Math.abs((read.mobile.median - read.mobile.top) / read.mobile.height - 0.6) < 0.02, JSON.stringify(read.mobile));
		assert.equal(read.heads, 1 + 2 * 5, "the x, then low, q1, median, q3 and high for each series");
		await settled(page);
		await page.locator("#host >> .tb-plot").focus();
		await page.keyboard.press("End");
		const row = await page.evaluate(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-readout li")?.textContent);
		assert.equal(row, "median 12 ms (q1 8, q3 18; 4 to 30)Morning");
		await page.close();
	});

	it("sizes bubbles by area across the whole chart, with a key and the size in the table (#127)", async () => {
		// 9,000 calls is the largest, 24 units of radius; 1,000 is a ninth of the area, so a third of the radius.
		const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		const read = await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: "bubble" };
			await host.run();
			const root = host.shadowRoot;
			const radius = (s: number) => Number(root?.querySelector(`.tb-plot circle.tb-bubble[data-s="${s}"]`)?.getAttribute("r"));
			return {
				radii: [0, 1, 2, 3].map(radius),
				key: [...(root?.querySelectorAll(".tb-size-key text") ?? [])].map((t) => t.textContent),
				head: [...(root?.querySelectorAll(".tb-chart-data thead th") ?? [])].map((t) => t.textContent),
			};
		});
		const [europe, americas, , africa] = read.radii as number[];
		assert.equal(americas, 24);
		assert.ok(Math.abs((africa as number) / 24 - 1 / 3) < 0.01, `a ninth of the area is a third of the radius: ${africa}`);
		assert.ok(Math.abs((europe as number) / 24 - Math.sqrt(4 / 9)) < 0.01, `4,000 of 9,000: ${europe}`);
		assert.equal(read.key[0], "9,000");
		assert.deepEqual(read.head.at(-1), "Calls");
		await page.close();
	});

	it("draws series at their own x, lists every point, and reads out the nearest one (#120)", async () => {
		const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		const read = await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: "scatter" };
			await host.run();
			const root = host.shadowRoot;
			return {
				markers: root?.querySelectorAll(".tb-plot .tb-marker").length,
				rows: root?.querySelectorAll(".tb-chart-data tbody tr").length,
				first: [...(root?.querySelector(".tb-chart-data tbody tr")?.children ?? [])].map((c) => c.textContent),
			};
		});
		assert.equal(read.markers, 13, "six points and seven");
		assert.equal(read.rows, 13, "one table row per point, since the series share no x");
		assert.deepEqual(read.first, ["Quiet room", "200", "18"]);
		// From the keyboard the points go left to right: the first is (200, 18), the second (250, 26).
		await settled(page);
		await page.locator("#host >> .tb-plot").focus();
		await page.keyboard.press("ArrowRight");
		const card = await page.evaluate(() => {
			const r = document.querySelector("#host")?.shadowRoot?.querySelector(".tb-readout");
			return { title: r?.querySelector(".tb-readout-title")?.textContent, row: r?.querySelector("li")?.textContent };
		});
		assert.deepEqual(card, { title: "End-of-speech timeout 250 ms", row: "26 %Street noise" });
		await page.close();
	});

	it("fills a band beneath the lines, breaks it at a gap, and reads it as a range (#119)", async () => {
		const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		const read = await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: "band" };
			await host.run();
			const svg = host.shadowRoot?.querySelector(".tb-plot svg") as SVGSVGElement;
			const all = [...svg.querySelectorAll("path")];
			return {
				bands: svg.querySelectorAll("path.tb-band").length,
				bandFirst: all.findIndex((p) => p.classList.contains("tb-band")) < all.findIndex((p) => p.classList.contains("tb-line")),
				heads: [...(host.shadowRoot?.querySelectorAll(".tb-chart-data thead th") ?? [])].map((th) => th.textContent),
			};
		});
		assert.equal(read.bands, 2, "second 7 has no data, so the band is two pieces");
		assert.ok(read.bandFirst, "the band is drawn beneath the median line");
		assert.deepEqual(read.heads, ["Second", "Median (ms)", "p5 to p95, low (ms)", "p5 to p95, high (ms)"]);
		await settled(page);
		await page.locator("#host >> .tb-plot").focus();
		const rows = await page.evaluate(() => [...(document.querySelector("#host")?.shadowRoot?.querySelectorAll(".tb-readout li") ?? [])].map((li) => li.textContent));
		// Second 1: median 31, spread 4, so 29 to 35.
		assert.deepEqual(rows, ["31 msMedian", "29 to 35 msp5 to p95"]);
		await page.close();
	});

	it("puts powers of ten evenly apart on a log axis, and leaves out what it cannot show (#118)", async () => {
		const chart = await chartFor("log");
		assert.deepEqual(chart.yLabels, ["0.1", "1", "10", "100"]);
		assert.deepEqual(chart.xLabels, ["0.01", "0.1", "1", "10"]);
		const ys = chart.ticks.filter((t) => t.anchor === "end").map((t) => t.y);
		const gaps = ys.slice(1).map((y, i) => Math.abs(y - (ys[i] as number)));
		assert.ok(gaps.every((g) => Math.abs(g - (gaps[0] as number)) < 0.5), `decades equally spaced: ${gaps.join(", ")}`);

		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		const read = await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: "log-zero" };
			await host.run();
			const root = host.shadowRoot;
			return {
				markers: root?.querySelectorAll(".tb-plot .tb-marker").length,
				caption: root?.querySelector(".tb-chart-data caption")?.textContent ?? "",
				cells: [...(root?.querySelectorAll(".tb-chart-data tbody td") ?? [])].map((td) => td.textContent),
			};
		});
		assert.equal(read.markers, 4, "five values, one of them zero: four are drawn");
		assert.match(read.caption, /1 value at or below zero not drawn on a log axis/);
		assert.deepEqual(read.cells, ["12", "0", "150", "1,200", "40"], "the table still has every value");
		await page.close();
	});

	it("draws a step as runs and risers, rising only where the value changes (#117)", async () => {
		// Depths 40 40 40 60 60 60 60 80 80 60 60 40: four changes, so four risers, and never a slope.
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		const d = await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: "step" };
			await host.run();
			return host.shadowRoot?.querySelector(".tb-plot path.tb-line.tb-s1")?.getAttribute("d") ?? "";
		});
		assert.ok(d.startsWith("M") && !d.slice(1).includes("L"), `a step has no sloped segment: ${d.slice(0, 60)}`);
		const ys = [...d.matchAll(/V([\d.]+)/g)].map((m) => m[1]);
		const changes = ys.filter((y, i) => i > 0 && y !== ys[i - 1]).length + (ys[0] !== /M[\d.]+,([\d.]+)/.exec(d)?.[1] ? 1 : 0);
		assert.equal(changes, 4);
		await page.close();
	});

	it("draws horizontal bars rightward from zero, names on the left, the threshold vertical (#116)", async () => {
		const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		const read = await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: "horizontal" };
			await host.run();
			const svg = host.shadowRoot?.querySelector(".tb-plot svg");
			const num = (el: Element, a: string) => Number(el.getAttribute(a));
			const bars = [...(svg?.querySelectorAll("rect.tb-bar") ?? [])].map((r) => ({ x: num(r, "x"), y: num(r, "y"), w: num(r, "width"), i: num(r, "data-i") }));
			const rule = svg?.querySelector("line.tb-threshold");
			const names = [...(svg?.querySelectorAll("text.tb-tick[text-anchor=end]") ?? [])].map((t) => t.textContent);
			return { bars, rule: rule ? { x1: num(rule, "x1"), x2: num(rule, "x2") } : null, names };
		});
		assert.deepEqual(read.names, ["Same city", "Across a continent", "Through a relay"]);
		assert.ok(read.rule && read.rule.x1 === read.rule.x2, "the threshold is a vertical rule");
		// Row 0: 25 + 10 + 40 + 15 = 90 ms, starting at zero; its four segments run end to end.
		const row0 = read.bars.filter((b) => b.i === 0).sort((a, b) => a.x - b.x);
		assert.equal(row0.length, 4);
		for (let k = 1; k < row0.length; k++) {
			const prev = row0[k - 1] as { x: number; w: number };
			assert.ok(Math.abs((row0[k] as { x: number }).x - (prev.x + prev.w)) < 0.5, "segments meet");
		}
		const total = row0.reduce((sum, b) => sum + b.w, 0);
		const row2 = read.bars.filter((b) => b.i === 2).reduce((sum, b) => sum + b.w, 0);
		assert.ok(Math.abs(row2 / total - 195 / 90) < 0.02, "rows are as long as their totals, 195 against 90");

		await settled(page);
		await page.locator("#host >> .tb-plot").focus();
		await page.keyboard.press("ArrowDown");
		const title = await page.evaluate(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-readout-title")?.textContent);
		assert.equal(title, "Path Across a continent", "the down arrow steps through the rows");
		await page.close();
	});

	it("mirrors a pyramid: both halves on one row, every number a magnitude (#125)", async () => {
		const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		const read = await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: "pyramid" };
			await host.run();
			const root = host.shadowRoot;
			const svg = root?.querySelector(".tb-plot svg");
			const n = (el: Element, a: string) => Number(el.getAttribute(a));
			const desk = [...(svg?.querySelectorAll("rect.tb-bar[data-i='2']") ?? [])].map((r) => ({ x: n(r, "x"), w: n(r, "width"), y: n(r, "y") }));
			return {
				ticks: [...(svg?.querySelectorAll("text.tb-tick[text-anchor=middle]") ?? [])].map((t) => t.textContent),
				desk,
				cells: [...(root?.querySelectorAll(".tb-chart-data tbody tr:nth-child(3) td") ?? [])].map((td) => td.textContent),
			};
		});
		assert.ok(read.ticks.every((t) => !String(t).startsWith("-")), `no negative labels: ${read.ticks.join(", ")}`);
		// Desk phone: 64 up and 64 down, so two bars of equal length meeting at zero, on the same row.
		const [up, down] = read.desk;
		assert.ok(up && down && Math.abs(up.w - down.w) < 0.5 && up.y === down.y, JSON.stringify(read.desk));
		assert.deepEqual(read.cells, ["64", "64"], "magnitudes in the table, and no total column for a mirror");
		await page.close();
	});

	it("stacks parts end to end, either side of zero, beside a bar that is not stacked (#115)", async () => {
		// A: 5 then 2 on top (0 to 5, 5 to 7). B: -3 then -4 below (0 to -3, -3 to -7). "Alone" is 4 at both.
		const chart = await chartFor("stacked-signed");
		const at = (series: string, i: number) => chart.bars.filter((b) => b.series === series)[i];
		const [a1, a2, b1, b2, alone] = [at("tb-s1", 0), at("tb-s2", 0), at("tb-s1", 1), at("tb-s2", 1), at("tb-s3", 0)];
		assert.ok(a1 && a2 && b1 && b2 && alone);
		assert.ok(Math.abs(a2.y + a2.height - a1.y) < 0.5, "the second part starts where the first ends");
		assert.ok(Math.abs(a1.height / a2.height - 5 / 2) < 0.05, "heights in the ratio of the values, 5 to 2");
		assert.ok(Math.abs(b2.y - (b1.y + b1.height)) < 0.5, "below zero, the second part continues downward");
		assert.equal(a1.x, a2.x, "a stack is one bar");
		assert.ok(alone.x >= a1.x + a1.width - 0.01, "the unstacked bar sits beside the stack, not on it");
		await (async () => {
			const page = await browser.newPage();
			await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
			await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
			const totals = await page.evaluate(async () => {
				const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
				host.values = { case: "stacked-signed" };
				await host.run();
				const table = host.shadowRoot?.querySelector(".tb-chart-data table");
				return [...(table?.querySelectorAll("tbody tr") ?? [])].map((tr) => tr.lastElementChild?.textContent);
			});
			assert.deepEqual(totals, ["7", "-7"], "the data table carries each stack's total");
			await page.close();
		})();
	});

	it("draws named categories in the order given, labelled with their text, from zero (#113)", async () => {
		const chart = await chartFor("categories");
		assert.deepEqual(chart.xLabels, ["Mesh", "MCU", "Selective forwarding"]);
		assert.equal(chart.yLabels[0], "0", "a bar chart's axis starts at zero even when every value is above 30");
		// Two series, three categories: six bars, the two at each category side by side.
		assert.equal(chart.bars.length, 6);
		const centre = (b: { x: number; width: number }) => b.x + b.width / 2;
		const first = chart.bars.filter((b) => b.series === "tb-s1").map(centre);
		assert.ok(first[0] !== undefined && first[1] !== undefined && first[2] !== undefined && first[0] < first[1] && first[1] < first[2], "left to right in the given order");
	});

	it("labels as many categories as fit, and keeps every one in the table and the readout (#113)", async () => {
		const chart = await chartFor("many-categories");
		assert.ok(chart.xLabels.length < 24 && chart.xLabels.length >= 6, `${chart.xLabels.length} labels for 24 categories`);
		assert.equal(chart.xLabels[0], "00:00");
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: "many-categories" };
			await host.run();
		});
		await settled(page);
		// The measured drawing, not the first one: focused and stepped through, the first was replaced under the keys in CI.
		await page.locator("#host >> .tb-plot svg").waitFor({ timeout: 15_000 });
		await settled(page);
		await page.locator("#host >> .tb-plot").focus();
		await page.keyboard.press("End");
		const read = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			return {
				title: root?.querySelector(".tb-readout-title")?.textContent ?? "",
				rows: [...(root?.querySelectorAll(".tb-chart-data tbody th") ?? [])].map((th) => th.textContent),
			};
		});
		assert.equal(read.title, "Hour 23:00");
		assert.equal(read.rows.length, 24);
		assert.equal(read.rows[13], "13:00");
		await page.close();
	});

	it("puts a bar chart's x labels on bars, not between them", async () => {
		// The histogram's bins are two apart; any label must name one of them.
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=histogram`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		await page.evaluate(() => (document.querySelector("#host") as HTMLElement & { run(): Promise<void> }).run());
		await page.locator("#host >> .tb-out-chart svg").waitFor({ timeout: 15_000 });
		await settled(page);
		const geometry = await page.evaluate(() => {
			const svg = document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-chart svg");
			const centres = [...(svg?.querySelectorAll("rect.tb-bar") ?? [])].map((r) => Number(r.getAttribute("x")) + Number(r.getAttribute("width")) / 2);
			const labels = [...(svg?.querySelectorAll("text.tb-tick[text-anchor=middle]") ?? [])].map((t) => Number(t.getAttribute("x")));
			return { centres, labels };
		});
		await page.close();
		assert.ok(geometry.labels.length > 1, "more than one x label");
		for (const x of geometry.labels) {
			assert.ok(geometry.centres.some((c) => Math.abs(c - x) < 0.5), `x label at ${x} is not on any bar (${geometry.centres.join(", ")})`);
		}
	});
});

describe("the chart readout (#112)", () => {
	/*
	 * Values come from bench/fixtures/discrete-series, worked out by hand: at frame 6 the "markers" case has
	 * Arrives 150, Released fast 250 and Released timeout 330.
	 */
	async function chartCase(value: string) {
		const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		await page.evaluate(async (c) => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: c };
			await host.run();
		}, value);
		await page.locator("#host >> .tb-plot svg").waitFor({ timeout: 15_000 });
		await settled(page);
		await page.locator("#host >> .tb-plot").scrollIntoViewIfNeeded();
		return page;
	}
	const card = (page: import("playwright").Page) =>
		page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			const readout = root?.querySelector(".tb-readout") as HTMLElement | null;
			return {
				hidden: readout?.hidden ?? true,
				title: readout?.querySelector(".tb-readout-title")?.textContent ?? "",
				rows: [...(readout?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? ""),
				spoken: root?.querySelector(".tb-out-chart [role=status]")?.textContent ?? "",
				hot: root?.querySelectorAll(".tb-plot .tb-hot").length ?? 0,
			};
		});
	/** Point at frame n: its x position in the plot, from the axis geometry rather than a guess. */
	async function pointAt(page: import("playwright").Page, frame: number) {
		await settled(page);
		const box = await page.locator("#host >> .tb-plot svg").boundingBox();
		assert.ok(box);
		// Frames 1 to 20 span the x axis edge to edge, and the chart is laid out at its measured width (#210), so
		// the axis's ends are read from the drawing rather than assumed.
		const axis = await page.evaluate(() => {
			const svg = document.querySelector("#host")!.shadowRoot!.querySelector<SVGSVGElement>(".tb-plot svg")!;
			const line = svg.querySelectorAll(".tb-axis")[1]!;
			return { from: Number(line.getAttribute("x1")), to: Number(line.getAttribute("x2")), width: svg.viewBox.baseVal.width };
		});
		const vbX = axis.from + ((frame - 1) / 19) * (axis.to - axis.from);
		await page.mouse.move(box.x + (vbX / axis.width) * box.width, box.y + box.height * 0.4);
	}

	it("shows every series at the nearest frame, with the data's values, and hides when the pointer leaves", async () => {
		const page = await chartCase("markers");
		await pointAt(page, 6);
		const shown = await card(page);
		assert.equal(shown.hidden, false);
		assert.equal(shown.title, "Frame 6");
		assert.deepEqual(shown.rows, ["150 msArrives", "250 msReleased, fast", "330 msReleased, timeout"]);
		assert.equal(shown.hot, 3, "the three markers at frame 6 are lifted");
		await page.mouse.move(2, 2);
		assert.equal((await card(page)).hidden, true);
		await page.close();
	});

	it("steps through the values from the keyboard, and reads each one out", async () => {
		const page = await chartCase("markers");
		await settled(page);
		await page.locator("#host >> .tb-plot").focus();
		assert.equal((await card(page)).title, "Frame 1", "focus shows the first value");
		await page.keyboard.press("ArrowRight");
		const second = await card(page);
		assert.equal(second.title, "Frame 2");
		assert.match(second.spoken, /^Frame 2: Arrives 70 ms, Released, fast 70 ms, Released, timeout 70 ms$/);
		await page.keyboard.press("End");
		assert.equal((await card(page)).title, "Frame 20");
		await page.keyboard.press("Escape");
		assert.equal((await card(page)).hidden, true);
		await page.close();
	});

	it("says what the tool wrote, where it wrote it, and the default everywhere else", async () => {
		const page = await chartCase("readout");
		await pointAt(page, 5);
		const lost = await card(page);
		assert.equal(lost.title, "Frame 5, lost and resent");
		assert.deepEqual(lost.rows, ["170 msDeadline", "250 ms, 80 ms lateReleased"]);
		await pointAt(page, 12);
		const fine = await card(page);
		assert.equal(fine.title, "Frame 12", "no title written for frame 12, so the default");
		assert.deepEqual(fine.rows, ["310 msDeadline", "270 msReleased"], "and no note, since it was on time");
		await page.close();
	});

	it("lights the matching table rows from the chart, and moves the chart from a row (#124)", async () => {
		const page = await chartCase("linked");
		const hot = () =>
			page.evaluate(() => {
				const root = document.querySelector("#host")?.shadowRoot;
				return {
					linked: [...(root?.querySelectorAll(".tb-out-table tr.tb-hot") ?? [])].map((r) => r.getAttribute("data-key")),
					own: [...(root?.querySelectorAll(".tb-chart-data tr.tb-hot") ?? [])].map((r) => r.getAttribute("data-i")),
				};
			});
		// Frames 4 to 9 span the plot edge to edge; frame 6 is the third of six.
		await settled(page);
		const box = await page.locator("#host >> .tb-plot svg").boundingBox();
		assert.ok(box);
		await page.mouse.move(box.x + ((56 + (2 / 5) * (620 - 56)) / 640) * box.width, box.y + box.height * 0.4);
		assert.deepEqual(await hot(), { linked: ["6"], own: ["2"] }, "the linked row for frame 6, and the data table's third row");

		await page.locator('#host >> .tb-out-table tr[data-key="8"]').hover();
		assert.equal((await card(page)).title, "Frame 8", "pointing at a row moves the readout to its frame");
		assert.deepEqual((await hot()).linked, ["8"]);
		await page.mouse.move(2, 2);
		assert.deepEqual(await hot(), { linked: [], own: [] }, "leaving clears both");
		await page.close();
	});

	it("stays inside the chart near its right edge", async () => {
		const page = await chartCase("markers");
		await pointAt(page, 20);
		const fits = await page.evaluate(() => {
			const figure = document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-chart") as HTMLElement;
			const readout = figure.querySelector(".tb-readout") as HTMLElement;
			const f = figure.getBoundingClientRect();
			const r = readout.getBoundingClientRect();
			return { right: r.right, edge: f.right, flipped: readout.hasAttribute("data-flip") };
		});
		assert.ok(fits.flipped && fits.right <= fits.edge, `card right ${fits.right}, chart right ${fits.edge}`);
		await page.close();
	});
});

describe("heatmaps (#121)", () => {
	async function heatmapCase(value: string) {
		const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
		const scripts: string[] = [];
		page.on("request", (request) => {
			if (request.resourceType() === "script") scripts.push(request.url());
		});
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		await page.evaluate(async (c) => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: c };
			await host.run();
		}, value);
		await page.locator("#host >> .tb-heatmap svg").waitFor({ timeout: 15_000 });
		await settled(page);
		return { page, scripts };
	}

	it("draws one cell per value, hatches the missing one, and darkens with the value", async () => {
		const { page } = await heatmapCase("heatmap");
		const read = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			const cells = [...(root?.querySelectorAll(".tb-cell") ?? [])];
			// color-mix in OKLab is reported in OKLab, whose first number is the lightness.
			const lum = (el: Element) => Number(/oklab\(([\d.]+)/.exec(getComputedStyle(el).fill)?.[1]);
			const at = (r: number, c: number) => cells.find((x) => x.getAttribute("data-r") === String(r) && x.getAttribute("data-c") === String(c)) as Element;
			return {
				cells: cells.length,
				empty: cells.filter((c) => c.hasAttribute("data-empty")).length,
				// Monday: 00:00 is the low, 08:00 between, 18:00 the high.
				order: [lum(at(0, 0)), lum(at(0, 4)), lum(at(0, 9))],
				key: [...(root?.querySelectorAll(".tb-heatmap svg text.tb-tick") ?? [])].slice(-2).map((t) => t.textContent),
			};
		});
		assert.equal(read.cells, 84, "seven days of twelve hours");
		assert.equal(read.empty, 1, "Saturday 02:00 was not measured");
		const [low, middle, high] = read.order as [number, number, number];
		assert.ok(low > middle && middle > high, `lighter for less: ${read.order.join(", ")}`);
		await page.close();
	});

	it("reads out the cell under the keyboard, and moves through the grid both ways", async () => {
		const { page } = await heatmapCase("heatmap-diverging");
		await settled(page);
		await page.locator("#host >> .tb-plot").focus();
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowRight");
		const card = await page.evaluate(() => {
			const r = document.querySelector("#host")?.shadowRoot?.querySelector(".tb-readout");
			return { title: r?.querySelector(".tb-readout-title")?.textContent, row: r?.querySelector("li")?.textContent };
		});
		assert.deepEqual(card, { title: "Region North America, Service Media relay", row: "-12 msChange in p95 latency" });
		await page.close();
	});

	it("is its own chunk, sharing a common one with the series chart but not importing it", async () => {
		/*
		 * Asserted on the built chunk's imports rather than on what a page fetched: a page host preloads every
		 * kind its tool declares, and the gallery fixture declares series too, so the fetch list could not tell
		 * a heatmap that needs the chart code from one that merely shares a page with it.
		 */
		const { page, scripts } = await heatmapCase("heatmap");
		const heatmapUrl = scripts.find((url) => /\/heatmap-[^/]+\.js$/.test(url));
		assert.ok(heatmapUrl, "the heatmap chunk was fetched");
		const source = await (await fetch(heatmapUrl)).text();
		const imports = [...source.matchAll(/from"\.\/([^"]+)"/g)].map((m) => m[1] ?? "");
		assert.ok(imports.some((n) => n.startsWith("plot-common-")), `it imports the shared chunk: ${imports.join(", ")}`);
		assert.ok(!imports.some((n) => /^chart-/.test(n)), `and not the line and bar renderer: ${imports.join(", ")}`);
		await page.close();
	});
});

describe("pies and donuts (#123)", () => {
	async function pieCase(value: string) {
		const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		await page.evaluate(async (c) => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: c };
			await host.run();
		}, value);
		await page.locator("#host >> .tb-pie").waitFor({ timeout: 15_000 });
		await settled(page);
		const read = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			return {
				slices: [...(root?.querySelectorAll(".tb-pie .tb-slice") ?? [])].map((p) => p.getAttribute("d") ?? ""),
				key: [...(root?.querySelectorAll(".tb-pie-key li") ?? [])].map((li) => li.textContent),
				caption: root?.querySelector(".tb-pie .tb-chart-data caption")?.textContent ?? "",
				message: root?.querySelector(".tb-pie-message")?.textContent ?? "",
				total: root?.querySelector(".tb-pie-total")?.textContent ?? "",
			};
		});
		return { page, read };
	}

	it("starts at 12 o'clock, goes clockwise in the given order, and labels every share", async () => {
		// 32, 4.8, 3.2 and 8 of 48 kb/s: 67%, 10%, 6.7% and 17%.
		const { page, read } = await pieCase("pie");
		assert.deepEqual(read.key, ["Opus audio67%32 kb/s", "RTP headers10%4.80 kb/s", "UDP headers6.7%3.20 kb/s", "IPv4 headers17%8 kb/s"]);
		// The first slice runs from the centre to the top of the circle: cy 130 and r 112 make y = 18, and the
		// centre is the middle of the picture's width, which is measured (#210).
		const start = /^M([\d.]+),130L([\d.]+),18\.00A112,112/.exec(read.slices[0] ?? "");
		assert.ok(start && Math.abs(Number(start[1]) - Number(start[2])) < 0.01, `straight up from the centre: ${read.slices[0]}`);
		const cx = Number(start[1]);
		// Clockwise: the first slice ends left of centre and below it, having swept two thirds of the way round.
		const end = /A112,112 0 \d 1 ([\d.]+),([\d.]+)Z$/.exec(read.slices[0] ?? "");
		assert.ok(end && Number(end[1]) < cx && Number(end[2]) > 130, `two thirds round, clockwise, ends lower left: ${end?.slice(1)}`);
		await page.close();
	});

	it("pulls an exploded slice out along its middle, and changes no share (#126)", async () => {
		/*
		 * The language model's slice runs from 29% to 79% of the way round, so its middle is 54%: 104.4 degrees
		 * clockwise from 3 o'clock in screen terms. 8% of a 104 radius is 8.32, so it moves about (-2.07, 8.06).
		 */
		const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		const read = await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: "donut-exploded" };
			await host.run();
			const root = host.shadowRoot;
			return {
				moves: [...(root?.querySelectorAll(".tb-slice") ?? [])].map((p) => p.getAttribute("transform")),
				shares: [...(root?.querySelectorAll(".tb-pie-key .tb-share") ?? [])].map((s) => s.textContent),
			};
		});
		assert.deepEqual(read.moves[0], null);
		assert.deepEqual(read.moves[2], null);
		const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(read.moves[1] ?? "");
		assert.ok(m && Math.abs(Number(m[1]) + 2.07) < 0.1 && Math.abs(Number(m[2]) - 8.06) < 0.1, `moved ${read.moves[1]}`);
		assert.deepEqual(read.shares, ["29%", "50%", "21%"]);
		await page.close();
	});

	it("folds more than six parts into Other, and says so", async () => {
		const { page, read } = await pieCase("pie-many");
		assert.equal(read.key.length, 6);
		assert.match(read.key.at(-1) ?? "", /^Other3\.0%30$/, "Speex 12, G.729 10 and GSM 8 make 30 of 1,000");
		assert.match(read.caption, /3 smallest parts folded into Other/);
		await page.close();
	});

	it("draws a donut's total in its centre, and no pie at all for a negative value", async () => {
		const donut = await pieCase("donut");
		assert.equal(donut.read.total, "620 ms");
		assert.equal(donut.read.slices.length, 3);
		await donut.page.close();
		const negative = await pieCase("pie-negative");
		assert.equal(negative.read.slices.length, 0);
		assert.match(negative.read.message, /not drawn as a pie/);
		await negative.page.close();
	});
});

describe("radar, treemap and Venn (#128, #129, #130)", () => {
	async function kindCase(value: string, selector: string) {
		const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
		await page.goto(`${BASE}/tool.html?id=discrete-series`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		await page.evaluate(async (c) => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { case: c };
			await host.run();
		}, value);
		await page.locator(`#host >> ${selector}`).first().waitFor({ timeout: 15_000 });
		await settled(page);
		return page;
	}

	it("gives each part an area in proportion to its value, labels what fits, and lists everything (#129)", async () => {
		// 401 k$ in all.
		const page = await kindCase("treemap", ".tb-treemap svg");
		const read = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			const tiles = [...(root?.querySelectorAll(".tb-tile") ?? [])].map((r) => ({ w: Number(r.getAttribute("width")), h: Number(r.getAttribute("height")) }));
			const labels = [...(root?.querySelectorAll(".tb-tile-label") ?? [])].map((t) => t.textContent);
			const rows = [...(root?.querySelectorAll(".tb-chart-data tbody tr") ?? [])].map((tr) => [...tr.children].map((c) => c.textContent));
			const box = root?.querySelector<SVGSVGElement>(".tb-treemap svg")?.viewBox.baseVal;
			return { tiles, labels, rows, whole: (box?.width ?? 0) * (box?.height ?? 0) };
		});
		// Media and its six descendants, Speech and two, Model and two, Signalling: fourteen nodes.
		assert.equal(read.rows.length, 14, "every node listed");
		const total = read.rows.reduce((sum, r) => sum + (r[0] === "Media" || r[0] === "Speech" || r[0] === "Model" || r[0] === "Signalling" ? Number(r[1]) : 0), 0);
		assert.equal(total, 401, "the groups add up to the whole");
		assert.ok(read.rows.some((r) => r[0] === "Relays" && r[1] === "120"), "a group's value is the sum of its parts: Relays 38 + 52 + 30");
		// Tile areas: the whole is the picture, laid out at its measured width (#210).
		const areas = read.tiles.map((t) => t.w * t.h);
		const largest = Math.max(...areas);
		// Media is the largest group: 38 + 52 + 30 + 22 + 14 = 156 of 401.
		assert.ok(Math.abs(largest / read.whole - 156 / 401) < 0.01, `Media, the largest group, is ${(largest / read.whole).toFixed(3)} of the area`);
		await settled(page);
		await page.locator("#host >> .tb-plot").focus();
		const title = await page.evaluate(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-readout-title")?.textContent);
		assert.match(title ?? "", / \/ /, `the readout names the path: ${title}`);
		await page.close();
	});

	it("draws two sets exactly, labels every region of three, and refuses numbers that cannot be true (#130)", async () => {
		const two = await kindCase("venn-two", ".tb-venn svg");
		const geometry = await two.evaluate(() => {
			const cs = [...(document.querySelector("#host")?.shadowRoot?.querySelectorAll(".tb-venn-circle") ?? [])].map((c) => ({
				x: Number(c.getAttribute("cx")),
				y: Number(c.getAttribute("cy")),
				r: Number(c.getAttribute("r")),
			}));
			return cs;
		});
		const [a, b] = geometry;
		assert.ok(a && b && Math.abs(a.r - b.r) < 0.01, "two sets of 100 are equal circles");
		// The lens two equal circles make at centre distance d, as a share of one circle: it must be 50 of 100.
		const d = Math.hypot(b.x - a.x, b.y - a.y);
		const r = a.r;
		const lensArea = 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d);
		assert.ok(Math.abs(lensArea / (Math.PI * r * r) - 0.5) < 0.005, `lens is ${(lensArea / (Math.PI * r * r)).toFixed(4)} of a circle`);
		await two.close();

		const three = await kindCase("venn-three", ".tb-venn svg");
		const read = await three.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			return {
				counts: [...(root?.querySelectorAll(".tb-venn-count") ?? [])].map((t) => t.textContent).sort(),
				caption: root?.querySelector(".tb-venn .tb-chart-data caption")?.textContent ?? "",
			};
		});
		// TURN only 420 - 180 - 60 + 30, SFU only 600 - 180 - 90 + 30, Gateway only 260 - 60 - 90 + 30, the pairs less the 30 in all three.
		assert.deepEqual(read.counts, ["140", "150", "210", "30", "30", "360", "60"]);
		assert.match(read.caption, /areas are approximate; the counts are exact/);
		await three.close();

		const bad = await kindCase("venn-impossible", ".tb-venn");
		const text = await bad.evaluate(() => document.querySelector("#host")?.shadowRoot?.querySelector(".tb-venn-message")?.textContent ?? "");
		assert.match(text, /larger than one of them/);
		await bad.close();
	});

	it("puts a value at its axis's maximum on the outer ring, clockwise from 12 o'clock, broken at a null (#128)", async () => {
		const page = await kindCase("radar", ".tb-radar svg");
		const read = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			const dots = [...(root?.querySelectorAll(".tb-radar-dot.tb-s1") ?? [])].map((c) => ({ x: Number(c.getAttribute("cx")), y: Number(c.getAttribute("cy")), k: Number(c.getAttribute("data-k")) }));
			return {
				fibre: dots,
				satelliteShapes: root?.querySelectorAll(".tb-radar-shape.tb-s3").length,
				satelliteDots: root?.querySelectorAll(".tb-radar-dot.tb-s3").length,
				rings: [...(root?.querySelectorAll(".tb-radar-ring-label") ?? [])].map((t) => t.textContent),
				// The first spoke runs from the centre straight up to the outer ring: the centre and radius, whatever the width.
				spoke: ["x1", "y1", "x2", "y2"].map((a) => Number(root?.querySelector('.tb-radar-spoke[data-k="0"]')?.getAttribute(a))),
			};
		});
		const [cx, cy, , top] = read.spoke as [number, number, number, number];
		const R = cy - top;
		assert.ok(R > 0, `the first spoke points up: ${JSON.stringify(read.spoke)}`);
		// Fibre scores 9 of 10 on latency, the first spoke, straight up: nine tenths of the radius above the centre.
		const latency = read.fibre.find((d) => d.k === 0);
		assert.ok(latency && Math.abs(latency.x - cx) < 0.5 && Math.abs(latency.y - (cy - 0.9 * R)) < 0.5, JSON.stringify(latency));
		// Bandwidth, the fourth of five spokes, scores 10 of 10: on the outer ring, left of centre and below.
		const bandwidth = read.fibre.find((d) => d.k === 3);
		assert.ok(bandwidth && Math.abs(Math.hypot(bandwidth.x - cx, bandwidth.y - cy) - R) < 0.5 && bandwidth.x < cx && bandwidth.y > cy, JSON.stringify(bandwidth));
		assert.equal(read.satelliteShapes, 0, "a broken shape is not filled");
		assert.equal(read.satelliteDots, 4, "four of five values present");
		assert.deepEqual(read.rings, ["2", "4", "6", "8", "10"]);
		await settled(page);
		await page.locator("#host >> .tb-plot").focus();
		const rows = await page.evaluate(() => [...(document.querySelector("#host")?.shadowRoot?.querySelectorAll(".tb-readout li") ?? [])].map((li) => li.textContent));
		assert.deepEqual(rows, ["9Fibre", "6Mobile", "2Satellite"]);
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

	it("is not fetched by a closed card that has no chart to draw yet (#97)", async () => {
		const page = await browser.newPage();
		const scripts: string[] = [];
		page.on("request", (request) => {
			if (request.resourceType() === "script") scripts.push(request.url());
		});
		await page.goto(`${BASE}/failure.html`, { waitUntil: "load" });
		const card = page.locator("#chartless-card");
		await card.locator(".tb-facade").waitFor({ timeout: 10_000 });
		assert.equal(scripts.filter((url) => chartChunk.test(url)).length, 0, "histogram declares series, but a closed unseeded card draws none");

		await card.locator(".tb-facade").click();
		// Through the host API rather than the Run button, which an autoRun tool may not have.
		await card.evaluate((host) => (host as HTMLElement & { run(): Promise<void> }).run());
		await card.locator(".tb-out-chart svg").waitFor({ timeout: 15_000 });
		assert.equal(scripts.filter((url) => chartChunk.test(url)).length, 1, "opening it is what fetches the renderer");
		await page.close();
	});

	it("leaves every card working when the chart renderer cannot be fetched (#97)", async () => {
		const page = await browser.newPage();
		await page.route(chartChunk, (route) => route.abort());
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		// The seeded queue-explorer card needs the chart to paint its seed: it paints the rest instead.
		const seeded = page.locator("tool-host[tool=queue-explorer][data-seed]");
		await seeded.locator(".tb-facade").waitFor({ timeout: 10_000 });
		assert.equal(await seeded.locator(".tb-out-error").count(), 0, "no error box in place of the card");
		assert.match(String(await seeded.locator(".tb-facade").textContent()), /The chart could not be loaded/);
		await page.close();

		// An unseeded card opens and runs, and says the chart is missing rather than failing.
		const other = await browser.newPage();
		await other.route(chartChunk, (route) => route.abort());
		await other.goto(`${BASE}/failure.html`, { waitUntil: "load" });
		const card = other.locator("#chartless-card");
		await card.locator(".tb-facade").click();
		await card.evaluate((host) => (host as HTMLElement & { run(): Promise<void> }).run());
		await card.locator(".tb-output").getByText("The chart could not be loaded.").waitFor({ timeout: 15_000 });
		assert.equal(await card.locator(".tb-out-error").count(), 0);
		await other.close();
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

describe("a host's own stylesheet in the shadow root", () => {
	/*
	 * Hosts already adopt a sheet of their own into each tool's shadow root from page script, and the
	 * runtime used to get on badly with it either way round. It installed its sheet only while the adopted
	 * list was empty, so a host sheet that arrived first switched the runtime's styles off and the tool drew
	 * unstyled. And a chart's sheet was appended after the host's, so the chart's rules beat the host's at
	 * equal specificity. The order that must hold: the runtime's sheet, then a chart's, then the host's.
	 *
	 * Each check below reads a computed style rather than the adopted list, because the defect was what the
	 * reader saw. The equal-specificity property is what proves the order: both sheets set it on the same
	 * selector, so only the later sheet's value can show.
	 */
	type Probe = { containerType: string; runRadius: string; hostLast: boolean; ownFirst: boolean };

	/** Make a host, give it the sheet the way page script would, then connect it. */
	const connectWithSheet = (page: Page, tool: string, css: string, how: "assign" | "append") =>
		page.evaluate(
			({ tool, css, how }) => {
				const el = document.createElement("tool-host");
				el.id = "styled";
				el.setAttribute("tool", tool);
				el.setAttribute("mode", "embed");
				const sheet = new CSSStyleSheet();
				sheet.replaceSync(css);
				const root = el.shadowRoot as ShadowRoot;
				root.adoptedStyleSheets = how === "assign" ? [sheet] : [...root.adoptedStyleSheets, sheet];
				(window as unknown as { hostSheet: CSSStyleSheet }).hostSheet = sheet;
				document.body.prepend(el);
			},
			{ tool, css, how },
		);

	const probe = (page: Page): Promise<Probe> =>
		page.evaluate(() => {
			const root = document.querySelector("#styled")?.shadowRoot as ShadowRoot;
			const sheets = root.adoptedStyleSheets;
			const host = (window as unknown as { hostSheet: CSSStyleSheet }).hostSheet;
			return {
				containerType: getComputedStyle(root.querySelector(".tb") as Element).containerType,
				// An autoRun tool has no Run button.
				runRadius: ((run) => (run ? getComputedStyle(run).borderTopLeftRadius : "no Run button"))(root.querySelector(".tb-run")),
				hostLast: sheets.indexOf(host) === sheets.length - 1,
				ownFirst: sheets.length > 1 && sheets[0] !== host,
			};
		});

	it("keeps a sheet adopted before the tool connects, and the runtime's styles with it", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/article.html`, { waitUntil: "load" });
		// Assigned, not appended: replacing the list is the natural way to write it, and the harsher case.
		await connectWithSheet(page, "percentiles", ".tb-run { border-radius: 3px; }", "assign");
		await page.locator("#styled .tb-run").waitFor();
		const seen = await probe(page);
		// `.tb` is a query container in the runtime's sheet, and nothing else sets it. "normal" means unstyled.
		assert.equal(seen.containerType, "inline-size", "the runtime's sheet must still apply");
		// The runtime sets 8px on `.tb-run`; the host's 3px on the same selector shows only if it comes later.
		assert.equal(seen.runRadius, "3px", "the host's rule must win at equal specificity");
		assert.ok(seen.ownFirst && seen.hostLast, "the runtime's sheet first, the host's last");

		// And it survives a repaint, which rebuilds the shadow tree and reapplies the runtime's styles.
		await page.evaluate(() => document.querySelector("#styled")?.setAttribute("more", "link"));
		await page.locator("#styled .tb-run").waitFor();
		assert.deepEqual(await probe(page), seen, "a repaint must leave both sheets where they were");
		await page.close();
	});

	it("puts a chart's sheet before the host's, so a host rule still wins over a chart's", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/article.html`, { waitUntil: "load" });
		// `.tb-out-chart { margin: 0 }` is in the chart sheet, which arrives only once a chart is drawn.
		// histogram sets autoRun, so it draws a chart with no Run button to press.
		await connectWithSheet(page, "histogram", ".tb-out-chart { margin: 7px; }", "append");
		await page.locator("#styled .tb-out-chart").waitFor({ timeout: 15_000 });
		const margin = await page.evaluate(
			() => getComputedStyle(document.querySelector("#styled")?.shadowRoot?.querySelector(".tb-out-chart") as Element).marginTop,
		);
		assert.equal(margin, "7px", "the host's rule must outlast the chart sheet that arrived after it");
		const seen = await probe(page);
		assert.equal(seen.containerType, "inline-size");
		assert.ok(seen.ownFirst && seen.hostLast, "the host's sheet stays last after a chart's is adopted");
		await page.close();
	});
});

describe("host stylesheets and the styling contract (#157, #154, #156)", () => {
	/*
	 * The styling page passes STYLING.md's four example sheets to `defineToolHost({ styles })`. Each test
	 * reads the computed style that sheet exists to produce, so a renamed class, a dropped attribute or a
	 * cascade change breaks CI rather than a host's site. Expected values come from the sheets themselves:
	 * 1.35rem at the 16px root is 21.6px, 1.5rem is 24px.
	 */
	const open = async (width = 1280) => {
		const page = await browser.newPage({ viewport: { width, height: 900 } });
		await page.goto(`${BASE}/styling.html`, { waitUntil: "load" });
		for (const id of ["audit", "audit-fixed", "narrow-audit", "narrow-percentiles"]) {
			await page.locator(`#${id}`).scrollIntoViewIfNeeded();
		}
		for (const id of ["audit", "audit-fixed", "narrow-audit"]) {
			await page.locator(`#${id} .tb-output [data-kind="table"]`).waitFor({ timeout: 15_000 });
		}
		await page.locator("#narrow-percentiles .tb-output [data-kind='table']").waitFor({ timeout: 15_000 });
		return page;
	};

	/**
	 * A computed length, to a hundredth of a pixel. Firefox stores font sizes in 1/64 px, so 1.35rem
	 * computes to 21.5938px there and 21.6px elsewhere: an exact string compare fails one engine for
	 * nothing.
	 */
	const assertPx = (value: string, px: number) => assert.ok(Math.abs(Number.parseFloat(value) - px) < 0.01, `expected ${px}px, got ${value}`);

	/** Computed style of the first match inside one host's shadow root, with an optional pseudo-element. */
	const style = (page: Page, host: string, selector: string, prop: string, pseudo?: string) =>
		page.evaluate(
			({ host, selector, prop, pseudo }) => {
				const node = document.getElementById(host)?.shadowRoot?.querySelector(selector);
				if (!node) return `no ${selector} in #${host}`;
				return getComputedStyle(node, pseudo ?? null).getPropertyValue(prop);
			},
			{ host, selector, prop, ...(pseudo ? { pseudo } : {}) },
		);

	it("names every part by kind, a part or a field by role, and every named column's cells", async () => {
		const page = await open();
		const names = await page.evaluate(() => {
			const root = document.getElementById("audit")?.shadowRoot as ShadowRoot;
			const group = root.querySelector(".tb-output > [data-kind]") as Element;
			const firstRow = [...root.querySelectorAll("tbody tr:first-child td")];
			return {
				group: group.getAttribute("data-kind"),
				parts: [...group.children].map((part) => [part.getAttribute("data-kind"), part.getAttribute("data-role")]),
				verdictField: root.querySelectorAll('.tb-field[data-role="verdict"]').length,
				labels: firstRow.map((td) => td.getAttribute("data-label")),
				// Grouped fields carry the same class as ungrouped ones, so one selector reaches both.
				groupedFieldLists: root.querySelectorAll(".tb-field-group dl.tb-fields").length,
			};
		});
		assert.equal(names.group, "group");
		assert.deepEqual(names.parts, [
			["fields", null],
			["fields", "stats"],
			["table", null],
			["fields", "stats"],
		]);
		assert.equal(names.verdictField, 1, "the verdict is one field, named on the field");
		// The first column has no label, so its cells carry none: an empty attribute would draw an empty line.
		assert.deepEqual(names.labels, [null, "Type", "Accepts", "Risk", "Bytes", "Checked by"]);
		assert.equal(names.groupedFieldLists, 1);
		await page.close();
	});

	it("names the parts of a closed card's seeded preview too", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		await page.locator('tool-host[tool="percentiles"][mode="card"][data-seed] .tb-facade').first().waitFor();
		const kinds = await page.evaluate(() => {
			// The seeded one: the gallery also draws an unseeded card per tool, which has no result to name.
			const card = document.querySelector('tool-host[tool="percentiles"][mode="card"][data-seed]');
			return [...(card?.shadowRoot?.querySelectorAll(".tb-facade [data-kind]") ?? [])].map((n) => n.getAttribute("data-kind"));
		});
		assert.ok(kinds.includes("fields"), `the facade's seed must carry data-kind, got ${JSON.stringify(kinds)}`);
		await page.close();
	});

	it("draws the verdict sheet: one field, large, in its tone", async () => {
		const page = await open();
		assertPx(await style(page, "audit", '.tb-field[data-role="verdict"] .tb-value', "font-size"), 21.6);
		assert.equal(await style(page, "audit", '.tb-field[data-role="verdict"]', "display"), "block");
		// The field that is not the verdict keeps the runtime's size.
		assertPx(await style(page, "audit", '.tb-field:not([data-role]) .tb-value', "font-size"), 13.6);
		assert.equal(await style(page, "audit", '.tb-field[data-role="verdict"]', "border-top-color"), await style(page, "audit", '.tb-field[data-role="verdict"] .tb-value', "color"), "a bad verdict is bordered in its own tone");
		assert.equal(await style(page, "audit-fixed", '.tb-field[data-role="verdict"]', "border-top-color"), await style(page, "audit-fixed", '.tb-field[data-role="verdict"] .tb-value', "color"), "and so is a good one");
		await page.close();
	});

	it("draws the stats sheet as tiles, label above value, grouped or not", async () => {
		const page = await open();
		const tiles = await page.evaluate(() => {
			const root = document.getElementById("audit")?.shadowRoot as ShadowRoot;
			return [...root.querySelectorAll('[data-role="stats"] .tb-fields')].map((list) => {
				const tile = list.querySelector(".tb-field") as Element;
				const dt = (tile.querySelector("dt") as Element).getBoundingClientRect();
				const dd = (tile.querySelector("dd") as Element).getBoundingClientRect();
				return {
					columns: getComputedStyle(list).gridTemplateColumns.split(" ").length,
					tileColumns: getComputedStyle(tile).gridTemplateColumns.split(" ").length,
					stacked: dt.bottom <= dd.top,
					value: getComputedStyle(tile.querySelector(".tb-value") as Element).fontSize,
				};
			});
		});
		assert.equal(tiles.length, 2, "the ungrouped stats part and the grouped one");
		for (const tile of tiles) {
			assert.ok(tile.columns >= 2, `the tiles sit side by side, got ${tile.columns} column(s)`);
			assert.equal(tile.tileColumns, 1, "each tile is one column");
			assert.ok(tile.stacked, "the label sits above the value");
			assertPx(tile.value, 24);
		}
		await page.close();
	});

	it("draws the bordered sheet, and the default sheet colours good and muted cells", async () => {
		const page = await open();
		assert.equal(await style(page, "audit", "td", "border-left-width"), "1px");
		assert.equal(await style(page, "audit", "td", "border-left-style"), "solid");
		// Both read --tb-good and --tb-faint, so they must match a good field value and a note respectively.
		assert.equal(await style(page, "audit", 'td[data-tone="good"]', "color"), await style(page, "audit-fixed", '.tb-field[data-tone="good"] .tb-value', "color"));
		assert.equal(await style(page, "audit", 'td[data-tone="muted"]', "color"), await style(page, "audit", ".tb-note", "color"));
		assert.notEqual(await style(page, "audit", 'td[data-tone="muted"]', "color"), await style(page, "audit", 'td[data-tone="normal"]', "color"));
		await page.close();
	});

	it("stacks table rows in a narrow tool, with the natural selector beating the runtime's", async () => {
		const page = await open();
		assert.equal(await style(page, "narrow-audit", "thead", "display"), "none");
		assert.equal(await style(page, "audit", "thead", "display"), "table-header-group", "a wide tool keeps its header");
		/*
		 * The runtime sets `td[data-align="end"] { text-align: end }`, more specific than the host's
		 * `.tb-out-table td`. Only the runtime's layer lets the host win here, so this is the layer's test.
		 */
		assert.equal(await style(page, "narrow-audit", 'td[data-align="end"]', "text-align"), "start");
		assert.equal(await style(page, "narrow-audit", 'td[data-label="Bytes"]', "content", "::before"), '"Bytes"');
		assert.equal(await style(page, "narrow-percentiles", 'td[data-label="Linear"]', "content", "::before"), '"Linear"');
		await page.close();
	});

	it("gives shared sheets to every tool and a tool's own sheets to that tool only", async () => {
		const page = await open();
		const counts = await page.evaluate(() =>
			Object.fromEntries(["audit", "narrow-percentiles"].map((id) => [id, document.getElementById(id)?.shadowRoot?.adoptedStyleSheets.length])),
		);
		// The runtime's sheet and the share button's (#227), then the two shared ones; the fixture also gets its two of its own.
		assert.deepEqual(counts, { audit: 6, "narrow-percentiles": 4 });
		await page.close();
	});

	it("replaces the host's sheets everywhere with setHostStyles, and puts them back", async () => {
		const page = await open();
		await page.click("#toggle-styles");
		assertPx(await style(page, "audit", '.tb-field[data-role="verdict"] .tb-value', "font-size"), 13.6);
		assert.equal(await style(page, "narrow-audit", "thead", "display"), "table-header-group");
		const off = await page.evaluate(() => document.getElementById("audit")?.shadowRoot?.adoptedStyleSheets.length);
		assert.equal(off, 2, "only the runtime's sheets are left: its own and the share button's (#227)");
		await page.click("#toggle-styles");
		assertPx(await style(page, "audit", '.tb-field[data-role="verdict"] .tb-value', "font-size"), 21.6);
		await page.close();
	});

	it("keeps a wide table inside a 390px tool rather than clipping the tool (#154)", async () => {
		const page = await open(390);
		// Without the host sheets, so the table is a real table again and wider than the phone.
		await page.click("#toggle-styles");
		const box = await page.evaluate(() => {
			const root = document.getElementById("narrow-audit")?.shadowRoot as ShadowRoot;
			const frame = root.querySelector(".tb") as HTMLElement;
			const scroller = root.querySelector(".tb-out-table") as HTMLElement;
			return { frame: frame.clientWidth, frameScroll: frame.scrollWidth, table: scroller.clientWidth, tableScroll: scroller.scrollWidth };
		});
		assert.ok(box.tableScroll > box.table, `the table is wider than its box and scrolls in it: ${JSON.stringify(box)}`);
		assert.ok(box.table <= box.frame, `and the box fits the tool: ${JSON.stringify(box)}`);
		assert.equal(box.frameScroll, box.frame, `nothing pushes the tool wider than itself: ${JSON.stringify(box)}`);
		await page.close();
	});
});

describe("linking to one part with host.reveal (#147)", () => {
	/*
	 * The styling page's fixture gives every part an `id`. Three hosts there each show one part of four:
	 * behind `more="expand"`, behind a plain `parts` cap, and in a closed card. `reveal` must reach the
	 * hidden part in each, leave focus on it and have it on screen, without the page touching the shadow
	 * root.
	 */
	const reveal = (page: Page, host: string, part: string) =>
		page.evaluate(
			async ({ host, part }) => {
				const el = document.getElementById(host) as HTMLElement & { reveal(id: string): Promise<boolean> };
				const ok = await el.reveal(part);
				const node = el.shadowRoot?.querySelector(`[data-part="${part}"]`);
				const box = node?.getBoundingClientRect();
				return {
					ok,
					focused: el.shadowRoot?.activeElement?.getAttribute("data-part") ?? null,
					onScreen: box ? box.top < innerHeight && box.bottom > 0 : false,
					hidden: node ? node.closest("[hidden]") !== null : null,
					expanded: el.shadowRoot?.querySelector(".tb-disclose")?.getAttribute("aria-expanded") ?? null,
					form: el.shadowRoot?.querySelector(".tb-form") !== null,
				};
			},
			{ host, part },
		);

	const open = async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/styling.html`, { waitUntil: "load" });
		return page;
	};

	it("opens a part hidden behind a disclosure, as if the button were pressed", async () => {
		const page = await open();
		await page.locator("#reveal-expand").scrollIntoViewIfNeeded();
		await page.locator("#reveal-expand .tb-disclose").waitFor({ timeout: 15_000 });
		const before = await page.evaluate(() => document.getElementById("reveal-expand")?.shadowRoot?.querySelector('[data-part="fields"]')?.closest("[hidden]") !== null);
		assert.ok(before, "the table starts hidden behind the disclosure");
		await page.evaluate(() => scrollTo(0, 0));
		const seen = await reveal(page, "reveal-expand", "fields");
		assert.deepEqual(seen, { ok: true, focused: "fields", onScreen: true, hidden: false, expanded: "true", form: true });
		await page.close();
	});

	it("draws a part a plain cap left out", async () => {
		const page = await open();
		await page.locator("#reveal-capped").scrollIntoViewIfNeeded();
		await page.locator("#reveal-capped .tb-more").waitFor({ timeout: 15_000 });
		await page.evaluate(() => scrollTo(0, 0));
		const seen = await reveal(page, "reveal-capped", "this-run");
		assert.equal(seen.ok, true);
		assert.equal(seen.focused, "this-run");
		assert.equal(seen.onScreen, true);
		assert.equal(seen.hidden, false);
		await page.close();
	});

	it("activates a closed card first, then goes to the part", async () => {
		const page = await open();
		await page.locator("#reveal-card .tb-facade").waitFor();
		const seen = await reveal(page, "reveal-card", "stats");
		assert.equal(seen.form, true, "the card was opened");
		assert.equal(seen.ok, true);
		assert.equal(seen.focused, "stats");
		assert.equal(seen.onScreen, true);
		await page.close();
	});

	it("says false, and moves nothing, for a part the result does not have", async () => {
		const page = await open();
		await page.locator("#reveal-capped").scrollIntoViewIfNeeded();
		await page.locator("#reveal-capped .tb-more").waitFor({ timeout: 15_000 });
		const seen = await reveal(page, "reveal-capped", "no-such-part");
		assert.equal(seen.ok, false);
		assert.equal(seen.focused, null);
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

describe("a slider on a number input (contract 4, #102)", () => {
	async function open() {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=slider`, { waitUntil: "load" });
		await page.locator("#host >> .tb-slider").waitFor({ timeout: 15_000 });
		const read = () =>
			page.evaluate(() => {
				const root = document.querySelector("#host")?.shadowRoot;
				const slider = root?.querySelector(".tb-slider") as HTMLInputElement | null;
				const box = root?.querySelector(".tb-slider-row .tb-input") as HTMLInputElement | null;
				const labelId = slider?.getAttribute("aria-labelledby") ?? "";
				return {
					slider: slider?.value,
					box: box?.value,
					min: slider?.min,
					max: slider?.max,
					step: slider?.step,
					name: labelId ? root?.getElementById(labelId)?.textContent ?? "" : "",
					answer: root?.querySelector(".tb-out-fields")?.textContent ?? "",
				};
			});
		return { page, read };
	}

	it("draws a native range beside the number box, bounded by the manifest and named by its label", async () => {
		const { page, read } = await open();
		const state = await read();
		assert.deepEqual([state.min, state.max, state.step, state.slider, state.box], ["10", "500", "10", "80", "80"]);
		assert.match(state.name, /Round-trip time/);
		await page.close();
	});

	it("moves the value from the keyboard, keeps the box beside it in step, and re-runs", async () => {
		const { page, read } = await open();
		await page.locator("#host >> .tb-slider").focus();
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("ArrowRight");
		// Two steps of 10 from 80. The answer is the value the run received, not what the slider shows.
		await page.waitForFunction(() => /100 ms/.test(document.querySelector("#host")?.shadowRoot?.querySelector(".tb-out-fields")?.textContent ?? ""), null, {
			timeout: 10_000,
		});
		const state = await read();
		assert.equal(state.slider, "100");
		assert.equal(state.box, "100");
		await page.close();
	});

	it("follows the number box, and a host writing values, so the two never disagree", async () => {
		const { page, read } = await open();
		await page.locator("#host >> .tb-slider-row .tb-input").fill("250");
		assert.equal((await read()).slider, "250", "typing an exact value moves the thumb");
		await page.evaluate(() => {
			(document.querySelector("#host") as HTMLElement & { values: Record<string, unknown> }).values = { rtt: 400 };
		});
		const state = await read();
		assert.deepEqual([state.slider, state.box], ["400", "400"]);
		await page.close();
	});
});

describe("layout and page-owned controls (#103)", () => {
	const order = (page: import("playwright").Page) =>
		page.evaluate(() =>
			[...(document.querySelector("#host")?.shadowRoot?.querySelector(".tb-body")?.children ?? [])]
				.map((c) => c.className.split(" ")[0])
				.filter((c) => ["tb-form", "tb-actions", "tb-status", "tb-output"].includes(c ?? "")),
		);

	it("puts the answer above the form with layout=answer-first, and leaves the default alone", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		assert.deepEqual(await order(page), ["tb-form", "tb-actions", "tb-status", "tb-output"]);
		await page.goto(`${BASE}/tool.html?id=percentiles&layout=answer-first`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		assert.deepEqual(await order(page), ["tb-status", "tb-output", "tb-form", "tb-actions"]);
		await page.close();
	});

	it("draws only the result with controls=none, and runs when the page asks", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles&controls=none`, { waitUntil: "load" });
		await page.locator("#host >> .tb-output").waitFor({ state: "attached", timeout: 15_000 });
		assert.deepEqual(await order(page), ["tb-output"], "no form, no Run, no status line");
		await page.evaluate(async () => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
			host.values = { values: "1 2 3 4 100" };
			await host.run();
		});
		await page.locator("#host >> .tb-out-fields").first().waitFor({ timeout: 10_000 });
		// Writing values again does not dim the answer or claim it is stale: the page owns that.
		await page.evaluate(() => {
			(document.querySelector("#host") as HTMLElement & { values: Record<string, unknown> }).values = { values: "5 6 7" };
		});
		assert.equal(await page.locator("#host >> .tb-output[data-stale]").count(), 0);
		await page.close();
	});

	it("does not change a card", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const card = page.locator("tool-host[tool=percentiles]").first();
		await card.evaluate((host) => {
			host.setAttribute("layout", "answer-first");
			host.setAttribute("controls", "none");
		});
		await card.locator(".tb-facade").click();
		await card.locator(".tb-form").waitFor({ timeout: 10_000 });
		assert.equal(await card.locator(".tb-run").count(), 1, "an opened card keeps its form and Run");
		await page.close();
	});
});

describe("accessibility wiring", () => {
	it("moves focus to the answer for a keyboard Run, not for a mouse click (#101)", async () => {
		const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		const run = page.locator("#host >> .tb-run");
		await run.waitFor();
		const where = () =>
			page.evaluate(() => ({
				scrollY: window.scrollY,
				onOutput: document.querySelector("#host")?.shadowRoot?.activeElement?.classList.contains("tb-output") === true,
			}));

		await run.scrollIntoViewIfNeeded();
		const before = await where();
		await run.click();
		await page.locator("#host >> .tb-out-fields").first().waitFor({ timeout: 10_000 });
		const afterClick = await where();
		assert.equal(afterClick.onOutput, false, "a pointer press leaves focus where the reader is");
		assert.equal(afterClick.scrollY, before.scrollY, "and does not scroll the page to the result");

		await run.focus();
		await page.keyboard.press("Enter");
		await page.waitForFunction(() => document.querySelector("#host")?.shadowRoot?.activeElement?.classList.contains("tb-output") === true, null, {
			timeout: 10_000,
		});
		// The ring it then wears is the theme's accent outline, not the browser's default (#99).
		const ring = await page.evaluate(() => {
			const host = document.querySelector("#host") as HTMLElement;
			const output = host.shadowRoot?.querySelector(".tb-output") as HTMLElement;
			const probe = document.createElement("span");
			probe.style.color = getComputedStyle(host).getPropertyValue("--tb-accent");
			document.body.append(probe);
			const accent = getComputedStyle(probe).color;
			probe.remove();
			const style = getComputedStyle(output);
			return { style: style.outlineStyle, color: style.outlineColor, accent };
		});
		/*
		 * Engines differ on whether focus moved by script after a key press is :focus-visible: Chromium and
		 * WebKit draw a ring, Firefox draws none. What must hold in every engine is that a ring, when there
		 * is one, is the theme's accent and never the browser's default.
		 */
		assert.ok(ring.style === "none" || (ring.style === "solid" && ring.color === ring.accent), `ring ${ring.style} ${ring.color}, accent ${ring.accent}`);
		assert.notEqual(ring.style, "auto", "never the browser's default ring");
		await page.close();
	});

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
				// The hint itself is the button now (#98, #105), so it carries the name.
				const name = root?.querySelector("button.tb-facade-hint")?.getAttribute("aria-label") ?? "";
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

	it("keeps a card's contents out of its button, so they are announced and nothing is nested (#98, #105)", async () => {
		/*
		 * The three axe failures had one cause: the whole card inside a <button>. Asserted structurally, since
		 * axe is not a dependency here and two of the three rules are skipped by its default tags anyway.
		 */
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const seeded = page.locator("tool-host[tool=queue-explorer][data-seed]");
		await seeded.locator(".tb-facade .tb-out-chart svg").waitFor({ timeout: 15_000 });
		const shape = await seeded.evaluate((host) => {
			const root = host.shadowRoot as ShadowRoot;
			const buttons = [...root.querySelectorAll("button")];
			const summary = root.querySelector(".tb-chart-data summary");
			return {
				buttons: buttons.map((b) => ({ cls: b.className, text: b.textContent?.trim() ?? "", name: b.getAttribute("aria-label") ?? "" })),
				blurbInButton: Boolean(root.querySelector(".tb-blurb")?.closest("button")),
				seedInButton: Boolean(root.querySelector(".tb-out-chart")?.closest("button")),
				summaryInButton: Boolean(summary?.closest("button")),
				summaryHeight: summary?.getBoundingClientRect().height ?? 0,
			};
		});
		assert.deepEqual(
			shape.buttons.map((b) => b.cls),
			["tb-facade-hint"],
			"a closed card has exactly one button, the hint",
		);
		assert.ok(shape.buttons[0]?.name.startsWith(shape.buttons[0]?.text ?? "?"), "its name starts with its visible text (WCAG 2.5.3)");
		assert.equal(shape.blurbInButton, false, "the blurb is content, reachable by a screen reader");
		assert.equal(shape.seedInButton, false, "and so is the seeded answer");
		assert.equal(shape.summaryInButton, false, "the data-table disclosure is not nested in a button (WCAG 4.1.2)");
		assert.ok(shape.summaryHeight >= 24, `the disclosure is a 24px target (WCAG 2.5.8), measured ${shape.summaryHeight}px`);
		await page.close();
	});

	it("opens a card from anywhere on it, and from the keyboard, but not from a control inside it (#98)", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		// A click on the blurb opens the card, as it always did.
		const byClick = page.locator("tool-host[tool=percentiles]").first();
		await byClick.locator(".tb-blurb").click();
		await byClick.locator(".tb-form").waitFor({ timeout: 10_000 });

		// Opening the seeded chart's data table does not open the card.
		const seeded = page.locator("tool-host[tool=queue-explorer][data-seed]");
		await seeded.locator(".tb-chart-data summary").click();
		assert.equal(await seeded.locator(".tb-chart-data").getAttribute("open"), "", "the table opened");
		assert.equal(await seeded.locator(".tb-form").count(), 0, "and the card stayed closed");

		// Enter on the hint opens it.
		await seeded.locator("button.tb-facade-hint").focus();
		await page.keyboard.press("Enter");
		await seeded.locator(".tb-form").waitFor({ timeout: 10_000 });
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

	it("lets a host give accent text its own colour, while fills keep the accent (#106)", async () => {
		// An amber bright enough for a button is not readable as small text on white, so the two can differ.
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=queue-explorer`, { waitUntil: "load" });
		await page.locator("#host >> .tb-foot a").first().waitFor({ timeout: 15_000 });
		const read = () =>
			page.evaluate(() => {
				const root = document.querySelector("#host")?.shadowRoot;
				const link = root?.querySelector(".tb-foot a");
				const run = root?.querySelector(".tb-run");
				return { link: link ? getComputedStyle(link).color : "", run: run ? getComputedStyle(run).backgroundColor : "" };
			});
		await page.evaluate(() => (document.querySelector("#host") as HTMLElement).style.setProperty("--tb-accent", "rgb(245, 158, 11)"));
		const accentOnly = await read();
		assert.equal(accentOnly.run, "rgb(245, 158, 11)", "Run is filled with the accent");
		assert.equal(accentOnly.link, "rgb(245, 158, 11)", "with no text token set, text follows the accent, as before");

		await page.evaluate(() => (document.querySelector("#host") as HTMLElement).style.setProperty("--tb-accent-text", "rgb(164, 104, 5)"));
		const both = await read();
		assert.equal(both.run, "rgb(245, 158, 11)", "the fill does not move");
		assert.equal(both.link, "rgb(164, 104, 5)", "the link takes the text token");

		// And the label ON the fill has its own token, since white on a bright amber is 3.18:1 at best.
		const ink = () => page.evaluate(() => getComputedStyle(document.querySelector("#host")?.shadowRoot?.querySelector(".tb-run") as Element).color);
		const surface = await page.evaluate(() => {
			const probe = document.createElement("span");
			probe.style.color = getComputedStyle(document.querySelector("#host") as Element).getPropertyValue("--tb-bg");
			document.body.append(probe);
			const c = getComputedStyle(probe).color;
			probe.remove();
			return c;
		});
		assert.equal(await ink(), surface, "by default the label is the surface colour, as before");
		await page.evaluate(() => (document.querySelector("#host") as HTMLElement).style.setProperty("--tb-accent-ink", "rgb(0, 0, 0)"));
		assert.equal(await ink(), "rgb(0, 0, 0)");
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
		// json-code is `autoRun`: its default result arrives without a Run button to press.
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
		// json-code is `autoRun`: its default result arrives without a Run button to press.
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

describe("the Copy action on code and tables (#155)", () => {
	/*
	 * The clipboard is stubbed in every test, before any page script runs. That is the only way to see the
	 * exact text written in all three engines, since Firefox and WebKit grant no clipboard permission to an
	 * automated page, and it is how the refused and the missing clipboard are produced on demand.
	 */
	type Clipboard = "records" | "refuses" | "missing";
	const open = async (path: string, clipboard: Clipboard) => {
		const page = await browser.newPage();
		await page.addInitScript((mode: Clipboard) => {
			const w = window as unknown as { copied: string[] };
			w.copied = [];
			const stub =
				mode === "missing"
					? undefined
					: {
							writeText: (text: string) => {
								if (mode === "refuses") return Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
								w.copied.push(text);
								return Promise.resolve();
							},
						};
			Object.defineProperty(Navigator.prototype, "clipboard", { configurable: true, get: () => stub });
		}, clipboard);
		await page.goto(`${BASE}/${path}`, { waitUntil: "load" });
		return page;
	};
	// The json-code fixture's default, pretty-printed: the same hand-derived string the highlight tests use.
	const pretty = '{\n  "ok": true,\n  "n": 3\n}';
	const jsonHost = 'tool-host[tool="json-code"][mode="page"]';

	const state = (page: Page, host: string) =>
		page.evaluate((host) => {
			const root = document.querySelector(host)?.shadowRoot;
			return {
				copied: (window as unknown as { copied: string[] }).copied,
				announced: root?.querySelector(".tb-announce")?.textContent ?? "",
				note: root?.querySelector(".tb-copy-note")?.textContent ?? "",
				status: root?.querySelector(".tb-status")?.textContent ?? "",
				selected: (root as ShadowRoot & { getSelection?: () => Selection | null })?.getSelection?.()?.toString() ?? document.getSelection()?.toString() ?? "",
			};
		}, host);

	it("copies a code result's source exactly, from the keyboard, and announces it", async () => {
		const page = await open("index.html", "records");
		const host = page.locator(jsonHost);
		await host.scrollIntoViewIfNeeded();
		await host.locator(".tb-out-code").waitFor({ timeout: 15_000 });
		const button = host.locator(".tb-out-code .tb-copy");
		assert.equal(await button.evaluate((b) => b.tagName), "BUTTON", "a real button, so it is focusable and announced as one");
		assert.equal(await button.textContent(), "Copy code", "a visible label, not an icon");
		const box = await button.boundingBox();
		assert.ok(box && box.height >= 24, `a 24px target for WCAG 2.5.8, got ${box?.height}`);
		// Enabled once the copy chunk is here; focusing it before then would press nothing.
		await host.locator(".tb-out-code .tb-copy:enabled").waitFor();
		await button.focus();
		await page.keyboard.press("Enter");
		await page.waitForFunction((host) => document.querySelector(host)?.shadowRoot?.querySelector(".tb-announce")?.textContent === "Copied", jsonHost);
		const after = await state(page, jsonHost);
		assert.deepEqual(after.copied, [pretty], "the source, exactly, and once");
		assert.equal(after.note, "Copied", "a sighted reader sees it beside the button");
		assert.equal(await host.locator(".tb-copy-note").getAttribute("aria-hidden"), "true", "and does not hear it twice");
		assert.equal(after.status, "", "the visible status line is left alone");

		// A second press announces again: the region is emptied and rewritten, so the same word is still a change.
		await page.evaluate((host) => {
			const region = document.querySelector(host)?.shadowRoot?.querySelector(".tb-announce");
			(window as unknown as { cleared: boolean }).cleared = false;
			if (region) new MutationObserver(() => region.textContent === "" && ((window as unknown as { cleared: boolean }).cleared = true)).observe(region, { childList: true, characterData: true, subtree: true });
		}, jsonHost);
		await page.keyboard.press("Space");
		await page.waitForFunction(() => (window as unknown as { copied: string[] }).copied.length === 2);
		await page.waitForFunction((host) => document.querySelector(host)?.shadowRoot?.querySelector(".tb-announce")?.textContent === "Copied", jsonHost);
		assert.equal(await page.evaluate(() => (window as unknown as { cleared: boolean }).cleared), true, "the region was emptied between the two");
		await page.close();
	});

	for (const clipboard of ["refuses", "missing"] as const) {
		it(`says so when the clipboard ${clipboard === "refuses" ? "refuses the write" : "does not exist"}, and selects the text instead`, async () => {
			const page = await open("index.html", clipboard);
			const errors: string[] = [];
			page.on("pageerror", (error) => errors.push(String(error)));
			const host = page.locator(jsonHost);
			await host.scrollIntoViewIfNeeded();
			await host.locator(".tb-out-code").waitFor({ timeout: 15_000 });
			await host.locator(".tb-out-code .tb-copy").click();
			await page.waitForFunction((host) => /^Copy failed/.test(document.querySelector(host)?.shadowRoot?.querySelector(".tb-announce")?.textContent ?? ""), jsonHost);
			const after = await state(page, jsonHost);
			assert.deepEqual(after.copied, [], "nothing was written");
			assert.equal(after.announced, "Copy failed. The text is selected, so you can copy it yourself");
			assert.equal(after.note, "Copy failed: the text is selected instead", "visible beside the button, and it stays");
			assert.equal(after.selected.trim(), pretty, "the block's text is the selection, ready for the keyboard");
			assert.deepEqual(errors, [], "a refused clipboard is not an uncaught error");
			await page.close();
		});
	}

	it("copies a table as tab-separated text, header first", async () => {
		const page = await open("styling.html", "records");
		const host = page.locator("#audit");
		await host.scrollIntoViewIfNeeded();
		await host.locator('.tb-output [data-kind="table"]').waitFor({ timeout: 15_000 });
		const button = host.locator('[data-kind="table"] .tb-copy');
		assert.equal(await button.textContent(), "Copy table");
		await button.click();
		await page.waitForFunction(() => (window as unknown as { copied: string[] }).copied.length === 1);
		/*
		 * Written out by hand from the styled-output fixture's table with "Limits added" off: an unnamed first
		 * column, so the header starts with a tab; the Risk cell's text and not its tone; numbers as written.
		 */
		const expected = [
			"\tType\tAccepts\tRisk\tBytes\tChecked by",
			"username\tstring\tany text\thigh\t64\t3 tools",
			"email\tstring\taddress\tlow\t254\t4 tools",
			"age\tinteger\t0 to 150\troutine\t1\t2 tools",
		].join("\n");
		assert.deepEqual((await state(page, "#audit")).copied, [expected]);
		await page.close();
	});

	/*
	 * The copying is its own chunk, fetched when the first code or table result is drawn. The button is on
	 * screen with the result regardless, so these hold the chunk back with a route to see the gap a slow
	 * connection would open, and refuse it to see a page that never gets it.
	 */
	const copyChunk = /\/assets\/copy-[^/]+\.js$/;

	it("shows the button disabled until its chunk arrives, then copies", async () => {
		const page = await browser.newPage();
		await page.addInitScript(() => {
			const w = window as unknown as { copied: string[] };
			w.copied = [];
			Object.defineProperty(Navigator.prototype, "clipboard", {
				configurable: true,
				get: () => ({ writeText: (text: string) => (w.copied.push(text), Promise.resolve()) }),
			});
		});
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route(copyChunk, async (route) => {
			await held;
			await route.continue();
		});
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const host = page.locator(jsonHost);
		await host.scrollIntoViewIfNeeded();
		await host.locator(".tb-out-code").waitFor({ timeout: 15_000 });
		const button = host.locator(".tb-out-code .tb-copy");
		assert.equal(await button.isVisible(), true, "the button is drawn with the result");
		assert.equal(await button.isDisabled(), true, "and disabled while there is nothing behind it");
		release();
		await page.waitForFunction((host) => {
			const b = document.querySelector(host)?.shadowRoot?.querySelector(".tb-out-code .tb-copy") as HTMLButtonElement | null;
			return b !== null && !b.disabled;
		}, jsonHost);
		await button.click();
		await page.waitForFunction(() => (window as unknown as { copied: string[] }).copied.length === 1);
		assert.deepEqual(await page.evaluate(() => (window as unknown as { copied: string[] }).copied), [pretty]);
		await page.close();
	});

	it("says so, and stays disabled, when its chunk cannot be fetched", async () => {
		const page = await browser.newPage();
		await page.route(copyChunk, (route) => route.abort());
		await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
		const host = page.locator(jsonHost);
		await host.scrollIntoViewIfNeeded();
		await host.locator(".tb-out-code").waitFor({ timeout: 15_000 });
		await page.waitForFunction((host) => (document.querySelector(host)?.shadowRoot?.querySelector(".tb-copy-note")?.textContent ?? "") !== "", jsonHost);
		assert.equal(await host.locator(".tb-copy-note").textContent(), "Copy is unavailable: select the text instead");
		assert.equal(await host.locator(".tb-out-code .tb-copy").isDisabled(), true);
		await page.close();
	});

	it("fetches its chunk only for a result with code or a table in it", async () => {
		const fetched = async (url: string, wait: string) => {
			const page = await browser.newPage();
			const scripts: string[] = [];
			page.on("request", (request) => {
				if (request.resourceType() === "script") scripts.push(request.url());
			});
			await page.goto(`${BASE}/${url}`, { waitUntil: "load" });
			await page.locator("#host").scrollIntoViewIfNeeded();
			await page.locator("#host >> .tb-run").click();
			await page.locator(`#host >> ${wait}`).first().waitFor({ timeout: 15_000 });
			await page.waitForTimeout(200);
			await page.close();
			return scripts.filter((s) => copyChunk.test(s)).length;
		};
		assert.equal(await fetched("tool.html?id=utf8-bytes", ".tb-out-bytes"), 0, "fields and bytes have no Copy, so nothing is fetched");
		assert.equal(await fetched("tool.html?id=percentiles", ".tb-out-table"), 1, "a table fetches it, once");
	});

	it("is not on a closed card, whose preview is there to be opened", async () => {
		const page = await open("index.html", "records");
		// No card on the gallery is seeded with a table or code, so this one is made here, seeded with both.
		await page.evaluate(() => {
			const card = document.createElement("tool-host") as HTMLElement & { seed: unknown };
			card.id = "copy-card";
			card.setAttribute("tool", "styled-output");
			card.setAttribute("mode", "card");
			card.setAttribute("parts", "2");
			card.seed = {
				kind: "group",
				parts: [
					{ kind: "table", columns: [{ label: "a" }], rows: [["1"]] },
					{ kind: "code", lang: "json", source: "{}" },
				],
			};
			document.body.append(card);
		});
		await page.locator("#copy-card >> .tb-facade .tb-out-code").waitFor({ timeout: 15_000 });
		const facade = await page.evaluate(() => {
			const root = document.getElementById("copy-card")?.shadowRoot;
			return { parts: root?.querySelectorAll(".tb-out-table, .tb-out-code").length ?? 0, copies: root?.querySelectorAll(".tb-copy").length ?? 0 };
		});
		assert.deepEqual(facade, { parts: 2, copies: 0 }, "both parts drawn, and no Copy inside the facade");
		await page.close();
	});
});

describe("typing keeps the browser's own undo", () => {
	/*
	 * Chrome ends an undo group whenever a node is inserted anywhere in the document. The status line used
	 * to reassign its text on every keystroke once a result was on screen, which replaced its text node, so
	 * each character became its own undo step: 7 presses to take back "abc def" and a newline, where a plain
	 * textarea takes 1. Firefox and WebKit group the same burst into one step either way.
	 */
	it("takes back a typed burst in one undo after a result is on screen", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=percentiles`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-out-fields").first().waitFor({ timeout: 15_000 });
		const area = page.locator("#host >> .tb-textarea");
		const before = await area.inputValue();
		await area.click();
		await area.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
		await page.keyboard.type("abc def\n", { delay: 30 });
		assert.equal(await area.inputValue(), `abc def\n${before}`);
		await page.waitForTimeout(400);
		await page.keyboard.press("ControlOrMeta+z");
		assert.equal(await area.inputValue(), before, "one undo should take back the whole burst, as it does in a plain textarea");
		await page.close();
	});
});

describe("select presets (#151)", () => {
	/*
	 * The `presets` fixture's Library select: A sets read 30, retries 2, backoff 200 (the inputs' defaults),
	 * B sets 60, 3, 500, C sets 10, 0, 0, and Custom sets nothing. Connect is named by no preset. Every
	 * expected value below is read off that manifest by hand, and the worst-case figure from the fixture's
	 * formula, (retries + 1) × (connect + read) + backoff doubling: 4 × (5 + 60) + (0.5 + 1 + 2) = 263.5 s.
	 */
	async function open(): Promise<Page> {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=presets`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> .tb-run").waitFor();
		return page;
	}
	const form = (page: Page) =>
		page.evaluate(() => {
			const host = document.querySelector("#host") as HTMLElement & { values: Record<string, unknown> };
			const root = host.shadowRoot;
			const value = (id: string) => (root?.querySelector(`#in-${id}`) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";
			return {
				shown: { stack: value("stack"), connect: value("connect"), read: value("read"), retries: value("retries"), backoff: value("backoff") },
				values: host.values,
				status: root?.querySelector(".tb-status")?.textContent ?? "",
				stale: Boolean(root?.querySelector(".tb-output[data-stale]")),
				fields: root?.querySelectorAll(".tb-output .tb-field").length ?? 0,
			};
		});

	it("fills the inputs an option names, leaves the rest, and goes stale without running", async () => {
		const page = await open();
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-out-fields").waitFor({ timeout: 15_000 });

		await page.locator("#host >> #in-stack").selectOption("b");
		const after = await form(page);
		assert.deepEqual(after.shown, { stack: "b", connect: "5", read: "60", retries: "3", backoff: "500" }, "the controls show Library B's values, and connect keeps its own");
		assert.deepEqual(after.values, { stack: "b", connect: 5, read: 60, retries: 3, backoff: 500 }, "and so does what Run will use");
		assert.equal(after.stale, true, "the answer on screen belongs to Library A's values");
		assert.equal(after.status, 'filled with "Library B". Press Run', "the status names the option, as it names a sample");

		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-output:not([data-stale])").waitFor();
		const text = await page.locator("#host >> .tb-output").textContent();
		assert.match(String(text), /263\.5 s/, `the run used the filled values: ${text}`);
		assert.match(String(text), /Library\s*b/, "and run() still received the select's own value");
		await page.close();
	});

	it("shows Custom once a filled value is edited, and the preset again when it matches", async () => {
		const page = await open();
		await page.locator("#host >> #in-stack").selectOption("b");

		await page.locator("#host >> #in-read").fill("45");
		let now = await form(page);
		assert.equal(now.shown.stack, "custom", "45 is not Library B's read timeout, so the select may not say Library B");
		assert.equal(now.values.stack, "custom", "and run() receives what the select shows");
		assert.equal(now.status, 'Library now shows "Custom"', "a control the reader did not touch changed, so the status says so");

		await page.locator("#host >> #in-read").fill("60");
		now = await form(page);
		assert.equal(now.shown.stack, "b", "typed back to Library B's values, the form is Library B again");
		assert.equal(now.status, 'Library now shows "Library B"');

		await page.locator("#host >> #in-connect").fill("9");
		now = await form(page);
		assert.equal(now.shown.stack, "b", "no preset names connect, so editing it must not move the select");
		assert.doesNotMatch(now.status, /now shows/, "and must not announce a change that did not happen");
		await page.close();
	});

	it("follows a sample, which writes values without a keystroke", async () => {
		const page = await open();
		await page.locator("#host >> #in-stack").selectOption("b");

		// The defect the mockup found: a sample changed the values and the select kept its old preset.
		await page.locator('#host >> .tb-sample:text-is("Slow upstream")').click();
		let now = await form(page);
		assert.deepEqual([now.shown.stack, now.shown.read, now.shown.retries], ["custom", "120", "1"]);
		assert.equal(now.status, 'filled with "Slow upstream"; Library now shows "Custom". Press Run');

		await page.locator('#host >> .tb-sample:text-is("Library B\'s values")').click();
		now = await form(page);
		assert.equal(now.shown.stack, "b", "a sample that fills Library B's values is Library B");
		await page.close();
	});

	it("takes a host's write literally: naming the select does not expand its preset", async () => {
		const page = await open();
		await page.evaluate(() => {
			(document.querySelector("#host") as HTMLElement & { values: object }).values = { stack: "c" };
		});
		let now = await form(page);
		assert.deepEqual(now.values, { stack: "c", connect: 5, read: 30, retries: 2, backoff: 200 }, "a host writes values, not choices");
		assert.equal(now.shown.stack, "c");

		// A host write that does not name the select is a value change like any other, so the select follows.
		await page.evaluate(() => {
			(document.querySelector("#host") as HTMLElement & { values: object }).values = { read: 60, retries: 3, backoff: 500 };
		});
		now = await form(page);
		assert.equal(now.shown.stack, "b");
		assert.equal(now.status, 'Library now shows "Library B"');
		await page.close();
	});

	it("keeps the select a labelled native control, and announces through the status region", async () => {
		const page = await open();
		const select = page.getByRole("combobox", { name: "Library" });
		assert.equal(await select.count(), 1, "the select keeps its <label for>");
		await select.selectOption("c");
		await page.getByRole("spinbutton", { name: "Retries" }).fill("4");
		const status = page.locator("#host").getByRole("status").filter({ hasText: "now shows" });
		assert.equal(await status.textContent(), 'Library now shows "Custom"', "the change is in a role=status region, not only on screen");
		assert.equal(await status.getAttribute("aria-live"), "polite");
		await page.close();
	});
});

describe("a textarea painted by the host's highlighter (#153)", () => {
	/*
	 * The `highlighted-input` fixture declares `lang: "json"` on its textarea; the bench's demo hook paints
	 * JSON with `data-tok` spans. `?code=` swaps in the deliberately broken hooks from highlight.ts. The
	 * expectations are the feature's promises read off #153, not values captured from a run.
	 */
	async function open(query = ""): Promise<Page> {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=highlighted-input${query}`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> #in-config").waitFor();
		return page;
	}
	const state = (page: Page) =>
		page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			const area = root?.querySelector("#in-config") as HTMLTextAreaElement;
			const layer = root?.querySelector(".tb-paint") as HTMLElement | null;
			return {
				wrapped: Boolean(root?.querySelector(".tb-painted")),
				painted: Boolean(root?.querySelector(".tb-painted[data-paint]")),
				hidden: layer?.getAttribute("aria-hidden") ?? null,
				// The layer ends in a space when the value ends in a newline, so the last empty line has height.
				matches: layer ? layer.textContent?.replace(/ $/, "") === area.value : false,
				tokens: layer?.querySelectorAll("[data-tok]").length ?? 0,
				textColor: getComputedStyle(area).color,
			};
		});

	it("paints through the hook behind the real textarea, which stays the labelled control", async () => {
		const page = await open();
		const now = await state(page);
		assert.equal(now.painted, true, "a textarea with lang and a host hook is painted");
		assert.equal(now.hidden, "true", "the layer is aria-hidden: the textarea is what a screen reader reads");
		assert.equal(now.matches, true, "the layer holds the textarea's own text");
		assert.ok(now.tokens > 0, "and the hook's tokens, which is the point");
		assert.match(now.textColor, /rgba\(0, 0, 0, 0\)|transparent/, `the textarea's text is transparent over the paint, got ${now.textColor}`);

		const box = page.getByRole("textbox", { name: "Client config" });
		assert.equal(await box.count(), 1, "the textarea keeps its label");
		assert.equal(await box.getAttribute("aria-describedby"), "in-config-desc in-config-err", "and its description target");
		await page.close();
	});

	it("fetches the paint chunk only for a tool that declares lang on a host with a hook", async () => {
		const fetched = async (url: string) => {
			const page = await browser.newPage();
			const scripts: string[] = [];
			page.on("request", (request) => {
				if (request.resourceType() === "script") scripts.push(request.url());
			});
			await page.goto(`${BASE}/${url}`, { waitUntil: "load" });
			await page.locator("#host").scrollIntoViewIfNeeded();
			await page.locator("#host >> .tb-form").waitFor();
			await page.waitForTimeout(200);
			await page.close();
			return scripts.filter((s) => /\/assets\/paint-[^/]+\.js$/.test(s)).length;
		};
		assert.equal(await fetched("tool.html?id=highlighted-input"), 1, "the tool that uses it fetches it once");
		assert.equal(await fetched("tool.html?id=percentiles"), 0, "a textarea without lang does not");
		assert.equal(await fetched("tool.html?id=highlighted-input&code=plain"), 0, "nor does a host with no hook to paint with");
	});

	/*
	 * STYLING.md promises a host's unlayered rule beats every runtime rule, whatever the specificity. The
	 * paint sheet arrives later, in its own chunk, so it has to be in `@layer toolbench` too. A bare `pre`
	 * selector is less specific than the runtime's `.tb-paint`, so only the layer can make it win.
	 */
	it("loses to a host's unlayered rule, like every runtime rule", async () => {
		const page = await open();
		await page.waitForFunction(() => Boolean(document.querySelector("#host")?.shadowRoot?.querySelector(".tb-painted[data-paint]")));
		const background = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot as ShadowRoot;
			const host = new CSSStyleSheet();
			host.replaceSync("pre { background: rgb(1, 2, 3); }");
			root.adoptedStyleSheets = [...root.adoptedStyleSheets, host];
			return getComputedStyle(root.querySelector(".tb-paint") as Element).backgroundColor;
		});
		assert.equal(background, "rgb(1, 2, 3)", "the host's rule must win over the paint sheet");
		await page.close();
	});

	it("exposes the same accessibility tree as the plain textarea", async () => {
		const painted = await open();
		const plain = await open("&code=plain");
		assert.equal(await state(plain).then((s) => s.wrapped), false, "no hook, no wrapper: the plain textarea exactly");
		// An allowlist by construction: the whole tree must equal the plain one, not merely lack the layer.
		assert.equal(await painted.locator("#host").ariaSnapshot(), await plain.locator("#host").ariaSnapshot());
		await painted.close();
		await plain.close();
	});

	it("gives the layer the textarea's box and font, so the caret lands on the glyph the reader sees", async () => {
		const page = await open();
		const same = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			const area = root?.querySelector("#in-config") as HTMLElement;
			const layer = root?.querySelector(".tb-paint") as HTMLElement;
			const a = getComputedStyle(area);
			const b = getComputedStyle(layer);
			const props = ["font-family", "font-size", "line-height", "letter-spacing", "word-spacing", "tab-size", "padding-top", "padding-left", "padding-right", "border-top-width", "border-left-width", "white-space", "overflow-wrap"];
			const r1 = area.getBoundingClientRect();
			const r2 = layer.getBoundingClientRect();
			return {
				differ: props.filter((p) => a.getPropertyValue(p) !== b.getPropertyValue(p)),
				box: [r1.left - r2.left, r1.top - r2.top, r1.width - r2.width, r1.height - r2.height, area.clientWidth - layer.clientWidth],
			};
		});
		assert.deepEqual(same.differ, [], "no font or box property may differ");
		assert.deepEqual(same.box, [0, 0, 0, 0, 0], "and the boxes coincide, content width included");

		// Click the left quarter of painted glyphs and read where the real caret went.
		const targets = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot;
			const area = root?.querySelector("#in-config") as HTMLTextAreaElement;
			const layer = root?.querySelector(".tb-paint") as HTMLElement;
			const box = area.getBoundingClientRect();
			const out: { i: number; x: number; y: number }[] = [];
			const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
			let offset = 0;
			for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
				for (let k = 0; k < n.data.length; k++, offset++) {
					if (n.data[k] === "\n" || offset % 9 !== 0) continue;
					const range = document.createRange();
					range.setStart(n, k);
					range.setEnd(n, k + 1);
					const rect = range.getClientRects()[0];
					if (!rect || rect.width === 0 || rect.bottom > box.bottom - 8) continue;
					out.push({ i: offset, x: rect.left + rect.width / 4, y: rect.top + rect.height / 2 });
				}
			}
			return out;
		});
		assert.ok(targets.length >= 10, `enough visible glyphs to mean something: ${targets.length}`);
		const area = page.locator("#host >> #in-config");
		for (const t of targets) {
			await page.mouse.click(t.x, t.y);
			assert.equal(await area.evaluate((el: HTMLTextAreaElement) => el.selectionStart), t.i, `clicking painted character ${t.i} put the caret elsewhere`);
		}
		await page.close();
	});

	it("follows the textarea's scroll", async () => {
		const page = await open();
		const scrolled = await page.locator("#host >> #in-config").evaluate(async (el: HTMLTextAreaElement) => {
			el.scrollTop = el.scrollHeight;
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			return [el.scrollTop, (el.parentElement?.querySelector(".tb-paint") as HTMLElement).scrollTop];
		});
		assert.ok(scrolled[0]! > 0, "the default is long enough to scroll");
		assert.equal(scrolled[1], scrolled[0], "and the layer scrolled with it");
		await page.close();
	});

	/*
	 * ⚠️ Repainting inserts nodes, and Chrome ends an undo group at any node insertion, so painting on every
	 * key made every key its own undo step. The paint waits for a pause instead, and the text shows plain
	 * until it comes.
	 */
	it("shows plain text while typing, paints at a pause, and keeps one undo for the burst", async () => {
		const page = await open();
		const area = page.locator("#host >> #in-config");
		const before = await area.inputValue();
		await area.click();
		await area.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
		await page.keyboard.type('{"added": 42,\n', { delay: 30 });
		let now = await state(page);
		assert.equal(now.painted, false, "mid-burst the textarea shows its own text");
		assert.doesNotMatch(now.textColor, /rgba\(0, 0, 0, 0\)/, "visibly, not transparent over a stale paint");
		await page.waitForTimeout(500);
		now = await state(page);
		assert.equal(now.painted, true, "painted again once typing stops");
		assert.equal(now.matches, true, "with the new text");
		await page.keyboard.press("ControlOrMeta+z");
		assert.equal(await area.inputValue(), before, "one undo takes back the burst");
		await page.close();
	});

	it("repaints a value written without a keystroke, such as a sample", async () => {
		const page = await open();
		await page.locator('#host >> .tb-sample:text-is("Short")').click();
		const now = await state(page);
		assert.equal(now.painted, true);
		assert.equal(now.matches, true, "a sample assigns value, which fires no input event, so the runtime repaints it");
		await page.close();
	});

	it("stays plain past 20,000 characters", async () => {
		const page = await open();
		const painted = (length: number) =>
			page.evaluate((n) => {
				const host = document.querySelector("#host") as HTMLElement & { values: object };
				host.values = { config: `"${"x".repeat(n - 2)}"` };
				return Boolean(host.shadowRoot?.querySelector(".tb-painted[data-paint]"));
			}, length);
		assert.equal(await painted(20_000), true, "at the cap it paints");
		assert.equal(await painted(20_001), false, "one past it, it does not");
		await page.close();
	});

	for (const [mode, what] of [
		["throw", "a hook that throws"],
		["string", "a hook that returns a string"],
		["reword", "a hook whose text is not the source, which would misplace the caret"],
	] as const) {
		it(`falls back to the plain textarea for ${what}`, async () => {
			const errors: string[] = [];
			const page = await browser.newPage();
			page.on("pageerror", (error) => errors.push(String(error)));
			await page.goto(`${BASE}/tool.html?id=highlighted-input&code=${mode}`, { waitUntil: "load" });
			await page.locator("#host >> #in-config").waitFor();
			const now = await state(page);
			assert.equal(now.painted, false, "nothing painted");
			assert.doesNotMatch(now.textColor, /rgba\(0, 0, 0, 0\)/, "and the textarea's own text visible");
			assert.deepEqual(errors, [], "without an uncaught error");
			await page.close();
		});
	}
});

describe("graphs (#152)", () => {
	/*
	 * The graph kind in a real browser: the eleven families drawn through the element, the chunks a page
	 * fetches, the keyboard and the screen reader, and the same picture in every engine as in Node.
	 */
	type Host = HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
	const ready = (page: Page) =>
		page.waitForFunction(() => [...document.querySelectorAll("tool-host")].every((h) => h.shadowRoot?.querySelector(".tb-graph-plot, .tb-graph-message:not([role=status])")), undefined, { timeout: 60_000 });

	/**
	 * What a layout draws, as one string: every node's outline, every edge's line, markers and label box. The
	 * browser builds it from the DOM, Node from the layout, so equal strings mean the same picture.
	 */
	const drawn = (L: GraphLayout) =>
		L.nodes.map((n) => n.outline).join("|") +
		"#" +
		L.edges.map((e) => [e.d, e.tail?.d ?? "", e.head?.d ?? "", e.label ? `${e.label.x},${e.label.y},${e.label.w},${e.label.h}` : ""].join(";")).join("|");

	it("draws every family as the same picture Node lays out, the large one from a worker", async () => {
		const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(String(e)));
		await page.goto(`${BASE}/graphs.html`, { waitUntil: "load" });
		await ready(page);
		const inBrowser = await page.evaluate(() =>
			Object.fromEntries(
				[...document.querySelectorAll<HTMLElement>("tool-host[data-case]")].map((h) => {
					const root = h.shadowRoot!;
					const nodes = [...root.querySelectorAll(".tb-graph-node > .tb-graph-shape")].map((p) => p.getAttribute("d"));
					const edges = [...root.querySelectorAll(".tb-graph-edge")].map((g) => {
						const bg = g.querySelector(".tb-graph-label-bg");
						const end = (e: string) => g.querySelector(`[data-end="${e}"]`)?.getAttribute("d") ?? "";
						return [g.querySelector(".tb-graph-line")?.getAttribute("d"), end("tail"), end("head"), bg ? ["x", "y", "width", "height"].map((a) => bg.getAttribute(a)).join(",") : ""].join(";");
					});
					return [h.dataset.case!, nodes.length ? `${nodes.join("|")}#${edges.join("|")}` : "refused"];
				}),
			),
		);
		// The unknown-colour case is the security test's, below, and not on the page.
		const cases = Object.keys(graphs).filter((id) => id !== "injected");
		assert.deepEqual(Object.keys(inBrowser).sort(), [...cases].sort(), "a figure per case");
		for (const id of cases) {
			const want = id === "dangling" || id === "limits" ? "refused" : drawn(layout(graphs[id]!));
			assert.equal(inBrowser[id], want, `${id} draws what Node lays out`);
		}
		/*
		 * The large one was laid out in the worker: a layout chunk was fetched there. Which one shows depends on
		 * the engine: Chromium lists the chunks the layout fetched itself (the repair, for this graph) and not the
		 * one its entry imported, so the check is any of the worker's own copies.
		 */
		const inWorker: string[] = [];
		for (const worker of page.workers()) inWorker.push(...(await worker.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name))));
		assert.ok(inWorker.some((url) => /\/assets\/worker-graph[^/]*\.js$/.test(url)), `the worker fetched the layout: ${inWorker.join(", ")}`);
		assert.deepEqual(errors, []);
		await page.close();
	});

	it("names every part for a host stylesheet, and lists every edge in a closed table", async () => {
		const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
		await page.goto(`${BASE}/graphs.html`, { waitUntil: "load" });
		await ready(page);
		const read = await page.evaluate(() => {
			const root = (id: string) => document.querySelector<HTMLElement>(`tool-host[data-case="${id}"]`)!.shadowRoot!;
			const kinds = (id: string) => [...new Set([...root(id).querySelectorAll("svg [data-kind]")].map((x) => x.getAttribute("data-kind")))].sort();
			const flow = root("flowchart");
			return {
				nested: kinds("nested"),
				lanes: kinds("lanes"),
				decisions: flow.querySelectorAll('.tb-graph-node[data-kind="node"][data-role="decision"]').length,
				part: flow.querySelector(".tb-out-graph")?.closest("[data-kind]")?.getAttribute("data-kind"),
				open: flow.querySelector("details")?.open,
				rows: flow.querySelectorAll("details tbody tr").length,
				summary: flow.querySelector("details summary")?.textContent,
				caption: flow.querySelector("details caption")?.textContent,
				label: flow.querySelector(".tb-out-graph")?.getAttribute("aria-label"),
				plot: [flow.querySelector(".tb-graph-plot")?.getAttribute("role"), flow.querySelector(".tb-graph-plot")?.getAttribute("tabindex")],
				refused: root("dangling").querySelector(".tb-graph-message")?.textContent,
			};
		});
		// Written by hand from the families: nested has nodes, edges, groups and their titles, and badges.
		assert.deepEqual(read.nested, ["badge", "edge", "group", "group-title", "node"]);
		assert.deepEqual(read.lanes, ["edge", "lane", "node"]);
		assert.equal(read.decisions, 3, "the flowchart's three diamonds carry their role");
		assert.equal(read.part, "graph");
		assert.equal(read.open, false, "the table starts closed");
		assert.equal(read.rows, 13, "one row per edge of the flowchart");
		assert.equal(read.summary, "Show the edges as a table");
		assert.equal(read.caption, "Graph, Expense approval: 11 nodes, 13 edges");
		assert.equal(read.label, "Graph, Expense approval: 11 nodes, 13 edges");
		assert.deepEqual(read.plot, ["group", "0"], "one tab stop for the picture");
		assert.equal(read.refused, 'A dangling edge: an edge names "c", which is not a node, so it is listed below instead of drawn.');
		await page.close();
	});

	it("follows the edges with the arrow keys and says so, with focus on the picture", async () => {
		const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
		await page.goto(`${BASE}/graphs.html`, { waitUntil: "load" });
		await ready(page);
		const state = page.locator('tool-host[data-case="state-orthogonal"]');
		const live = () => state.evaluate((h) => h.shadowRoot!.querySelector(".tb-graph-plot ~ .tb-sr")?.textContent);
		await state.locator(".tb-graph-plot").focus();
		// Every sentence below written by hand from the state machine's edges, in the order the graph lists them.
		assert.equal(await live(), "init, 0 in, 1 out, selected edge to cart, 1 of 1");
		await page.keyboard.press("ArrowRight");
		assert.equal(await live(), "cart, 2 in, 2 out, selected begin to checkout, 1 of 2");
		await page.keyboard.press("ArrowDown");
		assert.equal(await live(), "cart, 2 in, 2 out, selected abandon to cancelled, 2 of 2");
		await page.keyboard.press("ArrowRight");
		assert.equal(await live(), "cancelled, 3 in, 0 out");
		await page.keyboard.press("ArrowLeft");
		assert.equal(await live(), "cart, 2 in, 2 out, selected begin to checkout, 1 of 2");
		const focus = () => state.evaluate((h) => [document.activeElement === h, h.shadowRoot!.activeElement?.className]);
		assert.deepEqual(await focus(), [true, "tb-graph-plot"], "focus is on the picture, not the shadow root");
		await page.close();
	});

	it("keeps focus on the picture when a group closes under it", async () => {
		const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
		await page.goto(`${BASE}/graphs.html`, { waitUntil: "load" });
		await ready(page);
		const nested = page.locator('tool-host[data-case="nested"]');
		await nested.locator(".tb-graph-plot").focus();
		await nested.evaluate((h) => h.shadowRoot!.querySelector('[data-kind="group-title"][data-id="vpc"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		await nested.locator('[data-kind="collapsed-group"][data-id="vpc"]').waitFor({ timeout: 15_000 });
		assert.deepEqual(
			await nested.evaluate((h) => [document.activeElement === h, h.shadowRoot!.activeElement?.className]),
			[true, "tb-graph-plot"],
			"redrawn under the focus, the picture keeps it",
		);
		await page.close();
	});

	it("fetches only the base chunk for a plain layered graph, and announces the result", async () => {
		const page = await browser.newPage();
		const scripts: string[] = [];
		page.on("request", (request) => scripts.push(request.url()));
		await page.goto(`${BASE}/tool.html?id=build-order`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		// The page host runs its defaults as soon as it is visible.
		await page.locator("#host >> .tb-graph-plot").waitFor({ timeout: 15_000 });
		// An allowlist: the base and nothing else of the graph kind, so a chunk that should not have loaded fails.
		const graphChunks = scripts.filter((url) => /\/assets\/graph[^/]*\.js$/.test(url)).map((url) => url.replace(/^.*\/assets\//, "").replace(/-[A-Za-z0-9_-]{8}\.js$/, ""));
		assert.deepEqual(graphChunks, ["graph"]);
		const said = await page.evaluate(() => document.querySelector("#host")!.shadowRoot!.querySelector(".tb-announce")?.textContent);
		assert.equal(said, "3 fields, Graph, Package dependencies: 9 nodes, 12 edges");
		await page.close();
	});

	it("draws a colour it does not know as the default, and never puts the string into a style", async () => {
		/*
		 * `color` is a closed union only to TypeScript: a plain-JavaScript tool, or one passing a reader's input
		 * through, can send anything. Interpolated into an inline style, this one added a background fetched from
		 * another origin. Every request the page makes is logged, so a fetch would show here whatever the engine.
		 */
		const page = await browser.newPage();
		const requests: string[] = [];
		page.on("request", (request) => requests.push(request.url()));
		await page.goto(`${BASE}/tool.html?id=graph-families`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		await page.evaluate(async () => {
			const host = document.querySelector("#host") as Host;
			host.values = { case: "injected" };
			await host.run();
		});
		await page.locator("#host >> .tb-graph-plot").waitFor({ timeout: 15_000 });
		await page.waitForTimeout(500);
		const read = await page.evaluate(() => {
			const root = document.querySelector("#host")!.shadowRoot!;
			const styled = [...root.querySelectorAll("[style]")].map((x) => x.getAttribute("style") ?? "").filter((s) => s.includes("example.com") || s.includes("background"));
			const stroke = (id: string) => getComputedStyle(root.querySelector(`.tb-graph-node[data-id="${id}"] > .tb-graph-shape`)!).stroke;
			const edge = root.querySelector(".tb-graph-edge")!;
			return { styled, a: stroke("a"), b: stroke("b"), color: [root.querySelector('.tb-graph-node[data-id="a"]')!.getAttribute("data-color"), edge.getAttribute("data-color")] };
		});
		assert.deepEqual(read.styled, [], "no style carries the string");
		assert.equal(read.a, read.b, "the node with the unknown colour is stroked like the one with none");
		assert.deepEqual(read.color, [null, null], "and carries no data-color");
		assert.deepEqual(requests.filter((url) => url.includes("example.com")), [], "nothing is fetched from another origin");
		await page.close();
	});

	/** A closed card seeded with `graph`, alone on a fresh page, so no other host has fetched a chunk it needs. */
	async function seededGraphCard(page: Page, graph: Graph): Promise<Locator> {
		await page.goto(`${BASE}/tool.html?id=wide-output`, { waitUntil: "load" });
		await page.evaluate(async (graph) => {
			await customElements.whenDefined("tool-host");
			const host = document.createElement("tool-host") as HTMLElement & { seed: unknown };
			host.id = "seeded-graph";
			host.setAttribute("tool", "graph-families");
			host.setAttribute("mode", "card");
			host.seed = { kind: "graph", graph };
			document.body.prepend(host);
		}, graph);
		const card = page.locator("#seeded-graph");
		await card.locator(".tb-facade").waitFor({ timeout: 15_000 });
		return card;
	}

	it("draws every graph family in a closed seeded card, the chunks its layout asks for included (#201)", async () => {
		/*
		 * The bipartite graph's layout asks for the crossing search only once it sees what the base placement
		 * left, so it is not in `needs()`, and the seed was painted without it: the card said "The chart could
		 * not be loaded." in place of the graph. One page per case, because a chunk fetched for one graph would
		 * hide the miss in the next.
		 */
		const wrong: string[] = [];
		for (const [id, graph] of Object.entries(graphs)) {
			const page = await browser.newPage();
			const card = await seededGraphCard(page, graph);
			const text = (await card.locator(".tb-facade").textContent()) ?? "";
			const figures = await card.locator(".tb-out-graph").count();
			if (/could not be loaded/.test(text) || figures !== 1) wrong.push(`${id}: ${figures} figures, "${text.replace(/\s+/g, " ").trim().slice(0, 80)}"`);
			await page.close();
		}
		assert.deepEqual(wrong, [], "every seeded graph is drawn as a graph");
	});

	it("says the graph, not the chart, could not be loaded when its chunk is refused", async () => {
		const page = await browser.newPage();
		await page.route(/\/assets\/graph-[A-Za-z0-9_-]{8}\.js$/, (route) => route.abort());
		const card = await seededGraphCard(page, graphs["state-orthogonal"]!);
		assert.equal(await card.locator(".tb-facade .tb-status").textContent(), "The graph could not be loaded.");
		await page.close();
	});

	it("lists a node with no edges as one, so a reader of the table alone still finds it", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=build-order`, { waitUntil: "load" });
		await page.locator("#host >> .tb-form").waitFor({ timeout: 15_000 });
		await page.evaluate(async () => {
			const host = document.querySelector("#host") as Host;
			host.values = { deps: "solo" };
			await host.run();
		});
		await page.locator("#host >> .tb-graph-plot").waitFor({ timeout: 15_000 });
		const rows = await page.evaluate(() => [...document.querySelector("#host")!.shadowRoot!.querySelectorAll(".tb-graph-data tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent)));
		assert.deepEqual(rows, [["solo", "no edges"]]);
		await page.close();
	});
});

describe("a textarea painted by the tool's own grammar (#163)", () => {
	/*
	 * The `grammar-input` fixture's Machine textarea declares `lang: "doors"`, which the bench's hook does not
	 * know, and a grammar: keywords initial, state, on and final, `#` comments, `->` and `:` operators, and `"`
	 * strings. Its Labels textarea declares `lang: "json"`, which the hook does know, beside a grammar of its
	 * own, so the hook should win there. Every expectation is read off that manifest by hand.
	 */
	async function open(query = "", options: { blockPaint?: boolean; scheme?: "light" | "dark" } = {}): Promise<Page> {
		const page = await browser.newPage(options.scheme ? { colorScheme: options.scheme } : {});
		if (options.blockPaint) await page.route(/\/assets\/paint-[^/]+\.js$/, (route) => route.abort());
		await page.goto(`${BASE}/tool.html?id=grammar-input${query}`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> #in-machine").waitFor();
		return page;
	}
	const layerOf = (page: Page, id: string) =>
		page.evaluate((id) => {
			const area = document.querySelector("#host")?.shadowRoot?.querySelector(`#in-${id}`) as HTMLTextAreaElement;
			const wrap = area.parentElement as HTMLElement;
			const layer = wrap.querySelector(".tb-paint");
			return {
				painted: wrap.hasAttribute("data-paint"),
				grammar: Boolean(layer?.querySelector("[data-grammar]")),
				hook: Boolean(layer?.querySelector("[data-highlight-hook]")),
				matches: layer ? layer.textContent?.replace(/ $/, "") === area.value : false,
				tokens: [...(layer?.querySelectorAll("[data-tok]") ?? [])].map((t) => [t.getAttribute("data-tok"), t.textContent]),
			};
		}, id);

	// The default Machine text, tokenised by hand from the grammar's rules.
	const transition = [["keyword", "on"], ["operator", ":"], ["operator", "->"]];
	const expected = [
		["comment", "# A door that locks"],
		["keyword", "initial"],
		["keyword", "state"],
		["keyword", "state"],
		["string", '"needs a key"'],
		...transition,
		...transition,
		...transition,
		...transition,
	];

	for (const [query, what] of [
		["", "a host hook that does not know the language"],
		["&code=plain", "no host hook at all"],
	] as const) {
		it(`paints the tool's grammar under ${what}`, async () => {
			const page = await open(query);
			const now = await layerOf(page, "machine");
			assert.equal(now.painted, true);
			assert.equal(now.grammar, true, "the grammar's paint, not the hook's");
			assert.equal(now.matches, true, "and the textarea's own text, exactly");
			assert.deepEqual(now.tokens, expected);
			await page.close();
		});
	}

	it("lets a host hook win for a language it knows", async () => {
		const page = await open();
		const now = await layerOf(page, "labels");
		assert.equal(now.painted, true);
		assert.equal(now.hook, true, "the bench's JSON highlighter painted it");
		assert.equal(now.grammar, false, "and the tool's grammar did not");
		await page.close();
	});

	it("fetches the paint chunk for a grammar even on a host with no hook", async () => {
		const page = await browser.newPage();
		const scripts: string[] = [];
		page.on("request", (request) => {
			if (request.resourceType() === "script") scripts.push(request.url());
		});
		await page.goto(`${BASE}/tool.html?id=grammar-input&code=plain`, { waitUntil: "load" });
		await page.locator("#host").scrollIntoViewIfNeeded();
		await page.locator("#host >> .tb-painted[data-paint]").first().waitFor();
		assert.equal(scripts.filter((s) => /\/assets\/paint-[^/]+\.js$/.test(s)).length, 1, "the grammar lives in that chunk, not in boot");
		await page.close();
	});

	it("leaves the accessibility tree exactly as the plain textarea's", async () => {
		const painted = await open();
		// The baseline is the same page with the paint chunk refused, which the runtime answers with plain textareas.
		const plain = await open("", { blockPaint: true });
		assert.equal(await plain.locator("#host >> .tb-painted").count(), 0, "the baseline really is unpainted");
		assert.equal(await painted.locator("#host >> .tb-paint").first().getAttribute("aria-hidden"), "true");
		assert.equal(await painted.locator("#host").ariaSnapshot(), await plain.locator("#host").ariaSnapshot());
		await painted.close();
		await plain.close();
	});

	it("puts the caret on the glyph that was clicked", async () => {
		const page = await open();
		const targets = await page.evaluate(() => {
			const area = document.querySelector("#host")?.shadowRoot?.querySelector("#in-machine") as HTMLTextAreaElement;
			const layer = area.parentElement?.querySelector(".tb-paint") as HTMLElement;
			const box = area.getBoundingClientRect();
			const out: { i: number; x: number; y: number }[] = [];
			const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
			let offset = 0;
			for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
				for (let k = 0; k < n.data.length; k++, offset++) {
					if (n.data[k] === "\n" || offset % 7 !== 0) continue;
					const range = document.createRange();
					range.setStart(n, k);
					range.setEnd(n, k + 1);
					const rect = range.getClientRects()[0];
					if (!rect || rect.width === 0 || rect.bottom > box.bottom - 8) continue;
					out.push({ i: offset, x: rect.left + rect.width / 4, y: rect.top + rect.height / 2 });
				}
			}
			return out;
		});
		assert.ok(targets.length >= 10, `enough visible glyphs to mean something: ${targets.length}`);
		const area = page.locator("#host >> #in-machine");
		for (const t of targets) {
			await page.mouse.click(t.x, t.y);
			assert.equal(await area.evaluate((el: HTMLTextAreaElement) => el.selectionStart), t.i, `clicking painted character ${t.i} put the caret elsewhere`);
		}
		await page.close();
	});

	/*
	 * Every way a regular expression runs goes through one of these: String's match, matchAll, replace, search
	 * and split call the RegExp's symbol methods, and test calls exec. Counted across a repaint, which a host's
	 * `values` write triggers synchronously for every painted textarea on the tool.
	 *
	 * With no hook, both textareas are painted by their grammars, so the count must be zero. With the bench's
	 * hook, the JSON textarea is painted by it, and it tokenises with regular expressions: that run is the
	 * control, because a count of zero there would mean the counter counts nothing.
	 */
	const regexCalls = (page: Page) =>
		page.evaluate(() => {
			const proto = RegExp.prototype as unknown as Record<string | symbol, (...args: unknown[]) => unknown>;
			const names: (string | symbol)[] = ["exec", "test", Symbol.match, Symbol.matchAll, Symbol.replace, Symbol.search, Symbol.split];
			const originals = names.map((name) => proto[name]);
			let calls = 0;
			names.forEach((name, i) => {
				proto[name] = function (this: RegExp, ...args: unknown[]) {
					calls++;
					return (originals[i] as (...a: unknown[]) => unknown).apply(this, args);
				};
			});
			try {
				const host = document.querySelector("#host") as HTMLElement & { values: Record<string, string> };
				host.values = { machine: '# longer now\ninitial a\nstate b "x \\" y"\non go: a -> b\n'.repeat(20), labels: '{"go": "Go", "back": "Back"}' };
			} finally {
				names.forEach((name, i) => (proto[name] = originals[i] as (...args: unknown[]) => unknown));
			}
			return calls;
		});

	it("never runs a regular expression to paint", async () => {
		const grammarOnly = await open("&code=plain");
		assert.equal(await regexCalls(grammarOnly), 0, "both grammars painted, and not one regular expression ran");
		assert.equal((await layerOf(grammarOnly, "machine")).grammar, true, "and they did paint");
		assert.equal((await layerOf(grammarOnly, "labels")).grammar, true);
		await grammarOnly.close();

		const withHook = await open();
		assert.ok((await regexCalls(withHook)) > 0, "the control: the host's JSON hook runs regular expressions, and the counter sees them");
		await withHook.close();
	});

	for (const scheme of ["light", "dark"] as const) {
		it(`keeps every token at 4.5:1 on the field (${scheme})`, async () => {
			const page = await open("", { scheme });
			const worst = await page.evaluate(() => {
				const lum = (rgb: string) => {
					const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
						const c = Number(v) / 255;
						return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
					}) as [number, number, number];
					return 0.2126 * r + 0.7152 * g + 0.0722 * b;
				};
				const layer = document.querySelector("#host")?.shadowRoot?.querySelector("#in-machine")?.parentElement?.querySelector(".tb-paint") as HTMLElement;
				const bg = lum(getComputedStyle(layer).backgroundColor);
				const ratios = [...layer.querySelectorAll("[data-tok]")].map((t) => {
					const fg = lum(getComputedStyle(t).color);
					return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
				});
				return { kinds: new Set([...layer.querySelectorAll("[data-tok]")].map((t) => t.getAttribute("data-tok"))).size, worst: Math.min(...ratios) };
			});
			assert.equal(worst.kinds, 4, "all four token kinds are on screen to be measured");
			assert.ok(worst.worst >= 4.5, `the worst token measured ${worst.worst.toFixed(2)}:1`);
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

describe("a result wider than its tool scrolls inside it, and is never clipped (#194)", () => {
	/*
	 * An entity-relationship graph 916px wide, in a tool whose frame was 822px, lost its right edge with no
	 * way to scroll to it: its figure was a grid item of `.tb-output` with the default `min-width: auto`, so
	 * it grew to the drawing, the plot's own `overflow-x: auto` never engaged, and `.tb` clipped the rest.
	 * #154 was the same mistake one level up, fixed for `.tb-output` alone, so this holds every kind at once.
	 *
	 * Every case of the three fixtures that between them cover every kind, in every mode, at a phone's width
	 * and a column's. For each host: the frame never scrolls; anything wider than its own box is either a
	 * scroller or inside one; and every scroller lies within the frame. An allowlist of what may overflow,
	 * not a list of the elements that once did. Every `<details>` is opened first, since a chart's and a
	 * graph's data tables are inside one, and the readout is tested at a plot's right edge, where it is
	 * most likely to push past the frame.
	 */
	const ctx = { signal: new AbortController().signal, progress: () => undefined } satisfies Ctx;
	const casesOf = (dir: string) =>
		(JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", dir, "tool.json"), "utf8")).inputs[0].options as { value: string }[]).map((o) => o.value);
	type CaseTool = Tool<{ case: string }>;
	// `large` is laid out in a worker after a frame, and its width is the graph-scale suite's business.
	const sources: [string, CaseTool, string[]][] = [
		["wide-output", wideOutput, casesOf("wide-output")],
		["discrete-series", discreteSeries as unknown as CaseTool, casesOf("discrete-series")],
		["graph-families", graphFamilies, casesOf("graph-families").filter((c) => c !== "large")],
	];
	const all = async () => {
		const out: { tool: string; case: string; seed: Output }[] = [];
		for (const [tool, module, cases] of sources) for (const c of cases) out.push({ tool, case: c, seed: await module.run({ case: c }, ctx) });
		return out;
	};
	const modes = ["page", "embed", "card", "closed-card"] as const;

	async function measure(width: number, mode: (typeof modes)[number]): Promise<string[]> {
		const cases = await all();
		const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		await page.goto(`${BASE}/tool.html?id=wide-output`, { waitUntil: "load" });
		await page.evaluate(
			async ({ width, mode, cases }) => {
				await customElements.whenDefined("tool-host");
				const box = document.createElement("div");
				box.id = "narrow";
				box.style.cssText = `width:${width}px;display:grid;gap:16px;margin:16px`;
				document.body.prepend(box);
				type Host = HTMLElement & { values: Record<string, unknown>; seed: unknown; run(): Promise<void> };
				const hosts: Host[] = [];
				for (const c of cases) {
					const host = document.createElement("tool-host") as Host;
					host.setAttribute("tool", c.tool);
					host.setAttribute("mode", mode === "closed-card" ? "card" : mode);
					if (mode === "embed") host.setAttribute("controls", "none");
					host.dataset.case = `${c.tool}/${c.case}`;
					if (mode === "closed-card") host.seed = c.seed;
					box.append(host);
					hosts.push(host);
				}
				if (mode !== "closed-card") {
					for (const [i, host] of hosts.entries()) {
						host.values = { case: (cases[i] as { case: string }).case };
						await host.run();
					}
				}
				// Drawn, not degraded: a seeded graph used to fall back to a status line here when its layout asked for a chunk (#201).
				// And every chart in it the measured drawing (#236), since the first one is 640 wide whatever the frame.
				const drawn = (h: Host) =>
					h.shadowRoot?.querySelector("[data-kind]") &&
					[...h.shadowRoot.querySelectorAll("figure.tb-out-chart")].filter((f) => f.getClientRects().length > 0).every((f) => f.hasAttribute("data-fitted"));
				const deadline = Date.now() + 15_000;
				while (!hosts.every(drawn)) {
					if (Date.now() > deadline) throw new Error(`never drew: ${hosts.filter((h) => !drawn(h)).map((h) => h.dataset.case)}`);
					await new Promise((r) => setTimeout(r, 50));
				}
				for (const h of hosts) for (const d of h.shadowRoot?.querySelectorAll("details") ?? []) d.open = true;
				await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			},
			{ width, mode, cases },
		);

		const check = () =>
			page.evaluate(() => {
				const scrolls = (el: Element) => /^(auto|scroll)$/.test(getComputedStyle(el).overflowX);
				const name = (el: Element) => `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).join(".")}` : ""}`;
				const problems: string[] = [];
				const column = (document.getElementById("narrow") as HTMLElement).getBoundingClientRect();
				for (const host of document.querySelectorAll<HTMLElement>("#narrow > tool-host")) {
					const at = host.dataset.case;
					const frame = host.shadowRoot?.querySelector(".tb") as HTMLElement;
					const fr = frame.getBoundingClientRect();
					if (fr.right > column.right + 1) problems.push(`${at}: the tool is ${Math.round(fr.width)}px in a ${Math.round(column.width)}px column`);
					if (frame.scrollWidth > frame.clientWidth + 1) problems.push(`${at}: .tb clips, ${frame.clientWidth}/${frame.scrollWidth}`);
					for (const el of frame.querySelectorAll<HTMLElement>("*")) {
						// An inline box has no clientWidth to compare with: Firefox reports 0/262 for a value's span. Its block is checked.
						if (!(el instanceof HTMLElement) || el.closest(".tb-sr") || /^(inline|contents)$/.test(getComputedStyle(el).display)) continue;
						if (scrolls(el) && el.scrollWidth > el.clientWidth + 1) {
							const r = el.getBoundingClientRect();
							if (r.right > fr.right + 1 || r.left < fr.left - 1) problems.push(`${at}: ${name(el)} scrolls but is ${Math.round(r.width)}px in a ${Math.round(fr.width)}px frame`);
							continue;
						}
						if (el.scrollWidth <= el.clientWidth + 1) continue;
						let up = el.parentElement;
						while (up && up !== frame && !scrolls(up)) up = up.parentElement;
						if (up !== frame && up !== null) continue;
						// Which descendant reaches furthest, so a failure names the cause and not only its ancestors.
						const far = [...el.querySelectorAll("*")].reduce<Element>((a, b) => (b.getBoundingClientRect().right > a.getBoundingClientRect().right ? b : a), el);
						problems.push(`${at}: ${name(el)} overflows with nothing to scroll it, ${el.clientWidth}/${el.scrollWidth} overflow-x:${getComputedStyle(el).overflowX}, furthest ${name(far)}`);
					}
				}
				return problems;
			});

		const problems = await check();
		// The readout at each plot's right edge, where it either flips to the left or pushes the frame wider.
		if (mode === "embed") {
			const plots = await page.evaluate(() =>
				[...document.querySelectorAll<HTMLElement>("#narrow > tool-host")].flatMap((host) =>
					[...(host.shadowRoot?.querySelectorAll("[data-kind] svg") ?? [])].filter((s) => !s.parentElement?.closest("svg")).map((_, i) => ({ host: host.dataset.case as string, i })),
				),
			);
			for (const { host, i } of plots) {
				const point = await page.evaluate(
					({ host, i }) => {
						const el = document.querySelector<HTMLElement>(`#narrow > tool-host[data-case="${host}"]`);
						const svg = [...(el?.shadowRoot?.querySelectorAll("[data-kind] svg") ?? [])].filter((s) => !s.parentElement?.closest("svg"))[i] as SVGSVGElement;
						svg.scrollIntoView({ block: "center", inline: "nearest" });
						const r = svg.getBoundingClientRect();
						const frame = (el?.shadowRoot?.querySelector(".tb") as HTMLElement).getBoundingClientRect();
						return { x: Math.min(r.right, frame.right) - 6, y: r.top + r.height / 2 };
					},
					{ host, i },
				);
				await page.mouse.move(point.x, point.y);
				for (const p of await check()) if (!problems.includes(p)) problems.push(`with the pointer at the right edge, ${p}`);
			}
		}
		await page.close();
		return problems;
	}

	for (const width of [320, 600]) {
		for (const mode of modes) {
			it(`fits or scrolls every kind at ${width}px in ${mode === "closed-card" ? "a closed seeded card" : `${mode} mode`}`, async () => {
				const problems = await measure(width, mode);
				assert.deepEqual(problems, [], problems.join("\n"));
			});
		}
	}
});

describe("a wide graph fits its plot, and the reader can show it at full size (#198)", () => {
	/*
	 * The wide-output fixture's graph is an eight-stage chain laid out left to right, far wider than a phone.
	 * Every expectation follows from the spec rather than from what the runtime draws: scaled down to the
	 * plot and never up, the viewBox's proportions kept, a button only while scaling happens, and the frame
	 * never wider than itself in either state.
	 */
	type Box = { natural: number; ratio: number; svgW: number; svgH: number; plot: number; plotScroll: number; frame: number; frameScroll: number; button: null | { hidden: boolean; pressed: string | null; label: string | null; w: number; h: number; bottom: number; part: string | null }; svgTop: number };
	async function open(width: number, attrs: Record<string, string> = {}, query = "", graphCase = "graph"): Promise<Page> {
		const page = await browser.newPage({ viewport: { width: Math.max(width + 100, 800), height: 900 } });
		await page.goto(`${BASE}/tool.html?id=wide-output${query}`, { waitUntil: "load" });
		await page.evaluate(
			async ({ width, attrs, graphCase }) => {
				await customElements.whenDefined("tool-host");
				const box = document.createElement("div");
				box.id = "narrow";
				box.style.cssText = `width:${width}px;margin:16px`;
				document.body.prepend(box);
				const host = document.createElement("tool-host") as HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
				host.id = "wide";
				host.setAttribute("tool", "wide-output");
				host.setAttribute("mode", "embed");
				host.setAttribute("controls", "none");
				for (const [k, v] of Object.entries(attrs)) host.setAttribute(k, v);
				box.append(host);
				host.values = { case: graphCase };
				await host.run();
				await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			},
			{ width, attrs, graphCase },
		);
		return page;
	}
	const measure = (page: Page) =>
		page.evaluate((): Box => {
			const root = document.getElementById("wide")?.shadowRoot as ShadowRoot;
			const plot = root.querySelector(".tb-graph-plot") as HTMLElement;
			const pic = plot.querySelector("svg") as SVGSVGElement;
			const frame = root.querySelector(".tb") as HTMLElement;
			const [, , vw, vh] = (pic.getAttribute("viewBox") ?? "0 0 0 0").split(" ").map(Number) as [number, number, number, number];
			const r = pic.getBoundingClientRect();
			const b = root.querySelector<HTMLElement>("[part='wide-toggle']");
			const br = b?.getBoundingClientRect();
			return {
				natural: vw,
				ratio: vh / vw,
				svgW: r.width,
				svgH: r.height,
				plot: plot.clientWidth,
				plotScroll: plot.scrollWidth,
				frame: frame.clientWidth,
				frameScroll: frame.scrollWidth,
				svgTop: r.top,
				button: b && br ? { hidden: b.offsetParent === null, pressed: b.getAttribute("aria-pressed"), label: b.getAttribute("aria-label"), w: br.width, h: br.height, bottom: br.bottom, part: b.getAttribute("part") } : null,
			};
		});
	const fits = (m: Box, why: string) => {
		assert.ok(m.frameScroll <= m.frame + 1, `${why}: the frame does not overflow, ${m.frame}/${m.frameScroll}`);
		assert.ok(m.svgW <= m.plot + 1, `${why}: the drawing is no wider than its plot, ${m.svgW} in ${m.plot}`);
	};
	const scaled = (m: Box) => {
		assert.ok(m.svgW < m.natural, `drawn smaller than its natural ${m.natural}px: ${m.svgW}`);
		assert.ok(Math.abs(m.svgH / m.svgW - m.ratio) < 0.01, `proportions kept: ${m.svgH / m.svgW} against ${m.ratio}`);
		fits(m, "fitted");
	};
	const full = (m: Box) => {
		assert.ok(Math.abs(m.svgW - m.natural) < 1, `drawn at its natural ${m.natural}px: ${m.svgW}`);
		assert.ok(m.plotScroll > m.plot, `and the plot scrolls: ${m.plot}/${m.plotScroll}`);
		assert.ok(m.frameScroll <= m.frame + 1, `the frame does not overflow at full size, ${m.frame}/${m.frameScroll}`);
	};

	it("fits a wide graph by default, and offers the button, above the drawing and 24px or more", async () => {
		const page = await open(390);
		const m = await measure(page);
		scaled(m);
		assert.ok(m.button && !m.button.hidden, "a scaled graph offers the button");
		assert.equal(m.button.pressed, "false");
		assert.equal(m.button.label, "Show at full size");
		assert.ok(m.button.w >= 24 && m.button.h >= 24, `a 24px target: ${m.button.w}x${m.button.h}`);
		assert.ok(m.button.bottom <= m.svgTop + 0.5, `outside the drawing, so it covers no node: button ends at ${m.button.bottom}, drawing starts at ${m.svgTop}`);
		await page.close();
	});

	it("never scales a graph up, and offers no button for one that fits", async () => {
		const page = await open(1700);
		const m = await measure(page);
		assert.ok(Math.abs(m.svgW - m.natural) < 1, `drawn at its natural ${m.natural}px in a ${m.plot}px plot: ${m.svgW}`);
		assert.ok(!m.button || m.button.hidden, "no button when nothing was scaled");
		await page.close();
	});

	it("toggles to full size and back, keeping the graph's focus, selection and keyboard", async () => {
		const page = await open(390);
		const hot = () => page.evaluate(() => [...(document.getElementById("wide")?.shadowRoot?.querySelectorAll(".tb-graph-node.tb-hot") ?? [])].map((n) => n.getAttribute("data-id")));
		const focused = () => page.evaluate(() => document.getElementById("wide")?.shadowRoot?.activeElement?.className ?? null);
		await page.locator("#wide >> .tb-graph-plot").focus();
		await page.keyboard.press("ArrowRight");
		const before = await hot();
		assert.deepEqual(before, ["decode"], "the keyboard moved from the first stage to the second");
		await page.locator("#wide >> [part='wide-toggle']").click();
		full(await measure(page));
		assert.equal((await measure(page)).button?.pressed, "true");
		assert.equal(await focused(), "tb-graph-plot", "a click on the button leaves focus in the graph");
		assert.deepEqual(await hot(), before, "and the selection where it was");
		await page.keyboard.press("ArrowRight");
		assert.deepEqual(await hot(), ["validate"], "and the arrow keys still walk the graph");
		// From the keyboard: the button is a control of its own, and Enter and Space both press it.
		await page.locator("#wide >> [part='wide-toggle']").focus();
		await page.keyboard.press("Enter");
		scaled(await measure(page));
		await page.keyboard.press(" ");
		full(await measure(page));
		await page.close();
	});

	it("keeps the path highlight across the toggle", async () => {
		const page = await open(390);
		const path = () => page.evaluate(() => document.getElementById("wide")?.shadowRoot?.querySelectorAll(".tb-graph-plot .tb-path").length ?? 0);
		await page.locator("#wide >> .tb-graph-plot").focus();
		await page.keyboard.press(" ");
		await page.keyboard.press("End");
		await page.keyboard.press(" ");
		await page.waitForFunction(() => (document.getElementById("wide")?.shadowRoot?.querySelectorAll(".tb-graph-plot .tb-path").length ?? 0) > 0);
		const lit = await path();
		await page.locator("#wide >> [part='wide-toggle']").click();
		assert.equal(await path(), lit, "the same path is lit at full size");
		await page.close();
	});

	it("hides the button once the host widens enough to draw the graph whole", async () => {
		const page = await open(390);
		assert.ok((await measure(page)).button?.hidden === false);
		await page.setViewportSize({ width: 1800, height: 900 });
		await page.evaluate(() => ((document.getElementById("narrow") as HTMLElement).style.width = "1700px"));
		await page.waitForFunction(() => document.getElementById("wide")?.shadowRoot?.querySelector<HTMLElement>("[part='wide-toggle']")?.offsetParent === null);
		const m = await measure(page);
		assert.ok(Math.abs(m.svgW - m.natural) < 1, `natural size once there is room: ${m.svgW} of ${m.natural}`);
		await page.close();
	});

	it("draws at full size under wide=\"scroll\", with the button pressed", async () => {
		const page = await open(390, { wide: "scroll" });
		const m = await measure(page);
		full(m);
		assert.equal(m.button?.pressed, "true");
		await page.close();
	});

	it("hides the button under wide-toggle=\"false\", and still fits", async () => {
		const page = await open(390, { "wide-toggle": "false" });
		const m = await measure(page);
		scaled(m);
		assert.ok(!m.button || m.button.hidden, "no button");
		await page.close();
	});

	it("takes defineToolHost({ wide: \"scroll\" }), and lets the attribute override it", async () => {
		const page = await open(390, {}, "&wide=scroll");
		full(await measure(page));
		await page.close();
		const back = await open(390, { wide: "fit" }, "&wide=scroll");
		scaled(await measure(back));
		await back.close();
	});

	it("takes defineToolHost({ wideToggle: false }), and lets the attribute override it", async () => {
		const page = await open(390, {}, "&wideToggle=false");
		const m = await measure(page);
		scaled(m);
		assert.ok(!m.button || m.button.hidden, "no button");
		await page.close();
		const back = await open(390, { "wide-toggle": "true" }, "&wideToggle=false");
		assert.ok((await measure(back)).button?.hidden === false, "the attribute brings it back");
		await back.close();
	});
});

describe("chart labels keep their size at any width (#210)", () => {
	/*
	 * A chart was drawn into a 640-unit viewBox and scaled to its panel, text and all: measured, a tick was
	 * 4.6px at a 330px panel and 22px at 1440, and a pie's slice share 3.2px. Every label of every
	 * discrete-series case is read here as the reader gets it: font size times the drawing's scale, both
	 * axes of that scale, and its box against the picture's and against every other label's.
	 */
	const cases = (JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "discrete-series", "tool.json"), "utf8")).inputs[0].options as { value: string }[]).map((o) => o.value);

	/** Every label that breaks a rule, at a panel `width` wide with the host's `style`, and each picture's width. */
	async function labels(width: number, style = "", size: [number, number] = [11, 14]): Promise<{ wrong: string[]; widths: number[] }> {
		const page = await browser.newPage({ viewport: { width: Math.max(1280, width + 64), height: 900 } });
		await page.goto(`${BASE}/tool.html?id=wide-output`, { waitUntil: "load" });
		const read = await page.evaluate(
			async ({ width, cases, style, size }) => {
				await customElements.whenDefined("tool-host");
				const box = document.createElement("div");
				box.style.cssText = `width:${width}px;display:grid;gap:16px;margin:16px`;
				document.body.prepend(box);
				type Host = HTMLElement & { values: Record<string, unknown>; run(): Promise<void> };
				const hosts: Host[] = [];
				for (const c of cases) {
					const host = document.createElement("tool-host") as Host;
					host.setAttribute("tool", "discrete-series");
					host.setAttribute("mode", "embed");
					host.setAttribute("controls", "none");
					host.dataset.case = c;
					// On the host itself: the runtime declares --tb-font on :host, which an ancestor's value would not reach past.
					host.style.cssText = style;
					box.append(host);
					hosts.push(host);
				}
				for (const [i, host] of hosts.entries()) {
					host.values = { case: cases[i] as string };
					await host.run();
				}
				// Every chart the drawing a reader keeps (#236): laid out at its measured width, and marked so.
				const fitted = () =>
					hosts.every((h) => [...(h.shadowRoot?.querySelectorAll("figure.tb-out-chart") ?? [])].every((f) => f.hasAttribute("data-fitted")));
				for (const deadline = Date.now() + 15_000; !fitted(); ) {
					if (Date.now() > deadline) throw new Error("a chart was never fitted to its width");
					await new Promise((r) => setTimeout(r, 20));
				}
				const out: string[] = [];
				const widths: number[] = [];
				for (const host of hosts) {
					for (const picture of host.shadowRoot!.querySelectorAll<SVGSVGElement>(".tb-output svg[role=img]")) {
						const frame = picture.getBoundingClientRect();
						widths.push(frame.width);
						const texts = [...picture.querySelectorAll<SVGTextElement>("text")].filter((t) => (t.textContent ?? "").trim() !== "");
						const boxes = texts.map((t) => t.getBoundingClientRect());
						texts.forEach((t, k) => {
							const name = `${host.dataset.case} ${t.getAttribute("class")} "${t.textContent}"`;
							const m = t.getScreenCTM()!;
							const sx = Math.hypot(m.a, m.b);
							const sy = Math.hypot(m.c, m.d);
							const px = parseFloat(getComputedStyle(t).fontSize) * sy;
							if (px < size[0] || px > size[1]) out.push(`${name}: ${px.toFixed(1)}px`);
							if (Math.abs(sx - sy) > 0.01) out.push(`${name}: stretched ${sx.toFixed(2)} by ${sy.toFixed(2)}`);
							const b = boxes[k]!;
							if (b.left < frame.left - 1 || b.right > frame.right + 1 || b.top < frame.top - 1 || b.bottom > frame.bottom + 1) out.push(`${name}: outside its picture`);
							for (let j = 0; j < k; j++) {
								const o = boxes[j]!;
								const overlap = Math.min(b.right, o.right) - Math.max(b.left, o.left) > 1 && Math.min(b.bottom, o.bottom) - Math.max(b.top, o.top) > 1;
								if (overlap) out.push(`${name}: overlaps "${texts[j]!.textContent}"`);
							}
						});
					}
				}
				return { wrong: out, widths };
			},
			{ width, cases, style, size },
		);
		await page.close();
		return read;
	}

	for (const width of [330, 1440]) {
		it(`draws every label between 11 and 14px, unstretched, inside its picture and clear of the others, at ${width}px`, async () => {
			const { wrong } = await labels(width);
			assert.deepEqual(wrong.slice(0, 40), [], `${wrong.length} labels wrong`);
		});
	}

	it("draws labels at the size a host sets with --tb-chart-font, with room made for them", async () => {
		// 16px, the size a host might want for a reader at arm's length; the donut's total is 1.15 times it.
		const { wrong } = await labels(330, "--tb-chart-font: 16px", [15.9, 18.5]);
		assert.deepEqual(wrong.slice(0, 40), [], `${wrong.length} labels wrong`);
	});

	it("stacks labels by the face's measured box, not by its size", async () => {
		/*
		 * In CI on Linux every engine failed the tests above on the treemap alone: a tile's value overlapped its
		 * own name, because the value sat a fixed number of em below the name and the Linux faces' boxes are
		 * taller at the same size. Noteworthy, a macOS face whose box is 1.6em, reproduced it here, 17 labels;
		 * elsewhere it falls back to the default face, which the tests above already cover.
		 */
		const { wrong } = await labels(330, "--tb-font: Noteworthy, sans-serif; --tb-mono: Noteworthy, monospace");
		assert.deepEqual(wrong.slice(0, 40), [], `${wrong.length} labels wrong`);
	});

	it("stops a chart growing past --tb-chart-max-width", async () => {
		const { wrong, widths } = await labels(1440, "--tb-chart-max-width: 520px");
		assert.deepEqual(wrong.slice(0, 40), [], `${wrong.length} labels wrong`);
		assert.ok(widths.length > 30 && widths.every((w) => w <= 520.5), `every picture at most 520px: ${widths.map(Math.round).join(", ")}`);
	});
});

describe("a field's face (contract 8, #209)", () => {
	/*
	 * Written from the field-faces fixture by hand: Mapped address says mono: true, Integrity and Round trip
	 * say mono: false, and Transaction says nothing, which must draw as every field drew before `mono`.
	 */
	it("sets .tb-mono on the dd unless the field says mono: false, in one size either way", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=field-faces`, { waitUntil: "load" });
		// The fixture runs as it opens (autoRun), so there is no Run button to press.
		await page.locator("#host >> .tb-field").first().waitFor({ timeout: 15_000 });
		const seen = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot as ShadowRoot;
			const frame = getComputedStyle(root.querySelector(".tb") as Element);
			const face = (node: Element) => getComputedStyle(node).fontFamily;
			return {
				mono: frame.getPropertyValue("--tb-mono"),
				text: frame.getPropertyValue("--tb-font"),
				fields: [...root.querySelectorAll(".tb-field")].map((field) => {
					const dd = field.querySelector("dd") as Element;
					const note = dd.querySelector(".tb-note");
					return {
						label: field.querySelector("dt")?.textContent,
						classes: dd.className,
						value: face(dd.querySelector(".tb-value") as Element),
						note: note ? face(note) : null,
						size: getComputedStyle(dd).fontSize,
					};
				}),
			};
		});
		assert.deepEqual(
			seen.fields.map((f) => [f.label, f.classes]),
			[
				["Mapped address", "tb-mono"],
				["Integrity", ""],
				["Round trip", ""],
				["Transaction", "tb-mono"],
			],
		);
		const [address, integrity, trip, transaction] = seen.fields;
		// A custom property reads back as written and a computed font-family as the browser serialises it:
		// WebKit drops the quotes around "SF Mono" that Chromium keeps, so quotes and spaces are not compared.
		const same = (s: string) => s.replace(/[\s'"]+/g, "");
		assert.equal(same(address!.value), same(seen.mono), "mono: true is the monospace face");
		assert.equal(same(transaction!.value), same(seen.mono), "and so is a field that says nothing");
		assert.equal(same(integrity!.value), same(seen.text), "mono: false is the text face");
		assert.equal(same(trip!.note ?? ""), same(seen.text), "and its note follows it");
		// 0.85rem at a 16px root: the dd's own size, which .tb-mono's 0.82rem (13.12px) must not override.
		// Firefox rounds it to a sixty-fourth, 13.5938px, so within a hundredth of a pixel.
		for (const f of seen.fields) assert.ok(Math.abs(Number.parseFloat(f.size) - 13.6) < 0.01, `${f.label} is ${f.size}`);
		await page.close();
	});
});

describe("names and tokens for one input (contract 8, #224)", () => {
	async function open() {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=input-help`, { waitUntil: "load" });
		await page.locator("#host >> .tb-field-row").first().waitFor({ timeout: 15_000 });
		return page;
	}

	/*
	 * Written from the input-help manifest by hand. An allowlist: a row carries its class and these three
	 * names and nothing else, so an attribute added later by accident shows up here.
	 */
	it("names every row by id and type, and by role where the input has one", async () => {
		const page = await open();
		const rows = await page.evaluate(() =>
			[...(document.querySelector("#host")?.shadowRoot?.querySelectorAll(".tb-field-row") ?? [])].map((row) =>
				Object.fromEntries([...row.attributes].map((a) => [a.name, a.value])),
			),
		);
		assert.deepEqual(rows, [
			{ class: "tb-field-row", "data-input": "values", "data-type": "textarea", "data-role": "data" },
			{ class: "tb-field-row", "data-input": "unit", "data-type": "select" },
			{ class: "tb-field-row", "data-input": "slo", "data-type": "number", "data-role": "threshold" },
			{ class: "tb-field-row", "data-input": "strict", "data-type": "toggle", "data-role": "advanced" },
		]);
		await page.close();
	});

	it("draws the controls and descriptions from the four tokens, which default to today's colours", async () => {
		const page = await open();
		const read = () =>
			page.evaluate(() => {
				const root = document.querySelector("#host")?.shadowRoot as ShadowRoot;
				const css = (selector: string, prop: string) => getComputedStyle(root.querySelector(selector) as Element).getPropertyValue(prop);
				// A probe resolves a token to a colour the same way the control does.
				const probe = (value: string) => {
					const span = document.createElement("span");
					span.style.color = value;
					root.querySelector(".tb")?.append(span);
					const out = getComputedStyle(span).color;
					span.remove();
					return out;
				};
				return {
					area: [css(".tb-textarea", "background-color"), css(".tb-textarea", "border-top-color"), css(".tb-textarea", "color")],
					select: [css(".tb-select", "background-color"), css(".tb-input", "background-color")],
					desc: css(".tb-desc", "color"),
					today: [probe("var(--tb-surface)"), probe("var(--tb-border)"), probe("var(--tb-fg)"), probe("var(--tb-faint)")],
				};
			});
		const before = await read();
		const [surface, border, fg, faint] = before.today;
		assert.deepEqual(before.area, [surface, border, fg], "unset, the textarea is drawn as before");
		assert.deepEqual(before.select, [surface, surface]);
		assert.equal(before.desc, faint);
		await page.evaluate(() => {
			const host = document.querySelector("#host") as HTMLElement;
			host.style.setProperty("--tb-input-bg", "rgb(1, 2, 3)");
			host.style.setProperty("--tb-input-border", "rgb(4, 5, 6)");
			host.style.setProperty("--tb-input-fg", "rgb(7, 8, 9)");
			host.style.setProperty("--tb-desc-fg", "rgb(10, 11, 12)");
		});
		const after = await read();
		assert.deepEqual(after.area, ["rgb(1, 2, 3)", "rgb(4, 5, 6)", "rgb(7, 8, 9)"]);
		assert.deepEqual(after.select, ["rgb(1, 2, 3)", "rgb(1, 2, 3)"]);
		assert.equal(after.desc, "rgb(10, 11, 12)");
		await page.close();
	});
});

describe("how a table column wraps (contract 8, #213)", () => {
	/*
	 * Written from the narrow-table fixture by hand: five columns say "none" and Note says "prose", and with
	 * the default sort host-2 is the third row, whose Note cell overrides its column with "none".
	 */
	it("writes data-wrap on every header and cell of a column that says it, and a cell's own over it", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=narrow-table`, { waitUntil: "load" });
		await page.locator("#host >> tbody tr").first().waitFor({ timeout: 15_000 });
		const seen = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot as ShadowRoot;
			const wrap = (cells: Iterable<Element>) => [...cells].map((c) => c.getAttribute("data-wrap"));
			return {
				head: wrap(root.querySelectorAll("thead th")),
				rows: [...root.querySelectorAll("tbody tr")].map((tr) => [tr.children[0]?.textContent, ...wrap(tr.children)]),
			};
		});
		assert.deepEqual(seen.head, ["none", "none", "none", "none", "none", "prose"]);
		const n = ["none", "none", "none", "none", "none"];
		assert.deepEqual(seen.rows, [
			["host-4", ...n, "prose"],
			["host-1", ...n, "prose"],
			["host-2", ...n, "none"],
			["host-3", ...n, "prose"],
			["host-5", ...n, "prose"],
			["host-6", ...n, "prose"],
		]);
		await page.close();
	});

	it("writes no data-wrap on a table that makes no claim", async () => {
		const page = await browser.newPage();
		await page.goto(`${BASE}/styling.html`, { waitUntil: "load" });
		await page.locator("#audit >> tbody tr").first().waitFor({ timeout: 15_000 });
		const count = await page.evaluate(() => document.getElementById("audit")?.shadowRoot?.querySelectorAll("[data-wrap]").length);
		assert.equal(count, 0);
		await page.close();
	});
});

describe("a row header and the narrow table (contract 8, #214)", () => {
	async function open(width: number, id = "narrow-table") {
		const page = await browser.newPage({ viewport: { width, height: 900 } });
		await page.goto(`${BASE}/tool.html?id=${id}`, { waitUntil: "load" });
		// The fixture runs as it opens; percentiles waits for Run, so only its form is there yet.
		await page.locator(id === "narrow-table" ? "#host >> tbody tr" : "#host >> .tb-run").first().waitFor({ timeout: 15_000 });
		return page;
	}

	/*
	 * Written from the narrow-table fixture by hand: Instance says rowHeader, so each row's first cell is a th
	 * with scope="row", carrying the attributes a td would, and the other five stay td.
	 */
	it("renders a rowHeader column's cells as th scope=row, with a td's attributes", async () => {
		const page = await open(1280);
		const rows = await page.evaluate(() =>
			[...(document.querySelector("#host")?.shadowRoot?.querySelectorAll("tbody tr") ?? [])].map((tr) => [...tr.children].map((c) => `${c.tagName.toLowerCase()}${c.getAttribute("scope") ? `[${c.getAttribute("scope")}]` : ""}`)),
		);
		for (const row of rows) assert.deepEqual(row, ["th[row]", "td", "td", "td", "td", "td"]);
		const first = await page.evaluate(() => {
			const th = document.querySelector("#host")?.shadowRoot?.querySelector('tbody th[scope="row"]') as Element;
			return Object.fromEntries([...th.attributes].map((a) => [a.name, a.value]));
		});
		// An empty class, as every td of a column without mono has.
		assert.deepEqual(first, { scope: "row", "data-align": "start", "data-tone": "normal", "data-label": "Instance", "data-wrap": "none", class: "" });
		await page.close();
	});

	const measure = (page: Page) =>
		page.evaluate(() => {
			// The cell's content width in its own font's ch, measured with a 1ch probe rather than assumed.
			const noteWidthInCh = (cell: HTMLElement) => {
				const probe = document.createElement("span");
				probe.style.cssText = "display:inline-block;width:1ch";
				cell.append(probe);
				const ch = probe.getBoundingClientRect().width;
				probe.remove();
				const style = getComputedStyle(cell);
				return (cell.getBoundingClientRect().width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)) / ch;
			};
			const root = document.querySelector("#host")?.shadowRoot as ShadowRoot;
			const part = root.querySelector(".tb-out-table") as HTMLElement;
			const table = part.querySelector("table") as HTMLElement;
			const rowHead = root.querySelector('tbody th[scope="row"]') as HTMLElement | null;
			const note = root.querySelector('tbody td[data-wrap="prose"]') as HTMLElement | null;
			return {
				part: part.clientWidth,
				table: table.getBoundingClientRect().width,
				scrolls: part.scrollWidth > part.clientWidth,
				headNowrap: [...root.querySelectorAll("thead th")].every((th) => getComputedStyle(th).whiteSpace === "nowrap"),
				noneNowrap: [...root.querySelectorAll('[data-wrap="none"]')].every((c) => getComputedStyle(c).whiteSpace === "nowrap"),
				noteCh: note ? noteWidthInCh(note) : 0,
				sticky: rowHead ? getComputedStyle(rowHead).position : null,
				attachment: getComputedStyle(part).backgroundAttachment,
			};
		});

	it("at 390px keeps the table at its own width, scrolling, tokens on one line and prose at 20ch", async () => {
		const page = await open(390);
		const m = await measure(page);
		assert.ok(m.scrolls && m.table > m.part, `the table should be wider than its ${m.part}px part, got ${m.table}px`);
		assert.ok(m.headNowrap, "every heading on one line");
		assert.ok(m.noneNowrap, "every none cell on one line");
		assert.ok(m.noteCh >= 20, `the Note column is ${m.noteCh.toFixed(1)}ch, under 20`);
		// And it wraps: as max-content it ran each sentence on one line, the column 50ch wide.
		assert.ok(m.noteCh <= 27, `the Note column is ${m.noteCh.toFixed(1)}ch, so its sentences do not wrap`);
		assert.equal(m.sticky, "sticky");
		await page.close();
	});

	it("keeps the row header in view while the rest scrolls", async () => {
		const page = await open(390);
		const left = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot as ShadowRoot;
			const part = root.querySelector(".tb-out-table") as HTMLElement;
			part.scrollLeft = 200;
			const th = root.querySelector('tbody th[scope="row"]') as HTMLElement;
			const heads = [...root.querySelectorAll("thead th")].map((h) => h.hasAttribute("data-row-header"));
			const head = root.querySelector("thead th[data-row-header]") as HTMLElement;
			return { part: part.getBoundingClientRect().left, th: th.getBoundingClientRect().left, head: head.getBoundingClientRect().left, heads, scrolled: part.scrollLeft };
		});
		assert.ok(left.scrolled > 0, "the part scrolled");
		assert.ok(Math.abs(left.th - left.part) < 1, `the row header left the view: ${left.th} against ${left.part}`);
		assert.deepEqual(left.heads, [true, false, false, false, false, false], "only the row header column's heading is marked");
		assert.ok(Math.abs(left.head - left.part) < 1, `its heading left the view: ${left.head} against ${left.part}`);
		await page.close();
	});

	/*
	 * The caption scrolled with the table and was cut to its last word, "first", at the left edge. At either
	 * end of the scroll it must lie inside the part, all of it, wrapping if it has to.
	 */
	it("keeps the caption whole and in view at both ends of the scroll", async () => {
		const page = await open(390);
		for (const to of [0, 99_999]) {
			const box = await page.evaluate((to) => {
				const root = document.querySelector("#host")?.shadowRoot as ShadowRoot;
				const part = root.querySelector(".tb-out-table") as HTMLElement;
				part.scrollLeft = to;
				const caption = root.querySelector("caption") as HTMLElement;
				const p = part.getBoundingClientRect();
				const c = caption.getBoundingClientRect();
				return { pl: p.left, pr: p.left + part.clientWidth, cl: c.left, cr: c.right, text: caption.textContent, overflow: caption.scrollWidth - caption.clientWidth, scrolled: part.scrollLeft };
			}, to);
			assert.equal(box.text, "Six instances, slowest p99 first");
			assert.ok(box.cl >= box.pl - 1 && box.cr <= box.pr + 1, `scrolled to ${box.scrolled}, the caption runs ${box.cl} to ${box.cr} in a part ${box.pl} to ${box.pr}`);
			assert.ok(box.overflow <= 0, "and none of its text overflows it");
		}
		await page.close();
	});
	/*
	 * A table that declares no wrap keeps today's layout: the narrow rules are scoped to a table with a
	 * data-wrap, so percentiles at 390px is still exactly its part's width, as it was.
	 */
	it("leaves a table with no wrap at its part's width, as before", async () => {
		const page = await open(390, "percentiles");
		await page.locator("#host >> .tb-run").click();
		await page.locator("#host >> .tb-out-table").waitFor({ timeout: 15_000 });
		const m = await measure(page);
		assert.ok(Math.abs(m.table - m.part) < 1, `the table is ${m.table}px in a ${m.part}px part`);
		await page.close();
	});

	it("draws the scroll shadows with a local background, so they follow what is left to scroll", async () => {
		const page = await open(390);
		const m = await measure(page);
		assert.equal(m.attachment, "local, local, scroll, scroll");
		await page.close();
	});
});

describe("markup in an input's description (#217)", () => {
	async function open() {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=input-help`, { waitUntil: "load" });
		await page.locator("#host >> .tb-field-row").first().waitFor({ timeout: 15_000 });
		return page;
	}

	/*
	 * Written by hand from the input-help manifest's two descriptions: the Latencies one uses every block and
	 * inline form but strong-in-tone, and the p99 target's has no markup, so it must be exactly the <p> and
	 * the one text node it always was.
	 */
	it("builds the markup as elements, and leaves a plain description exactly as it was", async () => {
		const page = await open();
		const seen = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot as ShadowRoot;
			const values = root.querySelector('[data-input="values"] .tb-desc') as HTMLElement;
			const slo = root.querySelector('[data-input="slo"] .tb-desc') as HTMLElement;
			return {
				values: values.outerHTML,
				slo: slo.outerHTML,
				sloNodes: [...slo.childNodes].map((n) => n.nodeType),
				describedBy: root.querySelector("#in-values")?.getAttribute("aria-describedby"),
			};
		});
		assert.equal(
			seen.values,
			'<div class="tb-desc" id="in-values-desc"><p>Raw latencies, in the unit chosen below.</p><ul><li><strong>Spaces or commas</strong>: <code>41 38 37 1450</code>.</li><li><strong>One per line</strong>: a column pasted from a spreadsheet.</li></ul><p>A negative value is <span data-tone="bad">refused</span>. Zeros are <span data-tone="good">kept</span>, and <span data-tone="muted">blank lines are ignored</span>.</p></div>',
		);
		assert.equal(seen.slo, '<p class="tb-desc" id="in-slo-desc">The p99 the service promises.</p>');
		assert.deepEqual(seen.sloNodes, [3], "one text node");
		assert.equal(seen.describedBy, "in-values-desc in-values-err", "the description is still what the control is described by");
		await page.close();
	});

	it("draws a tone in its colour and in a heavier weight, muted at the normal weight, and code in mono", async () => {
		const page = await open();
		const seen = await page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot as ShadowRoot;
			const desc = root.querySelector('[data-input="values"] .tb-desc') as HTMLElement;
			const css = (selector: string) => getComputedStyle(desc.querySelector(selector) as Element);
			const probe = (value: string) => {
				const span = document.createElement("span");
				span.style.color = value;
				desc.append(span);
				const out = getComputedStyle(span).color;
				span.remove();
				return out;
			};
			const frame = getComputedStyle(root.querySelector(".tb") as Element);
			return {
				bad: [css('[data-tone="bad"]').color, css('[data-tone="bad"]').fontWeight],
				good: [css('[data-tone="good"]').color, css('[data-tone="good"]').fontWeight],
				muted: [css('[data-tone="muted"]').color, css('[data-tone="muted"]').fontWeight],
				plain: getComputedStyle(desc).fontWeight,
				// WebKit serialises a family without the quotes Chromium keeps, so neither is compared.
				code: css("code").fontFamily.replace(/[\s'"]+/g, ""),
				mono: frame.getPropertyValue("--tb-mono").replace(/[\s'"]+/g, ""),
				want: [probe("var(--tb-bad)"), probe("var(--tb-good)"), probe("var(--tb-faint)")],
			};
		});
		assert.deepEqual(seen.bad, [seen.want[0], "600"]);
		assert.deepEqual(seen.good, [seen.want[1], "600"]);
		assert.deepEqual(seen.muted, [seen.want[2], seen.plain], "muted recedes: its colour, and the text's own weight");
		assert.equal(seen.code, seen.mono);
		await page.close();
	});
});

describe("details on an input, behind a disclosure (#215)", () => {
	async function open() {
		const page = await browser.newPage();
		await page.goto(`${BASE}/tool.html?id=input-help`, { waitUntil: "load" });
		await page.locator("#host >> .tb-field-row").first().waitFor({ timeout: 15_000 });
		return page;
	}
	const read = (page: Page) =>
		page.evaluate(() => {
			const root = document.querySelector("#host")?.shadowRoot as ShadowRoot;
			const row = root.querySelector('[data-input="slo"]') as HTMLElement;
			const details = row.querySelector("details.tb-details") as HTMLDetailsElement | null;
			const body = details?.querySelector(".tb-details-body") as HTMLElement | null;
			return {
				order: [...row.children].map((c) => `${c.tagName.toLowerCase()}.${c.className}`),
				open: details?.open,
				summary: details?.querySelector("summary")?.textContent,
				body: body?.outerHTML,
				bodyShown: body ? body.checkVisibility() : false,
				describedBy: root.querySelector("#in-slo")?.getAttribute("aria-describedby"),
				others: root.querySelectorAll("details").length,
			};
		});

	/*
	 * Written from the input-help manifest by hand: only the p99 target has details. The body is the same
	 * markup a description takes, and the control is still described by the short hint alone.
	 */
	it("draws the details after the description, closed, and out of the control's description", async () => {
		const page = await open();
		const seen = await read(page);
		assert.deepEqual(seen.order, ["label.tb-label", "input.tb-input", "p.tb-desc", "details.tb-details", "p.tb-sr"]);
		assert.equal(seen.open, false);
		assert.equal(seen.bodyShown, false, "closed, the body takes no room");
		assert.equal(seen.summary, "More about p99 target", "the visible More, named for its input");
		assert.equal(
			seen.body,
			'<div class="tb-details-body"><p>Compared with the p99 of what you paste, by nearest rank: the smallest value with at least 99% of them at or below it.</p><ul><li>A p99 equal to the target is a <span data-tone="bad">miss</span> only when the toggle below is on.</li><li>With fewer than 100 values, the p99 is the <span data-tone="warn">largest</span> one.</li></ul><p><span data-tone="muted">A percentile of a few values says little.</span></p></div>',
		);
		assert.equal(seen.describedBy, "in-slo-desc in-slo-err", "aria-describedby stays on the short hint");
		assert.equal(seen.others, 1, "no other input has details");
		await page.close();
	});

	it("opens from the keyboard, and closes again", async () => {
		const page = await open();
		await page.locator('#host >> [data-input="slo"] summary').focus();
		await page.keyboard.press("Enter");
		const opened = await read(page);
		assert.equal(opened.open, true);
		assert.equal(opened.bodyShown, true);
		await page.keyboard.press("Space");
		assert.equal((await read(page)).open, false);
		await page.close();
	});
});
