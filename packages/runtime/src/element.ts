/**
 * `<tool-host>` — the whole public surface of this package.
 *
 * ```html
 * <tool-host tool="percentiles" mode="page"></tool-host>
 * ```
 *
 * Three modes, one declaration, and the mode decides both the layout **and when the tool's code is
 * fetched**:
 *
 * | mode | layout | loads its code |
 * |---|---|---|
 * | `card` | name, one input, a few result fields | **on click** — until then it is static markup |
 * | `page` | everything: all inputs, full result, links | when it scrolls near the viewport |
 * | `embed` | no title; sized for the middle of an article | when it scrolls near the viewport |
 *
 * ⚠️ **A card is a facade.** It renders whatever output it was seeded with (or a prompt), and imports
 * nothing until someone clicks. That is what lets a page carry several cards without paying for any
 * of them — the alternative, hydrating on visibility, charges every reader who scrolls past for a
 * tool nobody used.
 *
 * Accessibility is part of the contract, not a later pass, because a generated form is exactly where
 * it gets forgotten:
 *
 *  - every control has a real `<label for>`, and its `description` becomes `aria-describedby`;
 *  - an `{ kind: "error", input }` result marks that control `aria-invalid` and points its
 *    description at the message, so the error is attached to the thing that caused it;
 *  - results are announced through a short `role="status"` summary — "6 fields", "error: …" — rather
 *    than an `aria-live` region over the output, which would read whole tables aloud on every
 *    keystroke pause;
 *  - focus never moves on a debounced run, and moves to the result only when someone presses Run;
 *  - there is always a Run button. Debounce-on-typing alone leaves a keyboard user no way to say
 *    "go now", and is wrong anyway for anything slow.
 */
import type { InputSpec, InputValues, Manifest, Output, Sample } from "@toolbench/sdk";
import { el, fill } from "./dom.ts";
import { ChartRendererMissing, loadChartRenderer, render, unknownOutput, type RenderOptions } from "./render/index.ts";
import { ToolCrashError, ToolTimeoutError, WorkerUnavailableError } from "./protocol.ts";
import { isSuperseded, Runner, type Runnable } from "./runner.ts";
import { type ToolSource } from "./sources.ts";
import { applyStyles } from "./styles.ts";
import { applyPartialValues, coerce } from "./values.ts";

export type Mode = "card" | "page" | "embed";

/** How long a run must last before its progress bar is worth showing. */
const SLOW_MS = 400;

export interface ToolHostConfig {
	/** Where tools come from. */
	source: ToolSource;
	/** Required only for tools that declare `thread: "worker"`. See the README. */
	workerFactory?: () => Worker;
	/** Given a tool id, the URL of its full page — used by card and embed modes to link out. */
	pageUrl?: (id: string) => string;
	/** How far ahead of the viewport `page` and `embed` modes start loading. Default "200% 0px". */
	rootMargin?: string;
	/** Milliseconds of quiet before a typed change runs. Default 150. */
	debounceMs?: number;
	/**
	 * Paint a `code` result with the host's own highlighter.
	 *
	 * The runtime does not bundle one: that would roughly double the package, and a host usually
	 * already has one. Return a `Node`, not a string. A string-returning hook would need
	 * `innerHTML`, which SECURITY.md forbids. Omit the hook to keep readable preformatted text.
	 */
	highlight?: (source: string, lang: string) => Node;
}

let config: ToolHostConfig | undefined;

/** Defines the element. Call once, with the source your host provides. */
export function defineToolHost(options: ToolHostConfig, tagName = "tool-host"): void {
	config = options;
	if (typeof customElements === "undefined") return;
	if (!customElements.get(tagName)) customElements.define(tagName, ToolHost);
}

export class ToolHost extends HTMLElement {
	static readonly observedAttributes = ["tool", "mode", "parts"];

