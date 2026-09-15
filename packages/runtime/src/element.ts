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
import type { InputSpec, InputValues, Manifest, Output } from "@toolbench/sdk";
import { el, fill } from "./dom.ts";
import { render, unknownOutput } from "./render/index.ts";
import { ToolCrashError, ToolTimeoutError, WorkerUnavailableError } from "./protocol.ts";
import { isSuperseded, Runner, type Runnable } from "./runner.ts";
import { type ToolSource } from "./sources.ts";
import { applyStyles } from "./styles.ts";

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
}

let config: ToolHostConfig | undefined;

/** Defines the element. Call once, with the source your host provides. */
export function defineToolHost(options: ToolHostConfig, tagName = "tool-host"): void {
	config = options;
	if (typeof customElements === "undefined") return;
	if (!customElements.get(tagName)) customElements.define(tagName, ToolHost);
}

export class ToolHost extends HTMLElement {
	static readonly observedAttributes = ["tool", "mode"];

	#root: ShadowRoot;
	#runner: Runner | undefined;
	#loaded: Runnable | undefined;
	#manifest: Manifest | undefined;
	#values: InputValues = {};
	#observer: IntersectionObserver | undefined;
	#debounce: ReturnType<typeof setTimeout> | undefined;
	#slowTimer: ReturnType<typeof setTimeout> | undefined;
	#activated = false;
	/** True between "the reader asked for this" and "the tool's code is here". */
	#loading = false;
	#seed: Output | undefined;
	#controls = new Map<string, HTMLElement>();
	#els: {
		output?: HTMLElement;
		status?: HTMLElement;
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

	get mode(): Mode {
		const mode = this.getAttribute("mode");
		return mode === "card" || mode === "embed" ? mode : "page";
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
		void this.#prepare();
	}

	disconnectedCallback(): void {
		/*
		 * ⚠️ This is what stops a worker leaking. On a site with client-side navigation the element is
		 * removed rather than the page reloaded, and a worker with no owner survives at a few megabytes
		 * each. Nothing else in the system will clean it up.
		 */
		this.#runner?.dispose();
		this.#runner = undefined;
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
			void this.#prepare();
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
			this.#values = Object.fromEntries(manifest.inputs.map((input) => [input.id, input.default]));
			this.#paint();

			if (this.mode === "card") return; // waits for a click
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
		if (this.#activated || !this.#manifest || !config) return;
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
			this.#loaded = await this.#resolve(config);
			this.#runner = new Runner(config.workerFactory ? { workerFactory: config.workerFactory } : {});
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
			 */
			this.#say(this.#seed ? "showing the default result — press Run to try your own" : "press Run");
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
			this.#say(summarise(output, this.mode === "card"));
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
		const mode = this.mode;
		const compact = mode === "card";
		const pageUrl = config?.pageUrl?.(manifest.id);

		const body = el("div", { class: "tb-body" });
		const frame = el("div", { class: "tb" });

		if (mode !== "embed") {
			frame.append(
				el(
					"div",
					{ class: "tb-head" },
					el("h3", { class: "tb-name" }, pageUrl && compact ? el("a", { href: pageUrl }, manifest.name) : manifest.name),
					mode === "page" ? el("p", { class: "tb-blurb" }, manifest.blurb) : null,
				),
			);
		}

		if (!this.#activated || this.#loading) {
			// The facade: static, and clickable only in card mode.
			const preview = el(
				"div",
				{ class: "tb-body" },
				mode === "page" ? null : el("p", { class: "tb-blurb" }, manifest.blurb),
				this.#seed ? render(this.#seed, { compact, ...(manifest.cardFields !== undefined ? { cardFields: manifest.cardFields } : {}) }) : null,
				el("span", { class: "tb-facade-hint" }, this.#loading ? "loading…" : this.#seed ? "Try it" : "Open this tool"),
			);
			if (compact && !this.#loading) {
				const button = el("button", { class: "tb-facade", type: "button" });
				button.setAttribute("aria-label", `Open ${manifest.name}`);
				button.append(preview);
				button.addEventListener("click", () => void this.#activate());
				frame.append(button);
			} else {
				frame.append(preview);
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
		const status = el("p", { class: "tb-status", role: "status", "aria-live": "polite" });
		const output = el("div", { class: "tb-output", tabindex: "-1" });

		this.#els = { run, progress, status, output };
		body.append(form, el("div", { class: "tb-actions" }, run, progress), status, output);
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
		if (this.#seed) this.#draw(this.#seed);
	}

	#reapplyStyles(): void {
		// `fill` on the shadow root clears an appended <style> fallback; adopted sheets survive.
		if (!("adoptedStyleSheets" in this.#root) || this.#root.adoptedStyleSheets.length === 0) applyStyles(this.#root);
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
					const value = Number(input.value);
					// Clamped here, not in the tool: min and max are the only guard against an input
					// that turns a bounded computation into an unbounded one.
					this.#values[spec.id] = Number.isFinite(value) ? Math.min(spec.max, Math.max(spec.min, value)) : spec.default;
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

	// --- output plumbing --------------------------------------------------------------------------

	#draw(output: Output): void {
		const target = this.#els.output;
		if (!target) return;
		const manifest = this.#manifest;
		const compact = this.mode === "card";
		try {
			fill(
				target,
				render(output, {
					compact,
					...(manifest?.cardFields !== undefined ? { cardFields: manifest.cardFields } : {}),
				}),
			);
		} catch {
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

	/** The short announcement. Deliberately not the whole result — see the note at the top. */
	#say(message: string): void {
		if (this.#els.status) this.#els.status.textContent = message;
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
		const message_el = el("div", { class: "tb-out-error", role: "alert" }, el("span", { class: "tb-error-message" }, message));
		fill(this.#root, el("div", { class: "tb" }, el("div", { class: "tb-body" }, message_el)));
		this.#reapplyStyles();
	}
}

function primaryOnly(inputs: InputSpec[]): InputSpec[] {
	const primary = inputs.find((input) => input.primary === true);
	return primary ? [primary] : inputs.slice(0, 1);
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
