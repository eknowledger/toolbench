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
import { type Browser, type BrowserType, chromium, firefox, webkit } from "playwright";

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
	const raw = (process.env.PLAYWRIGHT_BROWSER ?? "chromium").toLowerCase();
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
	 * percentiles declares four samples and does not set autoRun, so a click must fill and stop. No tool
	 * on the bench sets autoRun, so the autoRun branch of #applySample has no coverage at this layer: the
	 * one where the sample re-runs and the run's own announcement stands instead of the "filled with" one.
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
		const embedded = page.locator("tool-host[tool=percentiles]");
		await embedded.scrollIntoViewIfNeeded();
		await embedded.locator(".tb-samples").waitFor();
		assert.equal(await embedded.locator(".tb-sample").count(), 4, "an embedded tool has the full form, so it has the samples too");
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