	#root: ShadowRoot;
	#runner: Runner | undefined;
	#loaded: Runnable | undefined;
	#manifest: Manifest | undefined;
	#values: InputValues = {};
	/**
	 * Values set before the manifest is here. `#prepare` applies them on top of defaults so a host
	 * can prefill a card that has not listed tools yet.
	 */
	#queued: InputValues = {};
	/** True after a host wrote `values`, so a later paint of a seed can mark that seed stale. */
	#hostWroteValues = false;
	/** Settles when the current `#prepare` finishes. `run()` waits on this so it does not no-op. */
	#ready: Promise<void> = Promise.resolve();
	/** In-flight activation. A host `run()` during a click or intersection must wait for it. */
	#activation: Promise<void> | undefined;
	#observer: IntersectionObserver | undefined;
	#debounce: ReturnType<typeof setTimeout> | undefined;
	#slowTimer: ReturnType<typeof setTimeout> | undefined;
	#activated = false;
	/** True between "the reader asked for this" and "the tool's code is here". */
	#loading = false;
	#seed: Output | undefined;
	/**
	 * The last thing actually drawn: a result, a `progress` partial, or an error.
	 *
	 * ⚠️ This exists because `#paint` rebuilds the shadow tree, and without it a repaint threw the
	 * reader's answer away. Any observed attribute does that: `host.setAttribute("parts", "2")` after a
	 * run left the output empty, and on a seeded host it was worse than empty, because `#paint` ends by
	 * drawing the seed and the reader was then looking at the defaults' result under their own inputs
	 * with nothing saying so.
	 */
	#shown: Output | undefined;
	/** The last visible status line, for the same reason as `#shown`: a repaint builds a fresh, empty one. */
	#status = "";
	#controls = new Map<string, HTMLElement>();
	#els: {
		output?: HTMLElement;
		status?: HTMLElement;
		announce?: HTMLElement;
		run?: HTMLButtonElement;
		progress?: HTMLElement;
	} = {};

	constructor() {
		super();
		this.#root = this.attachShadow({ mode: "open" });
		applyStyles(this.#root);
	}

	/**
	 * A precomputed result to show before anything runs.
	 *
	 * A server-rendering host sets this so a card is useful with no JavaScript at all — the same
	 * output the tool would produce for its defaults, rendered as static markup.
	 */
	set seed(output: Output | undefined) {
		this.#seed = output;
		if (!this.#activated) this.#paint();
	}

	/**
	 * Prefill the form. Partial is fine: unnamed inputs keep their current value.
	 *
	 * Validated the way typing is (clamp, refuse, truncate), and does not run the tool, even if the
	 * tool set `autoRun`. An existing result goes stale. Works before activation, so a card can be
	 * prefilled. A host that wants the tool to run calls `run()` afterwards.
	 */
	set values(partial: InputValues) {
		if (partial == null || typeof partial !== "object" || Array.isArray(partial)) return;
		if (!this.#manifest) {
			this.#queued = { ...this.#queued, ...partial };
			this.#hostWroteValues = true;
			return;
		}
		this.#applyHostValues(partial);
	}

	/**
	 * A copy of the current input values, including ones a compact card has not rendered.
	 *
	 * The setter is the primitive a host example button needs. The getter is here so a shareable
	 * deep link can read the form the same way it writes it, without the host reaching into the
	 * shadow root.
	 */
	get values(): InputValues {
		return this.#manifest ? { ...this.#values } : { ...this.#queued };
	}

	/**
	 * Run the tool. Opt-in: setting `values` never does this on its own.
	 *
	 * Waits for the manifest, activates if the form has not opened yet, then runs. So
	 * `host.values = …; host.run()` works on a card nobody has clicked.
	 *
	 * ⚠️ Does NOT move focus, unlike the reader pressing Run. Focus follows the person who acted, and here
	 * the person who acted is the page, not the reader: a host running a tool on load would otherwise yank
	 * a reader out of whatever they were doing and drop them on a result they did not ask for. Pass
	 * `{ focus: true }` when the call is the direct consequence of something the reader did, such as a
	 * button the page itself renders.
	 */
	async run(options: { focus?: boolean } = {}): Promise<void> {
		await this.#ready;
		if (!this.#manifest) return;
		await this.#activate();
		await this.#run({ focusResult: options.focus === true });
	}

	get mode(): Mode {
		const mode = this.getAttribute("mode");
		return mode === "card" || mode === "embed" ? mode : "page";
	}

	/**
	 * How many parts of a grouped result a compact card shows. Default 1.
	 *
	 * An attribute rather than a manifest key, and deliberately: how much room a card has is a property of
	 * the page it is on, not of the tool. The same tool is a one-part card in a sidebar and a two-part card
	 * leading a section, and a manifest cannot know which. Ignored outside `mode="card"`, where everything
	 * is shown anyway.
	 */
	get cardParts(): number {
		const raw = Number(this.getAttribute("parts"));
		return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
	}

	get toolId(): string {
		return this.getAttribute("tool") ?? "";
	}

	connectedCallback(): void {
		if (!config) {
			this.#fatal("No tool source configured. Call defineToolHost({ source }) before using <tool-host>.");
			return;
		}
		this.#readInlineSeed();
		this.#ready = this.#prepare();
	}

	disconnectedCallback(): void {
		/*
		 * ⚠️ This is what stops a worker leaking. On a site with client-side navigation the element is
		 * removed rather than the page reloaded, and a worker with no owner survives at a few megabytes
		 * each. Nothing else in the system will clean it up.
		 */
		this.#runner?.dispose();
		this.#runner = undefined;
		this.#loaded = undefined;
		this.#activation = undefined;
		this.#observer?.disconnect();
		this.#observer = undefined;
		if (this.#debounce) clearTimeout(this.#debounce);
		if (this.#slowTimer) clearTimeout(this.#slowTimer);
	}

	attributeChangedCallback(name: string, before: string | null, after: string | null): void {
		if (before === after || !this.isConnected) return;
		if (name === "tool") {
			this.#activated = false;
			this.#loaded = undefined;
			this.#activation = undefined;
			this.#hostWroteValues = false;
			// A different tool. Keeping the old one's output would show one tool's answer under another's
			// name, which is the one thing worse than showing nothing. The status line goes with it.
			this.#shown = undefined;
			this.#status = "";
			this.#ready = this.#prepare();
		} else {
			this.#paint();
		}
	}

	// --- setup ------------------------------------------------------------------------------------

	async #prepare(): Promise<void> {
		const source = config?.source;
		if (!source) return;
		try {
			/*
			 * The manifest is fetched now; the tool's *code* is not. That split is the whole reason a
			 * card can be free: everything needed to draw the interface is data.
			 */
			const manifests = await source.list();
			const manifest = manifests.find((m) => m.id === this.toolId);
			if (!manifest) {
				this.#fatal(`No tool with id "${this.toolId}". Known: ${manifests.map((m) => m.id).join(", ") || "none"}.`);
				return;
			}
			this.#manifest = manifest;
			const defaults = Object.fromEntries(manifest.inputs.map((input) => [input.id, input.default]));
			/*
			 * A host may have written `values` while `list()` was in flight (queued) or in the gap
			 * after `#manifest` was set but before this assignment (already merged into `#values`).
			 * Resetting to defaults without that overlay would drop a prefill that arrived on time.
			 */
			const overlay: InputValues = { ...this.#queued };
			this.#queued = {};
			if (this.#hostWroteValues) Object.assign(overlay, this.#values);
			this.#values = applyPartialValues(manifest.inputs, defaults, overlay);
			if (Object.keys(overlay).length > 0) this.#hostWroteValues = true;
			/*
			 * ⚠️ Before the first paint, not on first use, and only for tools that say they draw one.
			 *
			 * The chart renderer is its own chunk, about 1.5 KB gzipped that most pages never need. Awaiting
			 * it here is what lets `render` stay synchronous: a seeded card paints a chart in `#paint` with
			 * no chance to await, and every later draw is synchronous too. `kinds` is the manifest's own
			 * declaration of what `run` can return, so it is the right thing to ask, and a tool that gets it
			 * wrong is covered by the redraw in `#draw`.
			 */
			if (manifest.kinds.includes("series")) await loadChartRenderer();
			this.#paint();

			/*
			 * A retired tool is still listed so a bookmarked URL is not a 404. It must not load or
			 * run: that is the whole reason the status exists. The first version ignored it, so a
			 * retired tool fetched its code and ran like any other, a field that claimed the tool
			 * was gone and then did the opposite.
			 */
			if (lifecycleStatus(manifest) === "retired") return;
			if (this.mode === "card") return; // waits for a click; a deprecated card is not a live facade
			this.#watchForViewport();
		} catch (error) {
			this.#fatal(error instanceof Error ? error.message : String(error));
		}
	}

	#watchForViewport(): void {
		const margin = config?.rootMargin ?? "200% 0px";
		if (typeof IntersectionObserver !== "function") {
			void this.#activate();
			return;
		}
		this.#observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					this.#observer?.disconnect();
					this.#observer = undefined;
					void this.#activate();
				}
			},
			{ rootMargin: margin },
		);
		this.#observer.observe(this);
	}

	async #activate(): Promise<void> {
		if (this.#activation) return this.#activation;
		if (this.#loaded && this.#runner) return;
		if (!this.#manifest || !config) return;
		// A retired tool never loads. Guarded here rather than only in #paint so nothing fetches its
		// chunk: the field claims the tool is gone, and downloading it anyway would make that a lie.
		if (lifecycleStatus(this.#manifest) === "retired") return;
		this.#activation = this.#activateBody(config);
		try {
			await this.#activation;
		} finally {
			if (!this.#loaded) this.#activation = undefined;
		}
	}

	async #activateBody(cfg: ToolHostConfig): Promise<void> {
		this.#activated = true;
		/*
		 * ⚠️ The form is not painted until the module is here.
		 *
		 * Painting it first gave a Run button that existed and did nothing, because `#run` has no tool to
		 * call yet — invisible on a fast local load and a real dead control on a slow connection. The
		 * facade stays up, with a loading hint, until there is something behind it.
		 */
		this.#loading = true;
		this.#paint();
		try {
			this.#loaded = await this.#resolve(cfg);
			this.#runner = new Runner(cfg.workerFactory ? { workerFactory: cfg.workerFactory } : {});
			this.#loading = false;
			this.#paint();
			/*
			 * ⚠️ Activation does NOT run the tool.
			 *
			 * The first version ran on activation and on every keystroke, and the result was a Run button
			 * that appeared broken: by the time you looked at it, the answer was already there, and
			 * pressing it changed nothing visible. Work nobody asked for, and a control that lies about
			 * being the trigger.
			 *
			 * So the reader decides. A seeded result stays on screen as the starting point, and the tool
			 * runs when Run is pressed — or as the reader types, but only for a tool that opted into
			 * `autoRun` because it is genuinely instant.
			 *
			 * Skip the prompt when a host already prefilled: `#paint` has just marked the seed stale,
			 * and overwriting that with "showing the default result" would lie about whose inputs these
			 * are.
			 */
			if (!this.#hostWroteValues) {
				this.#say(this.#seed ? "showing the default result — press Run to try your own" : "press Run");
			}
		} catch (error) {
			this.#activated = false;
			this.#loading = false;
			this.#showError(error);
		}
	}

	/**
	 * Get whatever this thread actually needs in order to run the tool.
	 *
	 * ⚠️ For a worker-mode tool with a worker available, that is the manifest and nothing else. The
	 * module is imported inside the worker, so importing it here too downloaded and parsed a second
	 * copy that was never called — doubling what a reader pays for every worker-mode tool. A browser
	 * test asserts which of the two chunks gets fetched.
	 */
	async #resolve(cfg: ToolHostConfig): Promise<Runnable> {
		const manifest = this.#manifest as Manifest;
		const runsInWorker = manifest.runtime.thread === "worker" && cfg.workerFactory !== undefined;
		if (runsInWorker) return { manifest };
		return cfg.source.load(manifest.id);
	}

	// --- running ----------------------------------------------------------------------------------

	/**
	 * An input changed. Either run (only if the tool asked for that) or mark what is on screen as no
	 * longer matching the form — which is the honest thing, and it makes Run mean something.
	 */
	#inputChanged(): void {
		if (this.#manifest?.autoRun === true) {
			if (this.#debounce) clearTimeout(this.#debounce);
			const wait = config?.debounceMs ?? 150;
			this.#debounce = setTimeout(() => void this.#run({ focusResult: false }), wait);
			return;
		}
		this.#markStale();
	}

	#markStale(): void {
		const output = this.#els.output;
		if (!output) return;
		// Nothing to go stale before the first run.
		const hasResult = output.children.length > 0;
		output.toggleAttribute("data-stale", hasResult);
		this.#els.run?.toggleAttribute("data-attention", true);
		this.#say(hasResult ? "inputs changed — press Run" : "press Run");
	}

	async #run(options: { focusResult: boolean }): Promise<void> {
		const loaded = this.#loaded;
		const runner = this.#runner;
		if (!loaded || !runner) return;
		if (this.#manifest && lifecycleStatus(this.#manifest) === "retired") return;

		this.#hostWroteValues = false;
		this.#els.output?.removeAttribute("data-stale");
		this.#els.run?.removeAttribute("data-attention");
		this.#setBusy(true);
		this.#say("running…");
		try {
			const output = await runner.run(loaded, this.#values, {
				onProgress: (fraction, partial) => {
					this.#setProgress(fraction);
					if (partial) this.#draw(partial);
				},
			});
			this.#setBusy(false);
			this.#draw(output);
			/*
			 * ⚠️ An error stays on the VISIBLE line; a result only gets announced.
			 *
			 * The split is between "here is what happened, and you can see it" and "here is what happened,
			 * and you need to do something". A summary of a result that is already on screen is metadata and
			 * reads as debug output; an error is the one outcome a reader has to act on, so it says so where
			 * they are looking. Announcing it too would say it twice to a screen reader.
			 */
			if (output.kind === "error") this.#say(summarise(output, this.mode === "card"));
			else this.#announce(summarise(output, this.mode === "card"));
			this.#markInvalid(output.kind === "error" ? output.input : undefined);
			if (options.focusResult) this.#els.output?.focus();
		} catch (error) {
			if (isSuperseded(error)) return; // the reader typed again; the newer run owns the UI
			this.#setBusy(false);
			this.#showError(error);
		}
	}

	#showError(error: unknown): void {
		if (!this.#els.output) {
			// Activation itself failed, so there is no result area yet: the whole element becomes the
			// message. Better than a facade that silently never opens.
			const message = error instanceof Error ? error.message : String(error);
			this.#fatal(message);
			return;
		}
		/*
		 * A tool crashing, a worker failing to start and a timeout are three different problems, and a
		 * reader who cannot tell them apart cannot do anything useful about any of them.
		 */
		const message =
			error instanceof ToolTimeoutError
				? error.message
				: error instanceof WorkerUnavailableError
					? error.message
					: error instanceof ToolCrashError
						? `This tool hit a bug and stopped: ${error.message}`
						: error instanceof Error
							? error.message
							: String(error);
		this.#draw({ kind: "error", message });
		this.#say(`error: ${message}`);
		if (error instanceof ToolCrashError && error.toolStack) console.error(error.toolStack);
	}

	// --- painting ---------------------------------------------------------------------------------

	#paint(): void {
		const manifest = this.#manifest;
		if (!manifest) return;
		this.#reflectStatus(manifest);
		if (lifecycleStatus(manifest) === "retired") {
			this.#paintRetired(manifest);
			return;
		}
		const mode = this.mode;
		const compact = mode === "card";
		const pageUrl = config?.pageUrl?.(manifest.id);
		const life = lifecycleStatus(manifest);

		const body = el("div", { class: "tb-body" });
		const frame = el("div", { class: "tb" });

		if (mode !== "embed") {
			frame.append(
				el(
					"div",
					{ class: "tb-head" },
					titleRow(manifest, compact, pageUrl),
					mode === "page" ? el("p", { class: "tb-blurb" }, manifest.blurb) : null,
				),
			);
		}

		if (!this.#activated || this.#loading) {
			/*
			 * The facade: static, and clickable only for a live card. A deprecated tool still runs on its
			 * page, but a compact slot that opens it presents it as current, which is the thing status
			 * exists to prevent.
			 */
			const deprecatedCard = compact && life === "deprecated";
			// One string for the visible hint and the accessible name, so they cannot drift apart.
			const hint = this.#seed ? "Try it" : "Open this tool";
			const preview = el(
				"div",
				{ class: "tb-body" },
				mode === "page" ? null : el("p", { class: "tb-blurb" }, manifest.blurb),
				mode === "embed" ? lifecycleMark(life) : null,
				this.#seed
					? render(
							this.#seed,
							withHostHighlight({
								compact,
								cardParts: this.cardParts,
								...(manifest.cardFields !== undefined ? { cardFields: manifest.cardFields } : {}),
							}),
						)
					: null,
				deprecatedCard ? null : el("span", { class: "tb-facade-hint" }, this.#loading ? "loading…" : hint),
			);
			if (compact && !this.#loading && !deprecatedCard) {
				const button = el("button", { class: "tb-facade", type: "button" });
				/*
				 * ⚠️ "Open ${name}" failed WCAG 2.5.3. The button's visible affordance is the hint,
				 * so a speech-input user saying "click Try it" matched nothing. Naming it by the
				 * whole card would announce the blurb and the seed as a paragraph.
				 */
				button.setAttribute("aria-label", `${hint}: ${manifest.name}`);
				button.append(preview);
				button.addEventListener("click", () => void this.#activate());
				frame.append(button);
			} else {
				frame.append(preview);
				if (deprecatedCard && pageUrl) {
					frame.append(el("div", { class: "tb-foot" }, el("a", { href: pageUrl }, "Open the full tool")));
				}
			}
			fill(this.#root, frame);
			this.#reapplyStyles();
			return;
		}

		// Active: the form, the actions, the status line, the output.
		const inputs = compact ? primaryOnly(manifest.inputs) : manifest.inputs;
		const form = el("fieldset", { class: "tb-form" });
		this.#controls.clear();
		for (const spec of inputs) form.append(this.#control(spec));

		const run = el("button", { class: "tb-run", type: "button" }, "Run");
		run.addEventListener("click", () => void this.#run({ focusResult: true }));
		// Hidden until a run outlasts SLOW_MS. A bar that flashes for 20 ms is noise.
		const progress = el("div", { class: "tb-progress", "aria-hidden": "true", hidden: true }, el("i", { style: "width:0%" }));
		/*
		 * Seeded with the last line, so a repaint keeps its explanation. Without it, a redrawn seed loses
		 * the "showing the default result" label and becomes the silent revert this was meant to fix.
		 *
		 * ⚠️ Set here, at creation, and not after `fill`. A live region announces when its content changes
		 * while it is in the document, so assigning the same text afterwards would have a screen reader
		 * re-read the line every time a host touched an attribute. Content present before insertion is not
		 * announced, which is the behaviour wanted: restore it silently, announce only what is new.
		 */
		const status = el("p", { class: "tb-status", role: "status", "aria-live": "polite" }, this.#status);
		/*
		 * ⚠️ A second live region, and this one is never seen.
		 *
		 * A result summary, "6 fields, chart, 2 series, table, 5 rows", is exactly what a screen reader needs
		 * and exactly what a sighted reader does not: it rendered above the result as a line of metadata that
		 * reads like debug output, describing something already on screen. Announcing it here and leaving the
		 * visible line for what a reader can act on, "press Run", "inputs changed", an error, keeps both
		 * audiences served without either paying for the other.
		 */
		const announce = el("p", { class: "tb-announce tb-sr", role: "status", "aria-live": "polite" });
		const output = el("div", { class: "tb-output", tabindex: "-1" });

		this.#els = { run, progress, status, announce, output };
		const embedMark = mode === "embed" ? lifecycleMark(lifecycleStatus(manifest)) : null;
		if (embedMark) body.append(embedMark);
		body.append(form);
		/*
		 * Not on a card. A card has room for one input and a Run button, and a row of buttons would crowd
		 * out the result the card exists to show.
		 */
		const samples = manifest.samples ?? [];
		if (!compact && samples.length > 0) body.append(this.#sampleRow(samples));
		body.append(el("div", { class: "tb-actions" }, run, progress), status, announce, output);
		frame.append(body);

		if (mode !== "card" && (manifest.links?.length ?? 0) > 0) {
			frame.append(
				el(
					"div",
					{ class: "tb-foot" },
					...(manifest.links ?? []).map((link) => el("a", { href: link.href, rel: "noopener" }, link.label)),
				),
			);
		}
		if (compact && pageUrl) {
			frame.append(el("div", { class: "tb-foot" }, el("a", { href: pageUrl }, "Open the full tool")));
		}

		fill(this.#root, frame);
		this.#reapplyStyles();
		/*
		 * Whatever was on screen goes back on screen. The seed is only the starting point for a host that
		 * has never run: once there is a real result, a partial or an error, redrawing the seed instead
		 * would replace the reader's answer with the defaults' and say nothing about it.
		 */
		const fromSeed = this.#shown === undefined;
		const redraw = this.#shown ?? this.#seed;
		if (redraw) this.#draw(redraw);
		/*
		 * `#draw` records what it drew, and the seed must not count. Otherwise the first paint of a seeded
		 * host makes `#shown` non-empty, and every later check of "has this host ever produced a result"
		 * answers yes when the reader has not pressed anything.
		 */
		if (fromSeed) this.#shown = undefined;
		/*
		 * A host that prefilled before the form existed has just had that seed drawn. The seed is
		 * the defaults' result, not the prefilled inputs', so it is already stale. Mark it the
		 * same way a keystroke would, now that the result area exists to carry the mark.
		 *
		 * Only for the seed. A result the reader ran is not stale just because the element repainted,
		 * and marking it would claim the form had changed when only an attribute did.
		 */
		if (this.#hostWroteValues && fromSeed) this.#markStale();
	}

	#reapplyStyles(): void {
		// `fill` on the shadow root clears an appended <style> fallback; adopted sheets survive.
		if (!("adoptedStyleSheets" in this.#root) || this.#root.adoptedStyleSheets.length === 0) applyStyles(this.#root);
	}

	#reflectStatus(manifest: Manifest): void {
		const status = lifecycleStatus(manifest);
		if (status === "live") this.removeAttribute("data-status");
		else this.setAttribute("data-status", status);
	}

	#paintRetired(manifest: Manifest): void {
		this.#els = {};
		this.#activated = false;
		this.#loading = false;
		const mode = this.mode;
		const compact = mode === "card";
		const pageUrl = config?.pageUrl?.(manifest.id);
		const links = manifest.links ?? [];
		const frame = el("div", { class: "tb" });
		if (mode !== "embed") {
			frame.append(
				el(
					"div",
					{ class: "tb-head" },
					titleRow(manifest, compact, pageUrl),
					mode === "page" ? el("p", { class: "tb-blurb" }, manifest.blurb) : null,
				),
			);
		}
		const explanation =
			links.length > 0
				? "This tool has been retired and no longer runs. The links below are the way onward."
				: "This tool has been retired and no longer runs.";
		frame.append(
			el(
				"div",
				{ class: "tb-body" },
				mode === "page" ? null : el("p", { class: "tb-blurb" }, manifest.blurb),
				mode === "embed" ? lifecycleMark("retired") : null,
				el("p", { class: "tb-retired", role: "status" }, explanation),
			),
		);
		if (links.length > 0) {
			frame.append(
				el("div", { class: "tb-foot" }, ...links.map((link) => el("a", { href: link.href, rel: "noopener" }, link.label))),
			);
		}
		fill(this.#root, frame);
		this.#reapplyStyles();
	}

	#control(spec: InputSpec): HTMLElement {
		const id = `in-${spec.id}`;
		const describedBy: string[] = [];
		const label = el("label", { class: "tb-label", for: id }, spec.label, spec.unit ? el("span", { class: "tb-unit" }, ` (${spec.unit})`) : null);
		const row = el("div", { class: "tb-field-row" });
		const desc = spec.description ? el("p", { class: "tb-desc", id: `${id}-desc` }, spec.description) : null;
		if (desc) describedBy.push(`${id}-desc`);
		const errorId = `${id}-err`;

		let control: HTMLElement;
		switch (spec.type) {
			case "textarea": {
				const area = el("textarea", {
					class: "tb-textarea",
					id,
					rows: spec.rows ?? 3,
					spellcheck: "false",
					autocapitalize: "off",
					autocomplete: "off",
					dir: spec.dir ?? "auto",
					...(spec.maxLength !== undefined ? { maxlength: spec.maxLength } : {}),
				});
				area.value = String(this.#values[spec.id] ?? spec.default);
				area.addEventListener("input", () => {
					this.#values[spec.id] = area.value;
					this.#inputChanged();
				});
				control = area;
				break;
			}
			case "select": {
				const select = el("select", { class: "tb-select", id });
				for (const option of spec.options) {
					const o = el("option", { value: option.value }, option.label);
					if (option.value === String(this.#values[spec.id] ?? spec.default)) o.selected = true;
					select.append(o);
				}
				select.addEventListener("change", () => {
					this.#values[spec.id] = select.value;
					this.#inputChanged();
				});
				control = select;
				break;
			}
			case "toggle": {
				const box = el("input", { class: "tb-checkbox", id, type: "checkbox" });
				box.checked = Boolean(this.#values[spec.id] ?? spec.default);
				box.addEventListener("change", () => {
					this.#values[spec.id] = box.checked;
					this.#inputChanged();
				});
				control = box;
				break;
			}
			case "number": {
				const input = el("input", {
					class: "tb-input",
					id,
					type: "number",
					min: spec.min,
					max: spec.max,
					...(spec.step !== undefined ? { step: spec.step } : {}),
					inputmode: "decimal",
					dir: "ltr",
				});
				input.value = String(this.#values[spec.id] ?? spec.default);
				input.addEventListener("input", () => {
					// Clamped here, not in the tool: min and max are the only guard against an input
					// that turns a bounded computation into an unbounded one.
					this.#values[spec.id] = coerce(spec, input.value);
					this.#inputChanged();
				});
				control = input;
				break;
			}
			default: {
				const input = el("input", {
					class: "tb-input",
					id,
					type: "text",
					spellcheck: "false",
					autocapitalize: "off",
					autocomplete: "off",
					dir: spec.dir ?? "auto",
					...(spec.maxLength !== undefined ? { maxlength: spec.maxLength } : {}),
				});
				input.value = String(this.#values[spec.id] ?? spec.default);
				input.addEventListener("input", () => {
					this.#values[spec.id] = input.value;
					this.#inputChanged();
				});
				control = input;
				break;
			}
		}

		/*
		 * Enter runs from a single-line control; a textarea needs a modifier, because Enter there is a
		 * newline. Without this, a keyboard user has to tab past every remaining input to reach Run.
		 */
		control.addEventListener("keydown", (event) => {
			const key = event as KeyboardEvent;
			if (key.key !== "Enter") return;
			const needsModifier = spec.type === "textarea";
			if (needsModifier && !(key.metaKey || key.ctrlKey)) return;
			key.preventDefault();
			void this.#run({ focusResult: true });
		});

		control.setAttribute("aria-describedby", [...describedBy, errorId].join(" "));
		this.#controls.set(spec.id, control);

		if (spec.type === "toggle") {
			row.append(el("div", { class: "tb-toggle-row" }, control, label));
			if (desc) row.append(desc);
		} else {
			row.append(label, control);
			if (desc) row.append(desc);
		}
		// The per-input error slot: empty until a result names this input.
		row.append(el("p", { class: "tb-sr", id: errorId }));
		return row;
	}

	/**
	 * The examples row.
	 *
	 * Under the whole form rather than under one input. A sample may set several values, and a row
	 * sitting beneath one control claims to fill that control while quietly changing another further
	 * down the form.
	 */
	#sampleRow(samples: Sample[]): HTMLElement {
		const labelId = "tb-samples-label";
		// A visible "Try:" doubling as the group's accessible name, rather than an aria-label repeating
		// it invisibly and drifting from it the first time either changes.
		const row = el("div", { class: "tb-samples", role: "group", "aria-labelledby": labelId });
		row.append(el("span", { class: "tb-samples-label", id: labelId }, "Try:"));
		for (const sample of samples) {
			const button = el("button", { class: "tb-sample", type: "button" }, sample.label);
			button.addEventListener("click", () => this.#applySample(sample));
			row.append(button);
		}
		return row;
	}

	/**
	 * Fill the form from a sample.
	 *
	 * Deliberately the same path a keystroke takes: values in, controls updated, then `#inputChanged`.
	 * So a normal tool marks its result stale and an `autoRun` tool re-runs, which is what "a sample
	 * behaves exactly as typing does" has to mean. Treating it as the one input change that never runs
	 * would make it an exception to the rule it follows.
	 *
	 * ⚠️ Every input the sample names is applied, including one a compact card would not have rendered.
	 * That is safe only because the row is never drawn on a card: applying to visible controls alone
	 * would fill the form differently from how the sample reads, and applying invisibly would leave the
	 * form describing something other than what Run will use. Relaxing the card rule means resolving
	 * that first.
	 */
	#applySample(sample: Sample): void {
		this.#values = applyPartialValues(this.#manifest?.inputs ?? [], this.#values, sample.input);
		this.#syncControls();
		/*
		 * It is tempting to clear `aria-invalid` here, on the control the last error named. Deliberately
		 * not done: typing does not clear it either, and the error is still on screen, dimmed as stale.
		 * Clearing the marker without removing the message would leave the screen and the screen reader
		 * disagreeing about whether there is an error, and it would make a sample the one input change
		 * that behaves differently from the rest. The next run replaces the result and the marker
		 * together.
		 */
		this.#inputChanged();
		/*
		 * `#markStale` has just said "inputs changed — press Run". Naming the sample is more use than
		 * that, and it is the only confirmation a screen-reader user gets that the click did anything. An
		 * `autoRun` tool is already announcing its own run, so leave that one alone.
		 */
		if (this.#manifest?.autoRun !== true) this.#say(`filled with "${sample.label}" — press Run`);
	}

	/**
	 * Apply a host-set partial. Same write path as a sample, then stale, never a run.
	 *
	 * Typing on an `autoRun` tool would debounce-run. A host example button must not: `run()` is
	 * how the host says it wanted that. Sharing `#inputChanged` here would make `values` a hidden
	 * trigger on every instant tool.
	 */
	#applyHostValues(partial: InputValues): void {
		this.#values = applyPartialValues(this.#manifest?.inputs ?? [], this.#values, partial);
		this.#syncControls();
		this.#hostWroteValues = true;
		if (this.#els.output) this.#markStale();
	}

	#syncControls(): void {
		for (const spec of this.#manifest?.inputs ?? []) {
			const control = this.#controls.get(spec.id);
			if (!control) continue;
			const next = this.#values[spec.id];
			if (spec.type === "toggle") (control as HTMLInputElement).checked = Boolean(next);
			else (control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = String(next ?? "");
		}
	}

	// --- output plumbing --------------------------------------------------------------------------

	#draw(output: Output): void {
		const target = this.#els.output;
		if (!target) return;
		// Recorded before the render, so a kind this build cannot draw still survives a repaint as the
		// same "this build cannot draw it" message rather than silently becoming the seed.
		this.#shown = output;
		const manifest = this.#manifest;
		const compact = this.mode === "card";
		try {
			fill(
				target,
				render(
					output,
					withHostHighlight({
						compact,
						cardParts: this.cardParts,
						...(manifest?.cardFields !== undefined ? { cardFields: manifest.cardFields } : {}),
					}),
				),
			);
		} catch (error) {
			if (error instanceof ChartRendererMissing) {
				/*
				 * A `series` from a tool that did not declare it in `kinds`, so `#prepare` had no reason to
				 * preload. Load and draw again rather than telling a reader the shape cannot be drawn, which
				 * would be false. One frame late is the cost of a manifest that understated itself.
				 */
				void loadChartRenderer().then(() => this.#draw(output));
				return;
			}
			// A kind this build cannot draw: an old runtime meeting a newer tool.
			fill(target, unknownOutput(output.kind));
		}
	}

	#markInvalid(inputId: string | undefined): void {
		for (const [id, control] of this.#controls) {
			const invalid = id === inputId;
			control.toggleAttribute("aria-invalid", invalid);
			if (invalid) control.setAttribute("aria-invalid", "true");
			const slot = this.#root.getElementById(`in-${id}-err`);
			if (slot) slot.textContent = invalid ? (this.#els.status?.textContent ?? "") : "";
		}
	}

	#setBusy(busy: boolean): void {
		this.#els.output?.setAttribute("data-state", busy ? "running" : "idle");
		this.#els.output?.setAttribute("aria-busy", String(busy));
		if (this.#els.run) this.#els.run.disabled = busy;

		if (this.#slowTimer) clearTimeout(this.#slowTimer);
		this.#slowTimer = undefined;
		if (busy) {
			/*
			 * Reveal the bar only if the run is still going after SLOW_MS. Most runs finish in single-digit
			 * milliseconds, and a progress bar that appears and vanishes in that time is worse than none:
			 * it draws the eye to report that nothing happened.
			 */
			this.#slowTimer = setTimeout(() => this.#els.progress?.removeAttribute("hidden"), SLOW_MS);
		} else {
			this.#els.progress?.setAttribute("hidden", "");
			this.#setProgress(0);
		}
	}

	#setProgress(fraction: number): void {
		const bar = this.#els.progress?.firstElementChild as HTMLElement | null;
		if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
	}

	/**
	 * The visible line: what a reader can act on. Prompts, and errors.
	 *
	 * Deliberately not the whole result — see the note at the top of this file.
	 */
	#say(message: string): void {
		// Kept so `#paint` can put it back. The status is what stops a redrawn seed being silent: without
		// it a repainted seeded host shows the defaults' answer with nothing saying whose inputs it is.
		this.#status = message;
		if (this.#els.status) this.#els.status.textContent = message;
	}

	/**
	 * The unseen line: what a result was, for anyone who cannot see it.
	 *
	 * Also clears the visible line, because after a run the result itself is the feedback and a summary of
	 * something on screen is noise.
	 */
	#announce(message: string): void {
		if (this.#els.announce) this.#els.announce.textContent = message;
		this.#say("");
	}

	#readInlineSeed(): void {
		const script = this.querySelector('script[type="application/json"][data-toolbench-seed]');
		if (!script?.textContent) return;
		try {
			this.#seed = JSON.parse(script.textContent) as Output;
		} catch {
			console.warn("[toolbench] a seed script was present but is not valid JSON; ignoring it.");
		}
	}

	#fatal(message: string): void {
		this.removeAttribute("data-status");
		const message_el = el("div", { class: "tb-out-error", role: "alert" }, el("span", { class: "tb-error-message" }, message));
		fill(this.#root, el("div", { class: "tb" }, el("div", { class: "tb-body" }, message_el)));
		this.#reapplyStyles();
	}
}

function lifecycleStatus(manifest: Manifest): NonNullable<Manifest["status"]> {
	return manifest.status ?? "live";
}

function lifecycleMark(status: NonNullable<Manifest["status"]>): HTMLElement | null {
	if (status === "deprecated") return el("span", { class: "tb-mark", "data-status": "deprecated" }, "Deprecated");
	if (status === "retired") return el("span", { class: "tb-mark", "data-status": "retired" }, "Retired");
	return null;
}

function titleRow(manifest: Manifest, compact: boolean, pageUrl: string | undefined): HTMLElement {
	const name = el("h3", { class: "tb-name" }, pageUrl && compact ? el("a", { href: pageUrl }, manifest.name) : manifest.name);
	const mark = lifecycleMark(lifecycleStatus(manifest));
	return mark ? el("div", { class: "tb-title" }, name, mark) : name;
}

/**
 * Thread the host highlighter into a render call without writing `highlight: undefined`.
 * `exactOptionalPropertyTypes` refuses that, and omitting the key is what "no hook" means.
 */
function withHostHighlight(options: RenderOptions): RenderOptions {
	const highlight = config?.highlight;
	return highlight ? { ...options, highlight } : options;
}

/**
 * The inputs a compact card shows: every one marked `primary`, or the first if none is.
 *
 * ⚠️ This used to take exactly one, with `find` rather than `filter`, and that made `primary` a boolean
 * whose second use was silently ignored. A manifest saying three inputs are primary got one, with nothing
 * to say why. `primary` reads as "worth showing when space is short", and a tool whose question needs two
 * numbers to be worth asking could not express it.
 *
 * Behaviour is unchanged for a manifest marking one input, or none, which is every tool that exists today.
 */
function primaryOnly(inputs: InputSpec[]): InputSpec[] {
	const primary = inputs.filter((input) => input.primary === true);
	return primary.length > 0 ? primary : inputs.slice(0, 1);
}

/** A one-line description of a result, for the status region. Never the result itself. */
function summarise(output: Output, brief = false): string {
	switch (output.kind) {
		case "fields":
			return `${output.fields.length} field${output.fields.length === 1 ? "" : "s"}`;
		case "table":
			return `table, ${output.rows.length} row${output.rows.length === 1 ? "" : "s"}`;
		case "series":
			return `chart, ${output.chart.series.length} series`;
		case "bytes": {
			// The named ranges are the useful part: "84 bytes" tells a screen-reader user nothing they
			// can act on, whereas the field names are the reason they ran the tool.
			const named = output.highlight?.length ?? 0;
			const size = `${output.bytes.length} byte${output.bytes.length === 1 ? "" : "s"}`;
			/*
			 * "ranges", not "fields". The first wording made a group of fields plus bytes announce
			 * itself as "4 fields, 19 bytes, 4 fields marked", where the two counts of "fields" meant
			 * different things and neither was wrong on its own.
			 */
			return named > 0 ? `${size}, ${named} range${named === 1 ? "" : "s"} marked` : size;
		}
		case "text":
		case "code":
			return "result ready";
		case "group": {
			// On a card only the first part is rendered, so announcing all of them would describe
			// something the reader cannot see.
			const parts = brief ? output.parts.slice(0, 1) : output.parts;
			return parts.map((part) => summarise(part, brief)).join(", ");
		}
		case "error":
			return `error: ${output.message}`;
	}
}
